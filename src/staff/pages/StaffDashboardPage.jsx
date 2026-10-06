import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatStaffDate, getStaffAuth, staffRequest } from '../staffApi';

function StaffDashboardPage() {
  const staffName = getStaffAuth()?.user?.first_name || getStaffAuth()?.user?.username || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [dashboard, setDashboard] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [overview, flow] = await Promise.all([
          staffRequest('/dashboard'),
          staffRequest('/flow'),
        ]);
        if (active) {
          setDashboard(overview);
          setFacilities(flow.facilities || []);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const summary = dashboard?.summary;
  const priorityNotifications = (dashboard?.notifications || []).slice(0, 3);
  const attentionItems = [
    { label: 'Scheduled arrivals', value: summary?.todays_appointments ?? 0, tone: 'green' },
    { label: 'Need check-in', value: summary?.pending_check_ins ?? 0, tone: 'coral' },
    { label: 'Open facilities', value: facilities.length || 0, tone: 'gold' },
  ];

  return (
    <section className="staff-page">
      <div className="staff-page-heading">
        <div>
          <span className="staff-overline">TODAY AT THE DESK</span>
          <h1>{greeting}, {staffName}.</h1>
        </div>
        <Link className="staff-primary-link" to="/staff/appointments">Review appointments <span>→</span></Link>
      </div>

      {error && <div className="staff-error" role="alert">{error}</div>}

      <div className="staff-metrics">
        {attentionItems.map((item) => (
          <article key={item.label} className={`staff-metric staff-metric-${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>
              {item.label === 'Scheduled arrivals' && 'Pending and confirmed visits'}
              {item.label === 'Need check-in' && 'Confirmed appointments not checked in'}
              {item.label === 'Open facilities' && 'Active visitor locations'}
            </small>
          </article>
        ))}
      </div>

      <div className="staff-dashboard-grid">
        <section className="staff-section staff-overview-panel">
          <div className="staff-section-heading">
            <div><span className="staff-overline">LIVE OCCUPANCY</span><h2>Visitor flow</h2></div>
            <Link to="/staff/appointments">Review appointments <span>↗</span></Link>
          </div>

          <div className="staff-flow-summary">
            <span>Desk capacity</span>
            <strong>{facilities.reduce((total, facility) => total + Number(facility.current_visitors || 0), 0) || 0}</strong>
            <p>Visitors currently checked in across all active facilities</p>
          </div>

          <div className="staff-flow-list">
            {facilities.length ? facilities.map((facility) => (
              <article className="staff-flow-row" key={facility.facility_id}>
                <div className="staff-flow-name"><strong>{facility.facility_name}</strong><small>{facility.location}</small></div>
                <div className="staff-flow-meter" aria-label={`${facility.current_visitors} of ${facility.max_capacity} visitors`}>
                  <span style={{ width: `${Math.min(facility.capacity_percentage, 100)}%` }} />
                </div>
                <div className="staff-flow-count"><strong>{facility.current_visitors}</strong><small> / {facility.max_capacity}</small></div>
              </article>
            )) : <p className="staff-empty">Visitor flow will appear when data is available.</p>}
          </div>
        </section>

        <section className="staff-section staff-notice-section">
          <div className="staff-section-heading">
            <div><span className="staff-overline">RECENT ACTIVITY</span><h2>Desk notices</h2></div>
            <Link to="/staff/notifications">All notices <span>↗</span></Link>
          </div>

          <div className="staff-briefing-card">
            <h3>Priority queue</h3>
            <ul>
              <li><strong>{summary?.pending_check_ins ?? 0}</strong> visitors still need check-in.</li>
              <li><strong>{summary?.todays_appointments ?? 0}</strong> appointments are scheduled today.</li>
              <li><strong>{facilities.length || 0}</strong> active facilities are open.</li>
            </ul>
          </div>

          <div className="staff-notice-list">
            {priorityNotifications.length ? priorityNotifications.map((notice) => (
              <article className="staff-notice" key={notice.appointment_id}>
                <span className={`staff-notice-dot ${notice.type}`} />
                <div className="staff-notice-main">
                  <strong>{notice.type === 'new' ? 'New appointment request' : `${notice.status} appointment`}</strong>
                  <p>{notice.first_name} {notice.last_name} · {notice.topic || 'General visit'}</p>
                  <small>{formatStaffDate(notice.occurred_at)}</small>
                </div>
              </article>
            )) : <p className="staff-empty">No recent appointment activity.</p>}
          </div>
        </section>
      </div>

      <div className="staff-quick-links">
        <Link to="/staff/appointments"><span>02</span><strong>Review appointments</strong><b>→</b></Link>
        <Link to="/staff/notifications"><span>03</span><strong>Review desk notices</strong><b>→</b></Link>
      </div>
    </section>
  );
}

export default StaffDashboardPage;