import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, getWebSocketUrl, localDateValue, visitorRequest } from '../visitorApi';

const SESSION_KEY = 'ilab_chat_session';
const CONVERSATION_KEY = 'ilab_chat_conversation';

const getOrCreateSessionId = () => {
  const existingSessionId = sessionStorage.getItem(SESSION_KEY);
  if (existingSessionId) return existingSessionId;

  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
};

const toChatMessage = (message) => ({
  id: message.message_id,
  text: message.message,
  sender: message.sender_type === 'visitor' ? 'user' : message.sender_type,
  persisted: Boolean(message.message_id),
});

function ChatWidget({ isAuthenticated = false, visitorAuthState = null }) {
  const [sessionId] = useState(getOrCreateSessionId);
  const [isOpen, setIsOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome-message',
      text: 'Hello! How can I help you today?',
      sender: 'bot',
    },
  ]);
  const [input, setInput] = useState('');
  const [workflow, setWorkflow] = useState(null);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [conversationId, setConversationId] = useState(() => sessionStorage.getItem(CONVERSATION_KEY) || '');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [messageActionError, setMessageActionError] = useState('');
  const [mutatingMessageId, setMutatingMessageId] = useState(null);
  const [deletingConversation, setDeletingConversation] = useState(false);

  const refreshConversation = async (targetConversationId = conversationId) => {
    if (!targetConversationId) return;
    const query = new URLSearchParams({ sessionId });
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations/${targetConversationId}/messages?${query}`, {
        headers: visitorAuthState?.token ? { Authorization: `Bearer ${visitorAuthState.token}` } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to load chat history.');
      setMessages((previous) => [
        ...previous.filter((message) => message.id === 'welcome-message'),
        ...(data.messages || []).map(toChatMessage),
      ]);
    } catch (error) {
      setMessageActionError(error.message);
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    refreshConversation(conversationId);
  }, [conversationId, visitorAuthState?.token]);

  useEffect(() => {
    const openChat = () => setIsOpen(true);
    window.addEventListener('ilab:open-chat', openChat);
    return () => window.removeEventListener('ilab:open-chat', openChat);
  }, []);

  useEffect(() => {
    if (typeof WebSocket === 'undefined') return undefined;

    const isVisitorSocket = !isAuthenticated || !visitorAuthState?.token;
    const socket = new WebSocket(getWebSocketUrl(
      isVisitorSocket
        ? { sessionId }
        : { token: visitorAuthState.token }
    ));

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'chatbot_reply') {
        const incoming = payload.data || {};
        const incomingText = incoming.message || '';
        if (!incomingText) return;
        const messageId = incoming.message_id || `reply-${incomingText}-${Date.now()}`;
        const sender = incoming.sender_type === 'admin' ? 'admin' : 'bot';
        setMessages((prev) => {
          if (prev.some((message) => message.id === messageId || (message.text === incomingText && message.sender === sender))) {
            return prev;
          }
          return [...prev, { id: messageId, text: incomingText, sender, persisted: Boolean(incoming.message_id) }];
        });
        setStatusNotice(`New reply from iLAB: ${incomingText}`);

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('New reply from iLAB', { body: incomingText });
        }
      }
      if (payload.type === 'chatbot_message_updated') {
        const updated = payload.data?.message;
        if (updated?.message_id) {
          setMessages((previous) => previous.map((message) => (
            message.id === updated.message_id ? toChatMessage(updated) : message
          )));
          if (payload.data?.conversation_id === conversationId) {
            refreshConversation(payload.data.conversation_id);
          }
        }
      }
      if (payload.type === 'chatbot_message_deleted') {
        const deletedId = payload.data?.message_id;
        if (deletedId) {
          setMessages((previous) => previous.filter((message) => message.id !== deletedId));
          if (payload.data?.conversation_id === conversationId) {
            refreshConversation(payload.data.conversation_id);
          }
        }
      }
      if (payload.type === 'chatbot_conversation_deleted' && payload.data?.conversation_id === conversationId) {
        sessionStorage.removeItem(CONVERSATION_KEY);
        setConversationId('');
        setMessages((previous) => previous.filter((message) => message.id === 'welcome-message'));
        setStatusNotice('This chat was deleted.');
      }
    };
    return () => socket.close();
  }, [conversationId, isAuthenticated, visitorAuthState?.token]);

  const addMessage = (text, sender = 'bot', messageId = null) => {
    const safeText = String(text || '').trim();
    if (!safeText) return;

    setMessages((prev) => {
      if (messageId && prev.some((message) => message.id === messageId)) return prev;
      if (!messageId && prev.some((message) => message.text === safeText && message.sender === sender)) return prev;
      return [...prev, { id: messageId || `${sender}-${safeText}-${prev.length}`, text: safeText, sender, persisted: Boolean(messageId) }];
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userText = trimmed;
    const pendingId = `pending-${Date.now()}`;
    setMessageActionError('');
    setMessages((previous) => [...previous, { id: pendingId, text: userText, sender: 'user', persisted: false }]);
    setInput('');

    try {
      if (!isAuthenticated) {
        if (/(book|booking|appointment|cancel|reschedule|feedback|review)/i.test(userText)) {
          setAuthPrompt(true);
          setMessages((previous) => [...previous, {
            id: `auth-prompt-${pendingId}`,
            text: 'Appointments and feedback require a visitor account. Sign in or register to continue.',
            sender: 'bot',
            persisted: false,
          }]);
          return;
        }
      }

      const response = await fetch(`${API_URL}/chatbot/conversations/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(visitorAuthState?.token ? { Authorization: `Bearer ${visitorAuthState.token}` } : {}),
        },
        body: JSON.stringify({ message: userText, sessionId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Chat request failed.');
      setConversationId(data.conversation_id);
      sessionStorage.setItem(CONVERSATION_KEY, data.conversation_id);
      if (data.notice) setStatusNotice(data.notice);
      const receivedMessages = (data.messages || []).map(toChatMessage);
      setMessages((previous) => {
        const withoutPending = previous.filter((message) => message.id !== pendingId);
        const ids = new Set(withoutPending.map((message) => message.id));
        return [...withoutPending, ...receivedMessages.filter((message) => !ids.has(message.id))];
      });
    } catch (error) {
      setMessageActionError(error.message || 'The iLAB chatbot is temporarily unavailable. Please try again later.');
    }
  };

  const saveMessage = async (messageId) => {
    const messageText = editedMessage.trim();
    if (!messageText || !conversationId) return;
    setMutatingMessageId(messageId);
    setMessageActionError('');
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations/${conversationId}/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(visitorAuthState?.token ? { Authorization: `Bearer ${visitorAuthState.token}` } : {}),
        },
        body: JSON.stringify({ message: messageText, sessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to edit message.');
      setMessages((previous) => previous.map((message) => (
        message.id === messageId ? toChatMessage(data.message) : message
      )));
      await refreshConversation(conversationId);
      setEditingMessageId(null);
      setEditedMessage('');
    } catch (error) {
      setMessageActionError(error.message || 'Unable to edit message.');
    } finally {
      setMutatingMessageId(null);
    }
  };

  const deleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message? This cannot be undone.') || !conversationId) return;
    setMutatingMessageId(messageId);
    setMessageActionError('');
    try {
      const query = new URLSearchParams({ sessionId });
      const response = await fetch(`${API_URL}/chatbot/conversations/${conversationId}/messages/${messageId}?${query}`, {
        method: 'DELETE',
        headers: visitorAuthState?.token ? { Authorization: `Bearer ${visitorAuthState.token}` } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to delete message.');
      setMessages((previous) => previous.filter((message) => message.id !== messageId));
      await refreshConversation(conversationId);
    } catch (error) {
      setMessageActionError(error.message || 'Unable to delete message.');
    } finally {
      setMutatingMessageId(null);
    }
  };

  const deleteConversation = async () => {
    if (!conversationId || !window.confirm('Delete this chat and all of its messages? This cannot be undone.')) return;
    setDeletingConversation(true);
    setMessageActionError('');
    try {
      const query = new URLSearchParams({ sessionId });
      const response = await fetch(`${API_URL}/chatbot/conversations/${conversationId}?${query}`, {
        method: 'DELETE',
        headers: visitorAuthState?.token ? { Authorization: `Bearer ${visitorAuthState.token}` } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to delete chat.');
      sessionStorage.removeItem(CONVERSATION_KEY);
      setConversationId('');
      setMessages((previous) => previous.filter((message) => message.id === 'welcome-message'));
      setEditingMessageId(null);
      setStatusNotice('Your chat and its messages were deleted.');
    } catch (error) {
      setMessageActionError(error.message || 'Unable to delete chat.');
    } finally {
      setDeletingConversation(false);
    }
  };

  const beginBooking = async () => {
    setWorkflowError('');
    try {
      const result = await visitorRequest('/facilities');
      const facilities = (result.facilities || []).filter((facility) => facility.is_active);
      if (!facilities.length) throw new Error('No visitor facilities are available right now.');
      setWorkflow({ type: 'booking', step: 'facility', facilities, facilityId: facilities[0].facility_id, date: localDateValue(), slots: [], slot: null, topic: '' });
      addMessage('Letâ€™s put together your appointment request.');
    } catch (error) {
      setWorkflowError(error.message);
    }
  };

  useEffect(() => {
    if (workflow?.type !== 'booking' || workflow.step !== 'slot' || !workflow.facilityId || !workflow.date) return undefined;
    let active = true;
    visitorRequest(`/visitor/availability?facilityId=${encodeURIComponent(workflow.facilityId)}&date=${encodeURIComponent(workflow.date)}`)
      .then((result) => {
        if (active) setWorkflow((current) => current?.step === 'slot' ? { ...current, slots: result.slots || [] } : current);
      })
      .catch((error) => { if (active) setWorkflowError(error.message); });
    return () => { active = false; };
  }, [workflow?.type, workflow?.step, workflow?.facilityId, workflow?.date]);

  const submitChatBooking = async (event) => {
    event.preventDefault();
    if (!workflow?.slot || !workflow.topic.trim()) return;
    setWorkflowError('');
    try {
      const result = await visitorRequest('/visitor/appointments', {
        token: visitorAuthState?.token,
        method: 'POST',
        body: JSON.stringify({
          facilityId: workflow.facilityId,
          startTime: workflow.slot.start,
          endTime: workflow.slot.end,
          topic: workflow.topic.trim(),
        }),
      });
      addMessage(`Your appointment request for ${new Date(result.appointment.start_time).toLocaleString()} was sent. The status is ${result.appointment.status}.`);
      setWorkflow(null);
    } catch (error) {
      setWorkflowError(error.message);
    }
  };

  const submitChatFeedback = async (event) => {
    event.preventDefault();
    if (!workflow?.message?.trim()) return;
    setWorkflowError('');
    try {
      await visitorRequest('/visitor/feedback', {
        token: visitorAuthState?.token,
        method: 'POST',
        body: JSON.stringify({ message: workflow.message.trim() }),
      });
      addMessage('Thank you. Your feedback has been received.');
      setWorkflow(null);
    } catch (error) {
      setWorkflowError(error.message);
    }
  };

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-panel" aria-label="Assistant chat panel">
          <div className="chat-header">
            <strong>Ask iLAB</strong>
            {conversationId && <button className="button-ghost" type="button" onClick={deleteConversation} disabled={deletingConversation}>
              {deletingConversation ? 'Deleting...' : 'Delete chat'}
            </button>}
            <button className="button-ghost" type="button" onClick={() => setIsOpen(false)}>Close</button>
          </div>
          <div className="chat-messages">
            {statusNotice && <div className="chat-status-notice">{statusNotice}</div>}
            {messages.map((message, index) => (
              <div key={message.id || `${message.sender}-${index}`} className={`chat-bubble-wrap ${message.sender}`}>
                {(message.sender === 'bot' || message.sender === 'admin') && <div className={`chat-bubble-avatar ${message.sender}`}>{message.sender === 'admin' ? 'A' : 'i'}</div>}
                <div className="chat-bubble-content">
                  {editingMessageId === message.id ? (
                    <form className="chat-message-edit" onSubmit={(event) => { event.preventDefault(); saveMessage(message.id); }}>
                      <textarea aria-label="Edit message" value={editedMessage} onChange={(event) => setEditedMessage(event.target.value)} required />
                      <button type="submit" disabled={mutatingMessageId === message.id}>{mutatingMessageId === message.id ? 'Saving...' : 'Save'}</button>
                      <button type="button" onClick={() => setEditingMessageId(null)}>Cancel</button>
                    </form>
                  ) : <div className={`chat-bubble ${message.sender}`}>{message.text}</div>}
                  {message.persisted && conversationId && editingMessageId !== message.id && (
                    <div className="chat-message-actions">
                      <button type="button" onClick={() => { setEditingMessageId(message.id); setEditedMessage(message.text); }}>Edit</button>
                      <button type="button" onClick={() => deleteMessage(message.id)} disabled={mutatingMessageId === message.id}>
                        {mutatingMessageId === message.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
                {message.sender === 'user' && <div className="chat-bubble-avatar user">Y</div>}
              </div>
            ))}
          </div>
          {messageActionError && <div className="chat-workflow-error" role="alert">{messageActionError}</div>}
          {isAuthenticated ? (
            <div className="chat-action-row">
              <button type="button" onClick={beginBooking}>Book a visit</button>
              <button type="button" onClick={() => { setWorkflow({ type: 'feedback', message: '' }); setWorkflowError(''); }}>Leave feedback</button>
            </div>
          ) : <div className="chat-guest-note">General iLAB questions only Â· <Link to="/login">Visitor sign in</Link></div>}
          {authPrompt && <div className="chat-auth-prompt" role="status">
            <span>Sign in or create an account to manage appointments and send feedback.</span>
            <Link to="/login">Sign in</Link><Link to="/register">Register</Link>
          </div>}
          {workflow?.type === 'booking' && <div className="chat-workflow" aria-live="polite">
            <span className="chat-workflow-title">Appointment request</span>
            {workflow.step === 'facility' && <label>Choose a facility<select value={workflow.facilityId} onChange={(event) => setWorkflow({ ...workflow, facilityId: event.target.value, step: 'date' })}>
              {workflow.facilities.map((facility) => <option key={facility.facility_id} value={facility.facility_id}>{facility.facility_name}</option>)}
            </select><button type="button" onClick={() => setWorkflow({ ...workflow, step: 'date' })}>Continue</button></label>}
            {workflow.step === 'date' && <label>Choose a date<input type="date" min={localDateValue()} value={workflow.date} onChange={(event) => setWorkflow({ ...workflow, date: event.target.value })} /><button type="button" onClick={() => setWorkflow({ ...workflow, step: 'slot', slots: [] })}>See available times</button></label>}
            {workflow.step === 'slot' && <div><span>Available times</span><div className="chat-slot-grid">{workflow.slots.filter((slot) => slot.available).map((slot) => <button key={slot.start} type="button" onClick={() => setWorkflow({ ...workflow, slot, step: 'topic' })}>{new Date(slot.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</button>)}</div>{!workflow.slots.some((slot) => slot.available) && <small>No times available. Choose another date.</small>}<button type="button" onClick={() => setWorkflow({ ...workflow, step: 'date' })}>Change date</button></div>}
            {workflow.step === 'topic' && <form onSubmit={submitChatBooking}><label>What would you like to explore?<textarea maxLength="255" value={workflow.topic} onChange={(event) => setWorkflow({ ...workflow, topic: event.target.value })} required /></label><button type="submit">Send appointment request</button><button type="button" onClick={() => setWorkflow({ ...workflow, step: 'slot' })}>Choose another time</button></form>}
          </div>}
          {workflow?.type === 'feedback' && <form className="chat-workflow" onSubmit={submitChatFeedback}>
            <span className="chat-workflow-title">Share your visit feedback</span>
            <label>Your feedback<textarea minLength="3" maxLength="2000" value={workflow.message} onChange={(event) => setWorkflow({ ...workflow, message: event.target.value })} required /></label>
            <button type="submit">Submit feedback</button><button type="button" onClick={() => setWorkflow(null)}>Cancel</button>
          </form>}
          {workflowError && <div className="chat-workflow-error" role="alert">{workflowError}</div>}
          <form className="chat-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Type your message"
              placeholder="Ask about iLAB services, hours, location, or visits..."
            />
            <button type="submit" className="button">Send</button>
          </form>
        </div>
      )}

      <button type="button" className="chat-toggle" aria-label="Open chat" onClick={() => setIsOpen((prev) => !prev)}>
        <span className="chat-leaf" aria-hidden="true" />
      </button>
    </div>
  );
}

export default ChatWidget;
