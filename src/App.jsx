import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';
import AdminLoginPage from './admin/pages/AdminLoginPage';
import AdminLayout from './admin/components/AdminLayout';
import AdminProtectedRoute from './admin/components/AdminProtectedRoute';
import AdminDashboardPage from './admin/pages/AdminDashboardPage';
import AdminAppointmentsPage from './admin/pages/AdminAppointmentsPage';
import AdminAnalyticsPage from './admin/pages/AdminAnalyticsPage';
import AdminChatbotPage from './admin/pages/AdminChatbotPage';
import AdminNotificationsPage from './admin/pages/AdminNotificationsPage';
import AdminSentimentPage from './admin/pages/AdminSentimentPage';
import AdminReportsPage from './admin/pages/AdminReportsPage';
import AdminUsersPage from './admin/pages/AdminUsersPage';
import AdminFacilitiesPage from './admin/pages/AdminFacilitiesPage';
import AdminAuditLogPage from './admin/pages/AdminAuditLogPage';
import AdminContentPage from './admin/pages/AdminContentPage';
import StaffLoginPage from './staff/pages/StaffLoginPage';
import StaffLayout from './staff/components/StaffLayout';
import StaffProtectedRoute from './staff/components/StaffProtectedRoute';
import StaffDashboardPage from './staff/pages/StaffDashboardPage';
import StaffAppointmentsPage from './staff/pages/StaffAppointmentsPage';
import StaffNotificationsPage from './staff/pages/StaffNotificationsPage';
import StaffELoggingPage from './staff/pages/StaffELoggingPage';
import StaffAccountPage from './staff/pages/StaffAccountPage';
import VisitorProtectedRoute from './components/VisitorProtectedRoute';
import BookingPage from './pages/BookingPage';
import MyAppointmentsPage from './pages/MyAppointmentsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

const VISITOR_STORAGE_KEY = 'ilab_visitor_auth';

function getStoredVisitorAuth() {
  try {
    const value = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (!value) return { isLoggedIn: false, user: null, token: '' };
    return JSON.parse(value);
  } catch {
    return { isLoggedIn: false, user: null, token: '' };
  }
}

function App() {
  const { pathname } = useLocation();
  const [visitorAuthState, setVisitorAuthState] = useState(getStoredVisitorAuth);

  useEffect(() => {
    document.title = pathname.startsWith('/staff')
      ? 'iLAB Guiguinto | Staff Portal'
      : pathname.startsWith('/admin')
        ? 'iLAB Guiguinto | Admin Portal'
        : 'iLAB Guiguinto | Visitor Portal';
  }, [pathname]);

  useEffect(() => {
    localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(visitorAuthState));
  }, [visitorAuthState]);

  const visitorAuth = useMemo(
    () => ({
      ...visitorAuthState,
      login: (next) => setVisitorAuthState({ isLoggedIn: true, user: next.user ?? next, token: next.token ?? '' }),
      logout: () => setVisitorAuthState({ isLoggedIn: false, user: null, token: '' }),
    }),
    [visitorAuthState]
  );

  return (
    <Routes>
      <Route path="/" element={<Layout visitorAuthState={visitorAuth} />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="login" element={<LoginPage visitorAuthState={visitorAuth} />} />
        <Route path="register" element={<RegisterPage visitorAuthState={visitorAuth} />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route element={<VisitorProtectedRoute isAuthenticated={visitorAuth.isLoggedIn} />}>
          <Route path="book" element={<BookingPage visitorAuthState={visitorAuth} />} />
          <Route path="my-appointments" element={<MyAppointmentsPage visitorAuthState={visitorAuth} />} />
        </Route>
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>

      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<AdminProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="appointments" element={<AdminAppointmentsPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="chatbot" element={<AdminChatbotPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
          <Route path="sentiment" element={<AdminSentimentPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="facilities" element={<AdminFacilitiesPage />} />
          <Route path="content" element={<AdminContentPage />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="/staff/login" element={<StaffLoginPage />} />
      <Route element={<StaffProtectedRoute />}>
        <Route path="/staff" element={<StaffLayout />}>
          <Route path="dashboard" element={<StaffDashboardPage />} />
          <Route path="appointments" element={<StaffAppointmentsPage />} />
          <Route path="notifications" element={<StaffNotificationsPage />} />
          <Route path="e-logging" element={<StaffELoggingPage />} />
          <Route path="account" element={<StaffAccountPage />} />
          <Route index element={<Navigate to="/staff/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/staff/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
