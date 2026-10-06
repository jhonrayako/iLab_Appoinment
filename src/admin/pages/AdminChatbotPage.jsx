import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const emptyForm = {
  question: '',
  answer: '',
  keywords: '',
  trainingPhrases: '',
  category: 'general',
};

function AdminChatbotPage() {
  const [faqs, setFaqs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [liveNotice, setLiveNotice] = useState('');
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [mutatingMessageId, setMutatingMessageId] = useState(null);
  const [chatError, setChatError] = useState('');

  const fetchFaqs = async () => {
    try {
      const token = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}')?.token || '';
      const response = await fetch(`${API_URL}/admin/chatbot/faq`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to load chatbot FAQs');
      setFaqs(data.faqs || []);
    } catch (err) {
      setError(err.message || 'Unable to load chatbot FAQs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
    fetchConversations();
  }, []);

  const getToken = () => JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}')?.token || '';

  useEffect(() => {
    const token = getToken();
    if (!token || typeof WebSocket === 'undefined') return undefined;

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const socketUrl = new URL('/ws', API_URL);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.searchParams.set('token', token);
    const socket = new WebSocket(socketUrl);

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'chatbot_conversation_deleted') {
        const conversationId = payload.data?.conversation_id;
        if (conversationId) {
          setConversations((previous) => previous.filter((conversation) => conversation.conversation_id !== conversationId));
          if (selectedConversation?.conversation_id === conversationId) {
            setSelectedConversation(null);
            setConversationMessages([]);
            setReply('');
          }
        }
        return;
      }
      if (payload.type === 'chatbot_message_updated' || payload.type === 'chatbot_message_deleted') {
        const conversationId = payload.data?.conversation_id;
        if (selectedConversation?.conversation_id === conversationId) {
          if (payload.type === 'chatbot_message_updated' && payload.data?.message) {
            const updatedMessage = payload.data.message;
            setConversationMessages((previous) => previous.map((message) => (
              message.message_id === updatedMessage.message_id ? updatedMessage : message
            )));
          } else if (payload.data?.message_id) {
            setConversationMessages((previous) => previous.filter((message) => message.message_id !== payload.data.message_id));
          }
          refreshSelectedConversation();
        }
        fetchConversations();
        return;
      }
      if (payload.type !== 'visitor_message') return;

      const incoming = payload.data?.message;
      if (!incoming) return;

      const senderLabel = incoming.sender_type === 'bot' ? 'Automated bot reply' : 'A visitor';
      setLiveNotice(`${senderLabel} sent a new chatbot message.`);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(incoming.sender_type === 'bot' ? 'Automated chatbot reply' : 'New visitor message', { body: incoming.message });
      }

      const conversationId = payload.data?.conversation_id;
      if (selectedConversation && conversationId === selectedConversation.conversation_id) {
        setConversationMessages((previous) => {
          const exists = previous.some((message) => message.message_id === incoming.message_id);
          return exists ? previous : [...previous, incoming];
        });
      }

      fetchConversations();
    };

    return () => socket.close();
  }, [selectedConversation?.conversation_id]);

  const fetchConversations = async () => {
    setIsRefreshingConversations(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to load conversations');
      setConversations(data.conversations || []);
      return true;
    } catch (err) {
      setError(err.message || 'Unable to load conversations');
      return false;
    } finally {
      setIsRefreshingConversations(false);
    }
  };

  const refreshSelectedConversation = async () => {
    if (!selectedConversation) return;
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations/${selectedConversation.conversation_id}/messages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to refresh chat messages');
      setConversationMessages(data.messages || []);
    } catch (err) {
      setChatError(err.message || 'Unable to refresh chat messages');
    }
  };

  const refreshInbox = async () => {
    const conversationsRefreshed = await fetchConversations();
    if (conversationsRefreshed && selectedConversation) {
      await refreshSelectedConversation();
    }
  };

  const selectConversation = async (conversation) => {
    setChatError('');
    setEditingMessageId(null);
    setSelectedConversation(conversation);
    const response = await fetch(`${API_URL}/chatbot/conversations/${conversation.conversation_id}/messages`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await response.json();
    if (response.ok) setConversationMessages(data.messages || []);
  };

  const saveMessage = async (messageId) => {
    if (!selectedConversation || !editedMessage.trim()) return;
    setMutatingMessageId(messageId);
    setChatError('');
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations/${selectedConversation.conversation_id}/messages/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: editedMessage.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to edit message');
      setConversationMessages((previous) => previous.map((message) => (
        message.message_id === messageId ? data.message : message
      )));
      await refreshSelectedConversation();
      setEditingMessageId(null);
      setEditedMessage('');
    } catch (err) {
      setChatError(err.message || 'Unable to edit message');
    } finally {
      setMutatingMessageId(null);
    }
  };

  const deleteMessage = async (messageId) => {
    if (!selectedConversation || !window.confirm('Delete this message? This cannot be undone.')) return;
    setMutatingMessageId(messageId);
    setChatError('');
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations/${selectedConversation.conversation_id}/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to delete message');
      setConversationMessages((previous) => previous.filter((message) => message.message_id !== messageId));
      await refreshSelectedConversation();
    } catch (err) {
      setChatError(err.message || 'Unable to delete message');
    } finally {
      setMutatingMessageId(null);
    }
  };

  const deleteConversation = async (conversation) => {
    if (!window.confirm('Delete this chat and all of its messages? This cannot be undone.')) return;

    setDeletingConversationId(conversation.conversation_id);
    setError('');
    try {
      const response = await fetch(`${API_URL}/chatbot/conversations/${conversation.conversation_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to delete chat');

      setConversations((previous) => previous.filter((item) => item.conversation_id !== conversation.conversation_id));
      if (selectedConversation?.conversation_id === conversation.conversation_id) {
        setSelectedConversation(null);
        setConversationMessages([]);
        setReply('');
      }
      setLiveNotice('Chat and its messages deleted.');
    } catch (err) {
      setError(err.message || 'Unable to delete chat');
    } finally {
      setDeletingConversationId(null);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!reply.trim() || !selectedConversation) return;
    const messageText = reply.trim();
    const response = await fetch(`${API_URL}/chatbot/conversations/${selectedConversation.conversation_id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ message: messageText }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error?.message || 'Unable to send reply');
      return;
    }
    setConversationMessages((previous) => [...previous, data.message]);
    setReply('');
    setLiveNotice(`Reply sent to visitor: ${messageText}`);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Reply sent to visitor', { body: messageText });
    }

    fetchConversations();
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const token = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}')?.token || '';
      const payload = {
        question: form.question,
        answer: form.answer,
        keywords: form.keywords.split(',').map((word) => word.trim()).filter(Boolean),
        trainingPhrases: form.trainingPhrases.split(/\r?\n/).map((phrase) => phrase.trim()).filter(Boolean),
        category: form.category,
      };

      const response = await fetch(`${API_URL}/admin/chatbot/faq`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to save chatbot entry');

      setForm(emptyForm);
      await fetchFaqs();
    } catch (err) {
      setError(err.message || 'Unable to save chatbot FAQ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (faqId) => {
    try {
      const token = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}')?.token || '';
      const response = await fetch(`${API_URL}/admin/chatbot/faq/${faqId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Failed to delete FAQ');
      await fetchFaqs();
    } catch (err) {
      setError(err.message || 'Unable to delete chatbot FAQ');
    }
  };

  const getConversationInitials = (conversation) => {
    const fullName = `${conversation.first_name || ''} ${conversation.last_name || ''}`.trim();
    const baseName = fullName || 'Visitor';
    const initials = baseName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');

    return initials || 'V';
  };

  const getMessageInitials = (senderType) => {
    if (senderType === 'visitor') return 'V';
    if (senderType === 'admin') return 'A';
    return 'B';
  };

  return (
    <div className="admin-page">
      <div className="section-header chatbot-header">
        <div className="chatbot-page-title">
          <div className="ilab-brand-mark chatbot-page-icon" aria-label="iLAB Guiguinto chatbot">
            <span className="ilab-brand-i">i</span>
            <span className="ilab-brand-lab">LAB</span>
          </div>
          <div>
            <span className="kicker">Chatbot</span>
            <h1>Knowledge base manager</h1>
          </div>
        </div>
      </div>

      <div className="two-col admin-grid">
        <div className="panel chatbot-inbox-panel">
          <div className="section-header compact-header">
            <div>
              <h3>Visitor inbox</h3>
              <p className="muted">The iLAB chatbot replies automatically 24/7. Visitor messages are also shared with the iLAB administrator for follow-up.</p>
              {liveNotice && <p className="chat-live-notice" role="status">{liveNotice}</p>}
            </div>
            <div className="conversation-toolbar">
              <button
                type="button"
                className="button-ghost small-button"
                onClick={refreshInbox}
                disabled={isRefreshingConversations}
              >
                {isRefreshingConversations ? 'Refreshing...' : 'Refresh'}
              </button>
              <span className="chat-live-notice" role="status">Active 24/7</span>
            </div>
          </div>
          <div className={`chat-admin-layout ${selectedConversation ? 'is-conversation-open' : ''}`}>
            <div className="conversation-list">
              {conversations.length === 0 ? <p className="muted">No open visitor conversations.</p> : conversations.map((conversation) => (
                <div key={conversation.conversation_id} className="conversation-entry">
                  <button type="button" className={`conversation-item ${selectedConversation?.conversation_id === conversation.conversation_id ? 'is-selected' : ''}`} onClick={() => selectConversation(conversation)}>
                    <div className="conversation-row">
                      <div className="conversation-avatar" aria-label="Visitor profile">{getConversationInitials(conversation)}</div>
                      <div className="conversation-content">
                        <strong>{conversation.first_name ? `${conversation.first_name} ${conversation.last_name || ''}` : 'Guest visitor'}</strong>
                        <span>{conversation.latest_message}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="button-ghost small-button conversation-delete"
                    onClick={() => deleteConversation(conversation)}
                    disabled={deletingConversationId === conversation.conversation_id}
                    aria-label={`Delete chat with ${conversation.first_name || 'guest visitor'}`}
                  >
                    {deletingConversationId === conversation.conversation_id ? 'Deleting...' : 'Delete chat'}
                  </button>
                </div>
              ))}
            </div>
            <div className="admin-conversation">
              {!selectedConversation ? <p className="muted">Select a visitor conversation to reply.</p> : <>
                <div className="conversation-toolbar">
                  <button type="button" className="button-ghost small-button" onClick={() => setSelectedConversation(null)}>
                    Back to visitors
                  </button>
                  <button
                    type="button"
                    className="button-ghost small-button conversation-delete"
                    onClick={() => deleteConversation(selectedConversation)}
                    disabled={deletingConversationId === selectedConversation.conversation_id}
                  >
                    {deletingConversationId === selectedConversation.conversation_id ? 'Deleting...' : 'Delete chat'}
                  </button>
                </div>
                {chatError && <div className="error-banner" role="alert">{chatError}</div>}
                <div className="admin-message-list">
                  {conversationMessages.map((message) => (
                    <div key={message.message_id} className={`admin-message ${message.sender_type}`}>
                      <div className="admin-message-row">
                        <div className={`admin-message-avatar ${message.sender_type}`}>{getMessageInitials(message.sender_type)}</div>
                        <div className="admin-message-body">
                          <small>{message.sender_type === 'visitor' ? 'Visitor' : message.sender_type === 'admin' ? 'Admin' : 'Bot'}</small>
                          {editingMessageId === message.message_id ? (
                            <form className="chat-message-edit" onSubmit={(event) => { event.preventDefault(); saveMessage(message.message_id); }}>
                              <textarea aria-label="Edit message" value={editedMessage} onChange={(event) => setEditedMessage(event.target.value)} required />
                              <button type="submit" disabled={mutatingMessageId === message.message_id}>{mutatingMessageId === message.message_id ? 'Saving...' : 'Save'}</button>
                              <button type="button" onClick={() => setEditingMessageId(null)}>Cancel</button>
                            </form>
                          ) : <div>{message.message}</div>}
                          {editingMessageId !== message.message_id && (
                            <div className="chat-message-actions">
                              <button type="button" onClick={() => { setEditingMessageId(message.message_id); setEditedMessage(message.message); }}>Edit</button>
                              <button type="button" onClick={() => deleteMessage(message.message_id)} disabled={mutatingMessageId === message.message_id}>
                                {mutatingMessageId === message.message_id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <form className="chat-form" onSubmit={sendReply}>
                  <input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply to the visitor..." aria-label="Reply to visitor" />
                  <button type="submit" className="button">Reply</button>
                </form>
              </>}
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>Add chatbot response</h3>
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="input-row">
              <label htmlFor="question">Question</label>
              <input id="question" name="question" value={form.question} onChange={handleChange} placeholder="Example: How do I book a visit?" required />
            </div>

            <div className="input-row">
              <label htmlFor="answer">Answer</label>
              <textarea id="answer" name="answer" value={form.answer} onChange={handleChange} rows="4" placeholder="Write the bot response" required />
            </div>

            <div className="input-row">
              <label htmlFor="keywords">Keywords</label>
              <input id="keywords" name="keywords" value={form.keywords} onChange={handleChange} placeholder="book, appointment, schedule" />
            </div>

            <div className="input-row">
              <label htmlFor="trainingPhrases">Training questions (one per line)</label>
              <textarea id="trainingPhrases" name="trainingPhrases" value={form.trainingPhrases} onChange={handleChange} rows="4" placeholder={'How do I schedule a visit?\nI want to book an appointment\nCan I request a facility tour?'} />
            </div>

            <div className="input-row">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" value={form.category} onChange={handleChange}>
                <option value="general">General</option>
                <option value="booking">Booking</option>
                <option value="contact">Contact</option>
                <option value="facility">Facility</option>
              </select>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="form-actions">
              <button type="submit" className="button" disabled={saving}>
                {saving ? 'Saving...' : 'Save FAQ'}
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <h3>Current chatbot knowledge</h3>
          {isLoading ? (
            <p>Loading...</p>
          ) : faqs.length === 0 ? (
            <p>No FAQ entries yet.</p>
          ) : (
            <ul className="log-list">
              {faqs.map((faq) => (
                <li key={faq.faq_id}>
                  <div>
                    <strong>{faq.question}</strong>
                    <div>{faq.answer}</div>
                    <small>{faq.category} • {faq.keywords?.join(', ') || 'No keywords'} • {faq.training_phrases?.length || 0} training questions</small>
                  </div>
                  <button type="button" className="button-ghost small-button" onClick={() => handleDelete(faq.faq_id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminChatbotPage;
