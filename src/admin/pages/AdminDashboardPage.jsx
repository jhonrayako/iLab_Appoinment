import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function adminRequest(path) {
  const auth = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}');
  const response = await fetch(`${API_URL}/admin${path}`, {
    headers: { Authorization: `Bearer ${auth.token || ''}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Unable to load the admin dashboard.');
  return data;
}

function formatAppointmentDate(value) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState({ total: 0, pending: 0, appointments: [], notifications: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [appointmentsResult, pendingResult, notificationsResult] = await Promise.all([
          adminRequest('/appointments?limit=8'),
          adminRequest('/appointments?status=Pending&limit=1'),
          adminRequest('/notifications'),
        ]);
        if (active) {
          setDashboard({
            total: appointmentsResult.total || 0,
            pending: pendingResult.total || 0,
            appointments: appointmentsResult.appointments || [],
            notifications: notificationsResult.notifications || [],
          });
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDashboard();
    return () => { active = false; };
  }, [refreshVersion]);

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Administrator workspace</span>
          <h1>Operations overview</h1>
        </div>
        <button className="button small-button" type="button" onClick={() => setRefreshVersion((version) => version + 1)} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="summary-grid admin-grid">
        <div className="summary-card primary"><span>All appointments</span><strong>{loading ? '...' : dashboard.total}</strong></div>
        <div className="summary-card warning"><span>Pending requests</span><strong>{loading ? '...' : dashboard.pending}</strong></div>
        <div className="summary-card success"><span>Recent activity</span><strong>{loading ? '...' : dashboard.notifications.length}</strong></div>
      </div>

      <div className="two-col admin-grid">
        <div className="panel">
          <div className="section-header">
            <div><span className="kicker">Latest records</span><h3>Appointments</h3></div>
            <Link to="/admin/appointments">View all</Link>
          </div>
          {dashboard.appointments.length ? (
            <ul className="notification-list">
              {dashboard.appointments.map((appointment) => (
                <li key={appointment.appointment_id}>
                  <strong>{appointment.first_name} {appointment.last_name}</strong> · {appointment.topic || 'General visit'}
                  <br /><small>{appointment.facility_name} · {formatAppointmentDate(appointment.start_time)} · {appointment.status}</small>
                </li>
              ))}
            </ul>
          ) : <p>{loading ? 'Loading appointments...' : 'No appointments to show yet.'}</p>}
        </div>

        <div className="panel">
          <div className="section-header">
            <div><span className="kicker">Needs attention</span><h3>Recent requests</h3></div>
            <Link to="/admin/notifications">View notices</Link>
          </div>
          {dashboard.notifications.length ? (
            <ul className="notification-list">
              {dashboard.notifications.slice(0, 5).map((notification) => (
                <li key={notification.appointment_id}>
                  <strong>{notification.type === 'new' ? 'New appointment request' : `${notification.status} appointment`}</strong>
                  <br />{notification.first_name} {notification.last_name} · {notification.topic || 'General visit'}
                </li>
              ))}
            </ul>
          ) : <p>{loading ? 'Loading requests...' : 'No recent requests.'}</p>}
        </div>
      </div>

      <div className="panel">
        <span className="kicker">Quick access</span>
        <div className="content-actions">
          <Link className="button" to="/admin/appointments">Manage appointments</Link>
          <Link className="button secondary-button" to="/admin/users">Manage staff access</Link>
          <Link className="button secondary-button" to="/admin/content">Edit homepage content</Link>
          <Link className="button secondary-button" to="/admin/facilities">Manage facilities</Link>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
