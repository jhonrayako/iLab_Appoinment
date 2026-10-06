const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth');
const feedbackService = require('../services/feedbackService');
const { query } = require('../config/db');
const { sendToUser, sendToSession, broadcastToRole } = require('../realtime/socket');
const { getFallbackReply, matchFAQ: findFAQMatch } = require('../services/chatbotNlp');

const isOfficeHours = (date = new Date()) => {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
  return hour >= 8 && hour < 17;
};

const getPublicAnswer = async (question) => {
  const faqResponse = await matchFAQ(question);
  return faqResponse.answer;
};

const getOrCreateConversation = async ({ userId = null, sessionId = null }) => {
  const existing = await query(
    `SELECT conversation_id, user_id, session_id, status
     FROM chat_conversations
     WHERE status = 'open' AND ((user_id = $1 AND $1 IS NOT NULL) OR (session_id = $2 AND $2 IS NOT NULL))
     ORDER BY created_at DESC LIMIT 1`,
    [userId, sessionId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await query(
    `INSERT INTO chat_conversations (user_id, session_id)
     VALUES ($1, $2)
     RETURNING conversation_id, user_id, session_id, status`,
    [userId, sessionId]
  );
  return created.rows[0];
};

const addMessage = async ({ conversationId, senderType, senderId = null, message }) => {
  const result = await query(
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
     VALUES ($1, $2, $3, $4)
     RETURNING message_id, conversation_id, sender_type, sender_id, message, created_at`,
    [conversationId, senderType, senderId, message]
  );
  await query('UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE conversation_id = $1', [conversationId]);
  return result.rows[0];
};

const resolveSessionId = (req) => {
  const explicit = req.query?.sessionId || req.query?.session_id || req.body?.sessionId || req.body?.session_id || null;
  return explicit ? String(explicit) : null;
};

const getConversationForMessageAccess = async (req, sessionId = null) => {
  const result = await query(
    'SELECT conversation_id, user_id, session_id FROM chat_conversations WHERE conversation_id = $1',
    [req.params.id]
  );
  const conversation = result.rows[0];
  if (!conversation) throw new HttpError(404, 'Conversation not found');

  const resolvedSessionId = sessionId || resolveSessionId(req);
  if (!req.user && !resolvedSessionId) throw new HttpError(401, 'Authentication or session is required');

  const isAdmin = req.user?.role_name === 'Admin';
  const ownsConversation = (req.user?.sub && req.user.sub === conversation.user_id)
    || (resolvedSessionId && resolvedSessionId === conversation.session_id);
  if (!isAdmin && !ownsConversation) throw new HttpError(403, 'You cannot access this conversation');

  return conversation;
};

const broadcastMessageChange = (conversation, eventType, payload) => {
  if (conversation.user_id) sendToUser(conversation.user_id, eventType, payload);
  if (conversation.session_id) sendToSession(conversation.session_id, eventType, payload);
  broadcastToRole('Admin', eventType, payload);
};

router.get('/status', (req, res) => {
  const officeHours = isOfficeHours();
  res.status(200).json({
    success: true,
    office_hours: officeHours,
    automated_hours: '24/7',
    office_hours_label: '08:00 - 17:00',
    automation: {
      enabled: true,
      effectiveEnabled: true,
      alwaysOn: true,
      nighttime: !officeHours,
      officeHours,
    },
  });
});

router.post(
  '/conversations/messages',
  optionalAuth,
  [body('message').trim().notEmpty().withMessage('Message cannot be empty'), body('sessionId').optional().trim()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const { message, sessionId = null } = req.body;
    const conversation = await getOrCreateConversation({ userId: req.user?.sub || null, sessionId });
    const visitorMessage = await addMessage({ conversationId: conversation.conversation_id, senderType: 'visitor', senderId: req.user?.sub || null, message });

    const officeHours = isOfficeHours();
    const publicAnswer = await getPublicAnswer(message);
    const botMessage = await addMessage({
      conversationId: conversation.conversation_id,
      senderType: 'bot',
      message: publicAnswer,
    });

    broadcastToRole('Admin', 'visitor_message', {
      conversation_id: conversation.conversation_id,
      message: visitorMessage,
    });
    broadcastToRole('Admin', 'visitor_message', {
      conversation_id: conversation.conversation_id,
      message: botMessage,
    });

    return res.status(201).json({
      success: true,
      office_hours: officeHours,
      conversation_id: conversation.conversation_id,
      messages: [visitorMessage, botMessage],
      ...(officeHours ? { notice: 'Your message was answered automatically and shared with the iLAB administrator for follow-up.' } : {}),
    });
  })
);

router.get('/conversations', requireAuth, requireRole('Admin'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.conversation_id, c.user_id, c.session_id, c.status, c.last_message_at,
            u.username, u.first_name, u.last_name,
            (SELECT message FROM chat_messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) AS latest_message
     FROM chat_conversations c
     LEFT JOIN users u ON u.user_id = c.user_id
     WHERE c.status = 'open'
     ORDER BY c.last_message_at DESC`
  );
  res.status(200).json({ success: true, conversations: result.rows });
}));

router.delete('/conversations/:id', optionalAuth, asyncHandler(async (req, res) => {
  const conversation = await getConversationForMessageAccess(req, req.query.sessionId);
  const result = await query(
    'DELETE FROM chat_conversations WHERE conversation_id = $1 RETURNING conversation_id',
    [req.params.id]
  );

  if (!result.rows[0]) throw new HttpError(404, 'Conversation not found');
  broadcastMessageChange(conversation, 'chatbot_conversation_deleted', {
    conversation_id: result.rows[0].conversation_id,
  });
  res.status(200).json({ success: true, conversation_id: result.rows[0].conversation_id });
}));

router.get('/conversations/:id/messages', optionalAuth, asyncHandler(async (req, res) => {
  await getConversationForMessageAccess(req, req.query.sessionId);
  const result = await query(
    `SELECT message_id, conversation_id, sender_type, sender_id, message, created_at
     FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.status(200).json({ success: true, messages: result.rows });
}));

router.put(
  '/conversations/:id/messages/:messageId',
  optionalAuth,
  [body('message').trim().notEmpty().withMessage('Message cannot be empty'), body('sessionId').optional().trim()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const conversation = await getConversationForMessageAccess(req, req.body.sessionId);
    const result = await query(
      `UPDATE chat_messages
       SET message = $1
       WHERE message_id = $2 AND conversation_id = $3
       RETURNING message_id, conversation_id, sender_type, sender_id, message, created_at`,
      [req.body.message, req.params.messageId, req.params.id]
    );
    if (!result.rows[0]) throw new HttpError(404, 'Message not found');

    const payload = { conversation_id: req.params.id, message: result.rows[0] };
    broadcastMessageChange(conversation, 'chatbot_message_updated', payload);
    res.status(200).json({ success: true, message: result.rows[0] });
  })
);

router.delete(
  '/conversations/:id/messages/:messageId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const conversation = await getConversationForMessageAccess(req, req.query.sessionId);
    const result = await query(
      `DELETE FROM chat_messages
       WHERE message_id = $1 AND conversation_id = $2
       RETURNING message_id, conversation_id`,
      [req.params.messageId, req.params.id]
    );
    if (!result.rows[0]) throw new HttpError(404, 'Message not found');

    await query(
      `UPDATE chat_conversations
       SET last_message_at = COALESCE(
         (SELECT MAX(created_at) FROM chat_messages WHERE conversation_id = $1),
         NOW()
       ), updated_at = NOW()
       WHERE conversation_id = $1`,
      [req.params.id]
    );
    const payload = { conversation_id: req.params.id, message_id: result.rows[0].message_id };
    broadcastMessageChange(conversation, 'chatbot_message_deleted', payload);
    res.status(200).json({ success: true, message_id: result.rows[0].message_id });
  })
);

router.post(
  '/conversations/:id/reply',
  requireAuth,
  requireRole('Admin'),
  [body('message').trim().notEmpty().withMessage('Reply cannot be empty')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const conversationResult = await query(
      'SELECT conversation_id, user_id, session_id FROM chat_conversations WHERE conversation_id = $1',
      [req.params.id]
    );
    if (!conversationResult.rows[0]) throw new HttpError(404, 'Conversation not found');
    const reply = await addMessage({ conversationId: req.params.id, senderType: 'admin', senderId: req.user.sub, message: req.body.message });
    const { user_id: userId, session_id: sessionId } = conversationResult.rows[0];
    if (userId) sendToUser(userId, 'chatbot_reply', reply);
    if (sessionId) sendToSession(sessionId, 'chatbot_reply', reply);
    res.status(201).json({ success: true, message: reply });
  })
);

const matchFAQ = async (question) => {
  const normalizedQuestion = String(question || '').trim();
  if (!normalizedQuestion) return { found: false, answer: 'Please ask a question so I can help you.' };
  const result = await query(
    `
      SELECT faq_id, question, answer, keywords, training_phrases, category
      FROM chatbot_faq
      WHERE is_active = true
      ORDER BY created_at ASC
    `
  );

  const bestMatch = findFAQMatch(normalizedQuestion, result.rows);
  if (bestMatch) {
    return { found: true, answer: bestMatch.answer, category: bestMatch.category };
  }

  return {
    found: false,
    answer: getFallbackReply(normalizedQuestion),
  };
};

/**
 * POST /chatbot/faq
 * Answer a general FAQ question (guest or authenticated)
 */
router.post(
  '/faq',
  optionalAuth,
  [
    body('question').trim().notEmpty().withMessage('Question cannot be empty'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { question } = req.body;
    const response = await matchFAQ(question);

    res.status(200).json({
      success: true,
      question,
      response: response.answer,
      found: response.found,
      category: response.category || null,
    });
  })
);

/**
 * GET /chatbot/gated-action-response
 * Response when guest tries to access gated actions (visit letter, feedback)
 */
router.get(
  '/gated-action-response',
  [
    // (No validation needed - canned response)
  ],
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      message: 'This action requires an account.',
      response:
        'To create a visit letter or submit feedback, please log in or create a free account.',
      prompt_auth: true,
      actions: [
        { label: 'Login', url: '/login' },
        { label: 'Register', url: '/register' },
      ],
    });
  })
);

/**
 * POST /chatbot/feedback
 * Chatbot feedback endpoint (authenticated Visitors only)
 * Calls feedbackService.submitFeedback directly - NO duplicate logic
 */
router.post(
  '/feedback',
  requireAuth,
  [
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Feedback must be 1 to 2000 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    // Verify user is a Visitor
    if (req.user.role_name !== 'Visitor') {
      throw new HttpError(403, 'Only Visitors can submit feedback');
    }

    const { message } = req.body;

    // Use the standard feedback service - no duplication
    const feedback = await feedbackService.submitFeedback({
      userId: req.user.sub,
      rawMessage: message,
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback!',
      feedback: {
        feedback_id: feedback.feedback_id,
        sentiment: feedback.sentiment_label,
        received_at: feedback.submitted_at,
      },
    });
  })
);

module.exports = router;
