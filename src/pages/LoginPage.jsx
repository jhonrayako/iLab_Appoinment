import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../visitorApi';

function LoginPage({ visitorAuthState }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (visitorAuthState?.isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/visitor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Login failed.');
      }

      visitorAuthState.login({ user: data.user, token: data.token });
      navigate(location.state?.from?.pathname || '/my-appointments', { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to sign in right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="visitor-login-page">
      <div className="visitor-login-aside">
        <div className="ilab-brand-mark" aria-label="iLAB Guiguinto">
          <span className="ilab-brand-i">i</span><span className="ilab-brand-lab">LAB</span>
        </div>
        <span className="visitor-login-rule" />
        <p>GUIGUINTO<br />VISITOR SERVICES</p>
      </div>
      <section className="visitor-login-panel">
        <div className="visitor-login-content">
          <span className="visitor-overline">VISITOR PORTAL / ACCESS</span>
          <h1>Welcome back.<br /><em>Let’s get started.</em></h1>
          <p className="visitor-login-intro">Sign in to request a visit, manage appointments, and follow your status updates.</p>

          <form className="visitor-login-form" onSubmit={handleSubmit}>
            <label htmlFor="username">Username or email</label>
            <input
              id="username"
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              placeholder="Enter your username or email"
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
            />

            {error && <div className="error-banner" role="alert">{error}</div>}

            <div className="visitor-login-actions">
              <button type="submit" className="visitor-submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Enter visitor portal'} <span aria-hidden="true">→</span>
              </button>
            </div>

            <div className="visitor-links-row">
              <Link to="/reset-password" className="visitor-text-link">Forgot password?</Link>
              <Link to="/register" className="visitor-text-link">Create account</Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
