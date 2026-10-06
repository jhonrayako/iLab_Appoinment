import { Navigate, Outlet } from 'react-router-dom';

const normalizeRoleName = (roleName) => String(roleName ?? '').trim().toLowerCase();

function AdminProtectedRoute() {
  let adminAuthState = { isLoggedIn: false, user: null };

  try {
    adminAuthState = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{"isLoggedIn":false}');
  } catch {
    adminAuthState = { isLoggedIn: false, user: null };
  }

  const roleName = normalizeRoleName(adminAuthState.user?.role_name || adminAuthState.user?.role || '');

  if (!adminAuthState.isLoggedIn || !['admin', 'administrator'].includes(roleName)) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}

export default AdminProtectedRoute;
