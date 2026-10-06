import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { API_URL, getStaffAuth, STAFF_STORAGE_KEY } from '../staffApi';

function StaffLoginPage() {
  const navigate = useNavigate();
  const existingAuth = getStaffAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (existingAuth?.isLoggedIn && existingAuth.user?.role_name === 'Staff') {
    return <Navigate to="/staff/dashboard" replace />;
  }

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.message || 'Unable to sign in.');
      if (data.user?.role_name !== 'Staff') throw new Error('This portal is available to staff accounts only.');
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify({
        isLoggedIn: true,
        token: data.token,
        user: data.user,
      }));
      navigate('/staff/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="staff-login-page">
      <div className="staff-login-aside">
        <div className="ilab-brand-mark" aria-label="iLAB Guiguinto">
          <span className="ilab-brand-i">i</span><span className="ilab-brand-lab">LAB</span>
        </div>
        <span className="staff-login-rule" />
        <p>GUIGUINTO<br />VISITOR SERVICES</p>
      </div>
      <section className="staff-login-panel">
        <div className="staff-login-content">
          <span className="staff-overline">STAFF PORTAL / SECURE ACCESS</span>
          <h1>Good day.<br /><em>Let’s get started.</em></h1>
          <p className="staff-login-intro">Sign in with the account issued by your administrator.</p>
          <form className="staff-login-form" onSubmit={submit} autoComplete="off">
            <label htmlFor="staff-username">Username or email</label>
            <input id="staff-username" name="username" autoComplete="off" value={form.username} onChange={updateField} required />
            <label htmlFor="staff-password">Password</label>
            <input id="staff-password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={updateField} required />
            {error && <div className="error-banner" role="alert">{error}</div>}
            <button className="staff-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Enter staff portal'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <span className="staff-login-footnote">STAFF ACCESS ONLY · ILAB GUIGUINTO</span>
        </div>
      </section>
    </main>
  );
}

export default StaffLoginPage;