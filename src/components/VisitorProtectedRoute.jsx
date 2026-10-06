import { Navigate, Outlet, useLocation } from 'react-router-dom';

function VisitorProtectedRoute({ isAuthenticated }) {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export default VisitorProtectedRoute;