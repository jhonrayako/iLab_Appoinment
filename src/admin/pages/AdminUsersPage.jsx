import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const emptyForm = { username: '', email: '', firstName: '', lastName: '', password: '' };

async function adminRequest(path, options = {}) {
  const auth = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}');
  const response = await fetch(`${API_URL}/admin${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token || ''}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Unable to load staff accounts.');
  return data;
}

function AdminUsersPage() {
  const [roles, setRoles] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [staffRoleId, setStaffRoleId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const roleResult = await adminRequest('/roles');
        const staffRole = roleResult.roles.find((role) => role.role_name === 'Staff');
        const userResult = staffRole
          ? await adminRequest(`/users?roleId=${staffRole.role_id}&limit=100`)
          : { users: [] };
        if (active) {
          setRoles(roleResult.roles);
          setStaffRoleId(staffRole?.role_id || '');
          setStaffUsers(userResult.users || []);
          setError(staffRole ? '' : 'The Staff role is missing. Run the database migration to provision it.');
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    load();
    return () => { active = false; };
  }, [refreshKey]);

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const createStaff = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await adminRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, roleId: staffRoleId }),
      });
      setForm(emptyForm);
      setMessage('Staff account created. Share the sign-in details with the staff member securely.');
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Users & roles</span>
          <h1>Staff access</h1>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div className="success-banner" role="status">{message}</div>}
      <div className="two-col admin-grid">
        <div className="panel">
          <span className="kicker">Provision account</span>
          <h3>Create staff account</h3>
          <form className="form-grid" onSubmit={createStaff}>
            <div className="staff-admin-form-grid">
              <div className="input-row"><label htmlFor="staff-first-name">First name</label><input id="staff-first-name" name="firstName" value={form.firstName} onChange={updateField} required /></div>
              <div className="input-row"><label htmlFor="staff-last-name">Last name</label><input id="staff-last-name" name="lastName" value={form.lastName} onChange={updateField} required /></div>
              <div className="input-row"><label htmlFor="staff-username">Username</label><input id="staff-username" name="username" minLength="3" value={form.username} onChange={updateField} required /></div>
              <div className="input-row"><label htmlFor="staff-email">Email</label><input id="staff-email" name="email" type="email" value={form.email} onChange={updateField} required /></div>
              <div className="input-row"><label htmlFor="staff-password">Temporary password</label><input id="staff-password" name="password" type="password" autoComplete="new-password" minLength="8" value={form.password} onChange={updateField} required /></div>
            </div>
            <button className="button" type="submit" disabled={!staffRoleId || isSubmitting}>{isSubmitting ? 'Creating...' : 'Create staff account'}</button>
          </form>
        </div>

        <div className="panel">
          <span className="kicker">Role directory</span>
          <h3>Available roles</h3>
          <ul className="log-list">{roles.map((role) => (
            <li key={role.role_id}><strong>{role.role_name}</strong>{role.description ? ` · ${role.description}` : ''}</li>
          ))}</ul>
        </div>
      </div>

      <div className="panel table-panel">
        <div className="section-header"><div><span className="kicker">STAFF DIRECTORY</span><h3>Provisioned accounts</h3></div><span>{staffUsers.length} staff</span></div>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>{staffUsers.map((user) => (
            <tr key={user.user_id}>
              <td>{user.first_name} {user.last_name}</td><td>{user.username}</td><td>{user.email}</td>
              <td><span className={`badge ${user.is_active ? 'confirmed' : 'cancelled'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
            </tr>
          ))}
          {!staffUsers.length && <tr><td colSpan="4">No staff accounts yet.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminUsersPage;
