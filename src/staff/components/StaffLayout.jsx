import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getStaffAuth, STAFF_STORAGE_KEY } from '../staffApi';
import useAppointmentNotifications from '../../hooks/useAppointmentNotifications';

const navItems = [
  { to: '/staff/dashboard', label: 'Overview', mark: '01' },
  { to: '/staff/appointments', label: 'Appointments', mark: '02' },
  { to: '/staff/notifications', label: 'Notifications', mark: '03' },
  { to: '/staff/account', label: 'Account', mark: '04' },
];

function StaffLayout() {
  const navigate = useNavigate();
  const auth = getStaffAuth();
  const name = auth?.user?.first_name || auth?.user?.username || 'Staff';
  const { latestNotification, dismissNotification } = useAppointmentNotifications(auth?.token);

  const logout = () => {
    localStorage.removeItem(STAFF_STORAGE_KEY);
    navigate('/staff/login', { replace: true });
  };

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <div className="staff-brand">
          <div className="ilab-brand-mark" aria-hidden="true">
            <span className="ilab-brand-i">i</span><span className="ilab-brand-lab">LAB</span>
          </div>
          <span className="staff-brand-caption">FRONT DESK</span>
        </div>
        <nav className="staff-nav" aria-label="Staff navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `staff-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="staff-nav-mark">{item.mark}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="staff-sidebar-bottom">
          <div className="staff-identity">
            <span className="staff-avatar">{name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{name}</strong><small>Staff account</small></span>
          </div>
          <button className="staff-logout" onClick={logout} type="button">
            <span aria-hidden="true">↗</span> Sign out
          </button>
        </div>
      </aside>
      <main className="staff-main">
        <header className="staff-topbar">
          <div>
            <span className="staff-date-label">ILAB GUIGUINTO / VISITOR SERVICES</span>
            <div className="staff-live"><span /> Operations desk</div>
          </div>
          <time>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</time>
        </header>
        {latestNotification && <div className="portal-request-toast" role="status">
          <span><strong>New appointment request</strong><small>{latestNotification.first_name} {latestNotification.last_name} · {latestNotification.topic || 'General visit'}</small></span>
          <Link to="/staff/notifications">Review</Link>
          <button type="button" onClick={dismissNotification} aria-label="Dismiss notification">×</button>
        </div>}
        <Outlet />
      </main>
    </div>
  );
}

export default StaffLayout;