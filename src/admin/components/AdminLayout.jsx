import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import useAppointmentNotifications from '../../hooks/useAppointmentNotifications';

function AdminLayout() {
  const navigate = useNavigate();
  let adminAuth = {};
  try {
    adminAuth = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}');
  } catch {
    adminAuth = {};
  }
  const { latestNotification, dismissNotification } = useAppointmentNotifications(adminAuth.token);
  const logout = () => {
    localStorage.removeItem('ilab_admin_auth');
    navigate('/admin/login', { replace: true });
  };
  const navItems = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/appointments', label: 'Appointments' },
    { to: '/admin/analytics', label: 'Analytics' },
    { to: '/admin/chatbot', label: 'Chatbot' },
    { to: '/admin/notifications', label: 'Notifications' },
    { to: '/admin/sentiment', label: 'Sentiment' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/users', label: 'Users & Roles' },
    { to: '/admin/facilities', label: 'Facilities' },
    { to: '/admin/content', label: 'Content' },
    { to: '/admin/audit-log', label: 'Audit Log' },
  ];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand" aria-label="iLAB Guiguinto admin">
          <div className="ilab-brand-mark admin-brand-icon">
            <span className="ilab-brand-i">i</span>
            <span className="ilab-brand-lab">LAB</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'admin-nav-item active' : 'admin-nav-item')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button type="button" onClick={logout} className="button small-button">Logout</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="kicker">Administration</span>
            <h2>System operations</h2>
          </div>
          <div className="admin-user">Administrator</div>
        </header>

        {latestNotification && <div className="portal-request-toast" role="status">
          <span><strong>New appointment request</strong><small>{latestNotification.first_name} {latestNotification.last_name} · {latestNotification.topic || 'General visit'}</small></span>
          <Link to="/admin/notifications">Review</Link>
          <button type="button" onClick={dismissNotification} aria-label="Dismiss notification">×</button>
        </div>}
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
