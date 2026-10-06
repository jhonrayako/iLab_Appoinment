import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../visitorApi';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (token && password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/${token ? 'confirm' : 'request'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, newPassword: password } : { email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || 'Unable to process this request.');
      setMessage(data.message);
      setPassword('');
      setConfirmation('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-card">
        <span className="kicker">Visitor account</span>
        <h1>{token ? 'Choose a new password' : 'Reset your password'}</h1>
        <p>{token ? 'Set a new password for your iLAB visitor account.' : 'We’ll email a one-time reset link if an account matches your email.'}</p>
        <form className="form-grid" onSubmit={submit}>
          {!token ? <div className="input-row"><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div> : <>
            <div className="input-row"><label htmlFor="reset-password">New password</label><input id="reset-password" type="password" minLength="8" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            <div className="input-row"><label htmlFor="reset-confirmation">Confirm password</label><input id="reset-confirmation" type="password" minLength="8" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
          </>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          {message && <div className="success-banner" role="status">{message}</div>}
          <button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait...' : token ? 'Set new password' : 'Email reset link'}</button>
          <Link className="button-ghost" to="/login">Back to visitor login</Link>
        </form>
      </section>
    </div>
  );
}

export default ResetPasswordPage;