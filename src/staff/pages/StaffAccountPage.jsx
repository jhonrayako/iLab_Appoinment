import { useEffect, useState } from 'react';
import { staffRequest } from '../staffApi';

function StaffAccountPage() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    staffRequest('/account').then((result) => {
      if (active) setUser(result.user);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => { active = false; };
  }, []);

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const changePassword = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (form.newPassword !== form.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    try {
      const result = await staffRequest('/account/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      setMessage(result.message || 'Password changed.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="staff-page">
      <div className="staff-page-heading"><div><span className="staff-overline">PERSONAL DETAILS</span><h1>Account</h1></div></div>
      {error && <div className="staff-error" role="alert">{error}</div>}
      {message && <div className="staff-success" role="status">{message}</div>}
      <div className="staff-account-grid">
        <section className="staff-section">
          <span className="staff-overline">STAFF PROFILE</span>
          <h2>{user ? `${user.first_name} ${user.last_name}` : 'Loading profile...'}</h2>
          <dl className="staff-profile-list">
            <div><dt>Username</dt><dd>{user?.username || '—'}</dd></div>
            <div><dt>Email</dt><dd>{user?.email || '—'}</dd></div>
            <div><dt>Access</dt><dd>Staff operations</dd></div>
          </dl>
        </section>
        <section className="staff-section">
          <span className="staff-overline">SECURITY</span>
          <h2>Change password</h2>
          <form className="staff-password-form" onSubmit={changePassword}>
            <label>Current password<input type="password" name="currentPassword" autoComplete="current-password" value={form.currentPassword} onChange={updateField} required /></label>
            <label>New password<input type="password" name="newPassword" autoComplete="new-password" minLength="8" value={form.newPassword} onChange={updateField} required /></label>
            <label>Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" minLength="8" value={form.confirmPassword} onChange={updateField} required /></label>
            <button className="staff-primary-button" type="submit">Update password</button>
          </form>
        </section>
      </div>
    </section>
  );
}

export default StaffAccountPage;