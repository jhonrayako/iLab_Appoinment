import { useCallback, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const PAGE_SIZE = 50;
const statuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed'];

async function adminRequest(path, options = {}) {
  let auth = {};
  try {
    auth = JSON.parse(localStorage.getItem('ilab_admin_auth') || '{}');
  } catch {
    throw new Error('Your admin session could not be read. Please sign in again.');
  }

  const headers = new Headers(options.headers || {});
  if (auth.token) headers.set('Authorization', `Bearer ${auth.token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_URL}/admin${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || 'Unable to complete the request.');
  return data;
}

function formatAppointmentDate(value) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [status, setStatus] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refreshAppointments = useCallback(() => {
    setOffset(0);
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const loadAppointments = async () => {
      setLoading(true);
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (status) params.set('status', status);
      try {
        const result = await adminRequest(`/appointments?${params}`);
        if (!active) return;
        setAppointments((current) => offset === 0
          ? result.appointments || []
          : [...current, ...(result.appointments || [])]);
        setTotal(result.total || 0);
        setError('');
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAppointments();
    return () => { active = false; };
  }, [offset, status, refreshVersion]);

  useEffect(() => {
    window.addEventListener('ilab:appointment-request', refreshAppointments);
    const timer = window.setInterval(refreshAppointments, 30000);
    return () => {
      window.removeEventListener('ilab:appointment-request', refreshAppointments);
      window.clearInterval(timer);
    };
  }, [refreshAppointments]);

  const updateStatus = async (appointment, action) => {
    if (action === 'cancel' && !window.confirm('Cancel this appointment request? The visitor will be notified.')) return;
    setBusyId(appointment.appointment_id);
    setError('');
    setMessage('');
    try {
      const path = action === 'confirm'
        ? `/appointments/${appointment.appointment_id}/confirm`
        : `/appointments/${appointment.appointment_id}/cancel`;
      await adminRequest(path, { method: action === 'confirm' ? 'POST' : 'DELETE' });
      setMessage(action === 'confirm'
        ? 'Appointment confirmed. The visitor can now access their visit pass.'
        : 'Appointment cancelled. The visitor will be notified.');
      refreshAppointments();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Appointments</span>
          <h1>Appointment requests</h1>
          <p>Requests submitted by visitors, including through the chatbot, appear here for review.</p>
        </div>
        <button className="button small-button" type="button" onClick={refreshAppointments} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div className="success-banner" role="status">{message}</div>}

      <div className="admin-appointment-toolbar">
        <label htmlFor="admin-appointment-status">Filter by status</label>
        <select
          id="admin-appointment-status"
          value={status}
          onChange={(event) => { setStatus(event.target.value); setOffset(0); }}
        >
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span>{appointments.length} of {total} appointments</span>
      </div>

      <div className="panel table-panel">
        <table className="data-table admin-appointments-table">
          <thead>
            <tr>
              <th>Visitor</th>
              <th>Visit</th>
              <th>Date &amp; time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr key={appointment.appointment_id}>
                <td>
                  <strong>{appointment.first_name} {appointment.last_name}</strong>
                  <small>{appointment.email}</small>
                </td>
                <td>
                  {appointment.topic || 'General visit'}
                  <small>{appointment.facility_name}</small>
                </td>
                <td>{formatAppointmentDate(appointment.start_time)}</td>
                <td><span className={`badge ${appointment.status.toLowerCase()}`}>{appointment.status}</span></td>
                <td>
                  <div className="admin-appointment-actions">
                    {appointment.status === 'Pending' && (
                      <button
                        className="button small-button"
                        type="button"
                        disabled={busyId === appointment.appointment_id}
                        onClick={() => updateStatus(appointment, 'confirm')}
                      >
                        {busyId === appointment.appointment_id ? 'Saving...' : 'Confirm'}
                      </button>
                    )}
                    {['Pending', 'Confirmed'].includes(appointment.status) && (
                      <button
                        className="button-ghost"
                        type="button"
                        disabled={busyId === appointment.appointment_id}
                        onClick={() => updateStatus(appointment, 'cancel')}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan="5" className="admin-appointments-empty">Loading appointments...</td></tr>}
            {!loading && appointments.length === 0 && (
              <tr><td colSpan="5" className="admin-appointments-empty">No appointments match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {appointments.length < total && (
        <div className="admin-appointments-more">
          <button
            className="button secondary-button"
            type="button"
            disabled={loading}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            Load more appointments
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminAppointmentsPage;
