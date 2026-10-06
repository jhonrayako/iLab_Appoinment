const http = require('http');
const request = require('supertest');
const WebSocket = require('ws');
const { query, pool } = require('../src/config/db');
const app = require('../src/app');
const { initRealtime, closeAll, broadcastToRole } = require('../src/realtime/socket');
const { signToken } = require('../src/utils/jwt');

afterAll(async () => {
  await pool.end();
});

describe('Chatbot FAQ API', () => {
  it('answers a question using data stored in the chatbot FAQ table', async () => {
    const question = 'How can I book a research visit?';
    const answer = 'Use the visitor portal to select a facility and date, then confirm the appointment request.';

    await query(`
      INSERT INTO chatbot_faq (question, answer, keywords, category, is_active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (question) DO UPDATE SET answer = EXCLUDED.answer, keywords = EXCLUDED.keywords, category = EXCLUDED.category, is_active = true
    `, [question, answer, ['book', 'research', 'visit', 'appointment'], 'booking']);

    const res = await request(app)
      .post('/api/chatbot/faq')
      .send({ question });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.found).toBe(true);
    expect(res.body.response).toBe(answer);
  });

  it.each([[8, true], [22, false]])('answers automatically at %s:30 Manila time', async (hour, officeHours) => {
    const RealDate = global.Date;
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          return new RealDate(`2026-09-23T${String(hour).padStart(2, '0')}:30:00+08:00`);
        }
        return new RealDate(...args);
      }

      static now() {
        return new RealDate(`2026-09-23T${String(hour).padStart(2, '0')}:30:00+08:00`).getTime();
      }
    };

    try {
      const question = 'Where is iLAB Guiguinto located?';
      const expectedMessage = 'iLAB Guiguinto is located in Guiguinto, Bulacan, Philippines.';

      const res = await request(app)
        .post('/api/chatbot/conversations/messages')
        .send({ message: question, sessionId: 'night-session-24x7' });

      expect(res.status).toBe(201);
      expect(res.body.office_hours).toBe(officeHours);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[1].message).toBe(expectedMessage);
      if (officeHours) expect(res.body.notice).toContain('answered automatically');
    } finally {
      global.Date = RealDate;
    }
  });

  it('sends admin replies to session-based visitors automatically', async () => {
    const server = http.createServer();
    initRealtime(server);

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const adminUserResult = await query(`SELECT user_id FROM users WHERE username = 'admin' LIMIT 1`);
    const adminId = adminUserResult.rows[0]?.user_id;
    const adminToken = signToken({ sub: adminId, role_name: 'Admin' });
    const adminSocket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?token=${encodeURIComponent(adminToken)}`);
    const visitorSocket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?sessionId=${encodeURIComponent('guest-night-session')}`);

    await new Promise((resolve, reject) => {
      adminSocket.once('open', resolve);
      adminSocket.once('error', reject);
    });
    await new Promise((resolve, reject) => {
      visitorSocket.once('open', resolve);
      visitorSocket.once('error', reject);
    });

    const conversation = await query(
      `INSERT INTO chat_conversations (user_id, session_id, status)
       VALUES (NULL, $1, 'open')
       RETURNING conversation_id`,
      ['guest-night-session']
    );

    const replyEvent = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for admin reply takeover')), 3000);
      visitorSocket.once('message', (data) => {
        clearTimeout(timeout);
        const payload = JSON.parse(data.toString());
        expect(payload.type).toBe('chatbot_reply');
        expect(payload.data.message).toBe('Thank you, we will follow up on your request.');
        resolve(payload);
      });
      visitorSocket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      request(app)
        .post(`/api/chatbot/conversations/${conversation.rows[0].conversation_id}/reply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Thank you, we will follow up on your request.' })
        .then((response) => {
          expect(response.status).toBe(201);
        })
        .catch(reject);
    });

    await replyEvent;
    await new Promise((resolve) => {
      visitorSocket.on('close', resolve);
      adminSocket.on('close', resolve);
      visitorSocket.close();
      adminSocket.close();
    });
    closeAll();
    await new Promise((resolve) => server.close(resolve));
  });

  it('keeps chatbot automation on 24/7 and retires the on/off endpoint', async () => {
    const adminUserResult = await query(`SELECT user_id FROM users WHERE username = 'admin' LIMIT 1`);
    const adminToken = signToken({ sub: adminUserResult.rows[0].user_id, role_name: 'Admin' });

    const toggleRes = await request(app)
      .put('/api/chatbot/automation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false, startHour: 8, endHour: 17 });

    expect(toggleRes.status).toBe(404);

    const statusRes = await request(app).get('/api/chatbot/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.automated_hours).toBe('24/7');
    expect(statusRes.body.automation.enabled).toBe(true);
    expect(statusRes.body.automation.effectiveEnabled).toBe(true);
    expect(statusRes.body.automation.alwaysOn).toBe(true);

    const restoreRes = await request(app)
      .put('/api/chatbot/automation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, startHour: 8, endHour: 17 });

    expect(restoreRes.status).toBe(404);
  });

  it('allows admins to delete a conversation and its messages only', async () => {
    const conversation = await query(
      `INSERT INTO chat_conversations (user_id, session_id, status)
       VALUES (NULL, $1, 'open')
       RETURNING conversation_id`,
      [`delete-chat-${Date.now()}`]
    );
    const conversationId = conversation.rows[0].conversation_id;
    await query(
      `INSERT INTO chat_messages (conversation_id, sender_type, message)
       VALUES ($1, 'visitor', 'Please delete this test chat')`,
      [conversationId]
    );

    const unauthenticatedResponse = await request(app).delete(`/api/chatbot/conversations/${conversationId}`);
    expect(unauthenticatedResponse.status).toBe(401);

    const visitorToken = signToken({ sub: 'visitor-user-1', role_name: 'Visitor' });
    const forbiddenResponse = await request(app)
      .delete(`/api/chatbot/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${visitorToken}`);
    expect(forbiddenResponse.status).toBe(403);

    const adminUserResult = await query(`SELECT user_id FROM users WHERE username = 'admin' LIMIT 1`);
    const adminToken = signToken({ sub: adminUserResult.rows[0].user_id, role_name: 'Admin' });
    const deleteResponse = await request(app)
      .delete(`/api/chatbot/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.conversation_id).toBe(conversationId);

    const remainingConversation = await query('SELECT 1 FROM chat_conversations WHERE conversation_id = $1', [conversationId]);
    const remainingMessages = await query('SELECT 1 FROM chat_messages WHERE conversation_id = $1', [conversationId]);
    expect(remainingConversation.rows).toHaveLength(0);
    expect(remainingMessages.rows).toHaveLength(0);

    const missingResponse = await request(app)
      .delete(`/api/chatbot/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missingResponse.status).toBe(404);
  });

  it('allows session owners and admins to edit and delete conversation messages', async () => {
    const sessionId = `message-actions-${Date.now()}`;
    const conversationResult = await query(
      `INSERT INTO chat_conversations (user_id, session_id)
       VALUES (NULL, $1)
       RETURNING conversation_id`,
      [sessionId]
    );
    const conversationId = conversationResult.rows[0].conversation_id;
    const insertedMessages = await query(
      `INSERT INTO chat_messages (conversation_id, sender_type, message)
       VALUES ($1, 'visitor', 'Visitor message'), ($1, 'bot', 'Bot message'), ($1, 'admin', 'Admin message')
       RETURNING message_id, sender_type`,
      [conversationId]
    );
    const visitorMessageId = insertedMessages.rows.find((message) => message.sender_type === 'visitor').message_id;
    const botMessageId = insertedMessages.rows.find((message) => message.sender_type === 'bot').message_id;
    const adminMessageId = insertedMessages.rows.find((message) => message.sender_type === 'admin').message_id;

    try {
      const deniedResponse = await request(app)
        .put(`/api/chatbot/conversations/${conversationId}/messages/${botMessageId}`)
        .send({ message: 'Unauthorized edit', sessionId: 'another-browser-session' });
      expect(deniedResponse.status).toBe(403);

      const visitorEditResponse = await request(app)
        .put(`/api/chatbot/conversations/${conversationId}/messages/${botMessageId}`)
        .send({ message: 'Visitor edited the bot message', sessionId });
      expect(visitorEditResponse.status).toBe(200);
      expect(visitorEditResponse.body.message.message).toBe('Visitor edited the bot message');

      const visitorDeleteResponse = await request(app)
        .delete(`/api/chatbot/conversations/${conversationId}/messages/${adminMessageId}`)
        .query({ sessionId });
      expect(visitorDeleteResponse.status).toBe(200);

      const adminUserResult = await query(`SELECT user_id FROM users WHERE username = 'admin' LIMIT 1`);
      const adminToken = signToken({ sub: adminUserResult.rows[0].user_id, role_name: 'Admin' });
      const adminEditResponse = await request(app)
        .put(`/api/chatbot/conversations/${conversationId}/messages/${visitorMessageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Admin edited the visitor message' });
      expect(adminEditResponse.status).toBe(200);
      expect(adminEditResponse.body.message.message).toBe('Admin edited the visitor message');

      const adminDeleteResponse = await request(app)
        .delete(`/api/chatbot/conversations/${conversationId}/messages/${visitorMessageId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDeleteResponse.status).toBe(200);

      const remainingMessages = await query(
        'SELECT message_id, message FROM chat_messages WHERE conversation_id = $1',
        [conversationId]
      );
      expect(remainingMessages.rows).toEqual([
        { message_id: botMessageId, message: 'Visitor edited the bot message' },
      ]);
    } finally {
      await query('DELETE FROM chat_conversations WHERE conversation_id = $1', [conversationId]);
    }
  });

  it('allows visitors to delete their own conversation but not another session conversation', async () => {
    const sessionId = `delete-owned-chat-${Date.now()}`;
    const conversationResult = await query(
      `INSERT INTO chat_conversations (user_id, session_id)
       VALUES (NULL, $1)
       RETURNING conversation_id`,
      [sessionId]
    );
    const conversationId = conversationResult.rows[0].conversation_id;
    await query(
      `INSERT INTO chat_messages (conversation_id, sender_type, message)
       VALUES ($1, 'visitor', 'Delete my conversation')`,
      [conversationId]
    );

    const deniedResponse = await request(app)
      .delete(`/api/chatbot/conversations/${conversationId}`)
      .query({ sessionId: 'different-session' });
    expect(deniedResponse.status).toBe(403);

    const deleteResponse = await request(app)
      .delete(`/api/chatbot/conversations/${conversationId}`)
      .query({ sessionId });
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.conversation_id).toBe(conversationId);

    const remainingConversation = await query(
      'SELECT 1 FROM chat_conversations WHERE conversation_id = $1',
      [conversationId]
    );
    const remainingMessages = await query(
      'SELECT 1 FROM chat_messages WHERE conversation_id = $1',
      [conversationId]
    );
    expect(remainingConversation.rows).toHaveLength(0);
    expect(remainingMessages.rows).toHaveLength(0);
  });

  it('broadcasts visitor chat messages to connected admin clients', async () => {
    const server = http.createServer();
    initRealtime(server);

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const adminToken = signToken({ sub: 'admin-user-1', role_name: 'Admin' });
    const adminSocket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws?token=${encodeURIComponent(adminToken)}`);

    await new Promise((resolve, reject) => {
      adminSocket.once('open', resolve);
      adminSocket.once('error', reject);
    });

    const messageEvent = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for admin message broadcast')), 3000);
      adminSocket.once('message', (data) => {
        clearTimeout(timeout);
        const payload = JSON.parse(data.toString());
        expect(payload.type).toBe('visitor_message');
        expect(payload.data.message.message).toBe('Hello admin');
        resolve(payload);
      });
      adminSocket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      broadcastToRole('Admin', 'visitor_message', {
        conversation_id: 'conversation-123',
        message: { message_id: 'message-123', message: 'Hello admin', sender_type: 'visitor' },
      });
    });

    await messageEvent;
    await new Promise((resolve) => {
      adminSocket.on('close', resolve);
      adminSocket.close();
    });
    closeAll();
    await new Promise((resolve) => server.close(resolve));
  });
});
