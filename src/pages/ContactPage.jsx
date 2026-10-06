import { useState } from 'react';
import { visitorRequest } from '../visitorApi';

function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    setSending(true);
    try {
      const result = await visitorRequest('/visitor/contact', { method: 'POST', body: JSON.stringify(form) });
      setNotice(result.message);
      setForm({ name: '', email: '', message: '' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-header">
      <div className="container">
        <span className="kicker">Contact</span>
        <h1>Reach the public support team.</h1>
      </div>

      <section className="section page-block">
        <div className="container contact-grid">
          <div className="contact-box">
            <h3>Facility Address</h3>
            <p>RVQ7+938, Spur Road, Guiguinto, Bulacan</p>
          </div>
          <div className="contact-box">
            <h3>Phone</h3>
            <p><a href="tel:+639555934054">0955 593 4054</a></p>
          </div>
          <div className="contact-box">
            <h3>Email</h3>
            <p><a href="mailto:ilabguiguinto@gmail.com">ilabguiguinto@gmail.com</a></p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="booking-form">
            <h3>Send us a message</h3>
            <form className="form-grid" onSubmit={submit}>
              <div className="input-row">
                <label htmlFor="name">Full name</label>
                <input id="name" type="text" minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your full name" required />
              </div>
              <div className="input-row">
                <label htmlFor="email">Email address</label>
                <input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required />
              </div>
              <div className="input-row">
                <label htmlFor="message">Message</label>
                <textarea id="message" minLength="5" maxLength="3000" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us how we can help." required />
              </div>
              {error && <div className="error-banner" role="alert">{error}</div>}
              {notice && <div className="success-banner" role="status">{notice}</div>}
              <div className="form-actions">
                <button type="submit" className="button" disabled={sending}>{sending ? 'Sending...' : 'Send Message'}</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ContactPage;
