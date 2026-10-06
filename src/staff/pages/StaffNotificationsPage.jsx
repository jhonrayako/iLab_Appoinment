import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatStaffDate, staffRequest } from '../staffApi';

function mergeNotification(current, notification) {
  return [notification, ...current.filter((item) => item.appointment_id !== notification.appointment_id)];
}

function StaffNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await staffRequest('/notifications');
        if (active) { setNotifications(result.notifications || []); setError(''); }
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
      setNotifications((current) => mergeNotification(current, event.detail));
    };
    window.addEventListener('ilab:appointment-request', onNewAppointment);
    return () => window.removeEventListener('ilab:appointment-request', onNewAppointment);
  }, []);

  return (
    <section className="staff-page">
      <div className="staff-page-heading">
        <div><span className="staff-overline">APPOINTMENT ACTIVITY / AUTO-REFRESH 30 SEC</span><h1>Notifications</h1></div>
        <Link className="staff-primary-link" to="/staff/appointments">View appointments <span>→</span></Link>
      </div>
      {error && <div className="staff-error" role="alert">{error}</div>}
      <section className="staff-section">
        <div className="staff-notice-list staff-notice-list-full">
          {notifications.map((notice) => (
            <article className="staff-notice" key={notice.appointment_id}>
              <span className={`staff-notice-dot ${notice.type}`} />
              <div className="staff-notice-main">
                <strong>{notice.type === 'new' ? 'New appointment request' : `${notice.status} appointment`}</strong>
                <p>{notice.first_name} {notice.last_name} · {notice.topic || 'General visit'}</p>
                <small>Visit {formatStaffDate(notice.start_time)} · Updated {formatStaffDate(notice.occurred_at)}</small>
              </div>
              <span className={`staff-status ${notice.status.toLowerCase()}`}>{notice.status}</span>
            </article>
          ))}
          {!notifications.length && !error && <p className="staff-empty">No recent appointment activity.</p>}
        </div>
      </section>
    </section>
  );
}

export default StaffNotificationsPage;