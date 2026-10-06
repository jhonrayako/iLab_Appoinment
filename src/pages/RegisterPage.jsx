import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../visitorApi';

function RegisterPage({ visitorAuthState }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
  });
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
    setError('');
    setIsSubmitting(true);

    try {
      const payload = {
        username: form.username,
        email: form.email,
        password: form.password,
        firstName: form.first_name,
        lastName: form.last_name,
      };

      const response = await fetch(`${API_URL}/auth/visitor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Registration failed.');
      }

      visitorAuthState.login({ user: data.user, token: data.token });
      navigate(location.state?.from?.pathname || '/my-appointments', { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <span className="kicker">Visitor Registration</span>
        <h1>Create your visitor account</h1>
        <p>Register to create a visit letter through the iLAB chatbot.</p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="input-row">
            <label htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" type="text" value={form.first_name} onChange={handleChange} placeholder="First name" required />
          </div>
          <div className="input-row">
            <label htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" type="text" value={form.last_name} onChange={handleChange} placeholder="Last name" required />
          </div>
          <div className="input-row">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" value={form.username} onChange={handleChange} placeholder="Choose a username" required />
          </div>
          <div className="input-row">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
          </div>
          <div className="input-row">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" minLength="8" autoComplete="new-password" value={form.password} onChange={handleChange} placeholder="Create a strong password" required />
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Register'}
            </button>
            <Link to="/login" className="button-ghost">Already have an account?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RegisterPage;
