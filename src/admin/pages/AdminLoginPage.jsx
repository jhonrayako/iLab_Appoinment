import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { API_URL } from '../../visitorApi';

function AdminLoginPage() {
  const navigate = useNavigate();
  let existingAuthState = { isLoggedIn: false, user: null };

  try {
    existingAuthState = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{"isLoggedIn":false}');
  } catch {
    existingAuthState = { isLoggedIn: false, user: null };
  }

  const roleName = String(existingAuthState.user?.role_name || existingAuthState.user?.role || '').toLowerCase();

  if (existingAuthState.isLoggedIn && ['admin', 'administrator'].includes(roleName)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.username || !form.password) {
      setError('Username and password are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Admin login failed.');
      }

      localStorage.setItem('ilab_admin_auth', JSON.stringify({
        isLoggedIn: true,
        token: data.token,
        user: {
          role: 'admin',
          name: data.user?.first_name ? `${data.user.first_name} ${data.user.last_name}` : 'Administrator',
          email: data.user?.email || form.username,
          ...data.user,
        },
      }));

      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Unable to sign in as admin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <div className="admin-login-aside">
        <div className="ilab-brand-mark" aria-label="iLAB Guiguinto">
          <span className="ilab-brand-i">i</span><span className="ilab-brand-lab">LAB</span>
        </div>
        <span className="admin-login-rule" />
        <p>GUIGUINTO<br />VISITOR SERVICES</p>
      </div>
      <section className="admin-login-panel">
        <div className="admin-login-content">
          <span className="admin-overline">ADMIN ACCESS</span>
          <h1>Administrator login</h1>
          <p className="admin-login-intro">Restricted system access for full facility and account oversight.</p>

          <form className="admin-login-form" onSubmit={handleSubmit} autoComplete="off">
            <label htmlFor="admin-email">Username or email</label>
            <input id="admin-email" name="username" type="text" autoComplete="off" value={form.username} onChange={handleChange} placeholder="Enter admin username or email" required />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={handleChange} placeholder="Enter password" required />

            {error && <div className="error-banner" role="alert">{error}</div>}

            <div className="admin-login-actions">
              <button type="submit" className="admin-submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Login'}
              </button>
              <Link to="/" className="admin-secondary-button">Visitor portal</Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

export default AdminLoginPage;
