import { Navigate, Outlet } from 'react-router-dom';
import { getStaffAuth } from '../staffApi';

const normalizeRoleName = (roleName) => String(roleName ?? '').trim().toLowerCase();

function StaffProtectedRoute() {
  const auth = getStaffAuth();
  const roleName = normalizeRoleName(auth?.user?.role_name || auth?.user?.role || '');

  if (!auth?.isLoggedIn || !['staff'].includes(roleName) || !auth.token) {
    return <Navigate to="/staff/login" replace />;
  }
  return <Outlet />;
}

export default StaffProtectedRoute;