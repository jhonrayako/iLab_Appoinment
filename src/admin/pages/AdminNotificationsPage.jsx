import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function formatNotificationDate(value) {
  if (!value) return 'Just now';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const auth = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}');
        const response = await fetch(`${API_URL}/admin/notifications`, {
          headers: { Authorization: `Bearer ${auth.token || ''}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Unable to load notifications.');
        if (active) { setNotifications(data.notifications || []); setError(''); }
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const onNewAppointment = (event) => {
      setNotifications((current) => [event.detail, ...current.filter((item) => item.appointment_id !== event.detail.appointment_id)]);
    };
    window.addEventListener('ilab:appointment-request', onNewAppointment);
    return () => window.removeEventListener('ilab:appointment-request', onNewAppointment);
  }, []);

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Notifications</span>
          <h1>System alerts and operational notices</h1>
        </div>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="notification-stack">
        {notifications.map((notification) => (
          <div key={notification.appointment_id} className={`notification-card ${notification.type}`}>
            <strong>{notification.type === 'new' ? 'New appointment request' : `${notification.status} appointment`}</strong>
            <p>{notification.first_name} {notification.last_name} · {notification.topic || 'General visit'} · {notification.facility_name}</p>
            <small>Visit {formatNotificationDate(notification.start_time)} · Updated {formatNotificationDate(notification.occurred_at)}</small>
          </div>
        ))}
        {!notifications.length && !error && <p>No recent appointment requests.</p>}
      </div>
    </div>
  );
}

export default AdminNotificationsPage;
