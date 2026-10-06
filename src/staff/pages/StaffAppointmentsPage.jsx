import { useEffect, useState } from 'react';
import { formatStaffDate, staffRequest } from '../staffApi';

const statuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed'];

function StaffAppointmentsPage() {
  const [filters, setFilters] = useState({ date: '', status: '', search: '' });
  const [appointments, setAppointments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [detailBusy, setDetailBusy] = useState(false);
  const [staffPass, setStaffPass] = useState(null);

  const refreshAppointments = () => {
    setPage(0);
    setRefreshVersion((version) => version + 1);
  };

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      params.set('limit', '50');
      params.set('offset', String(page * 50));
      try {
        const result = await staffRequest(`/appointments?${params}`);
        if (active) {
          setAppointments((current) => page === 0 ? result.appointments || [] : [...current, ...(result.appointments || [])]);
          setTotal(result.total || 0);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }, filters.search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, page, refreshVersion]);

  useEffect(() => {
    window.addEventListener('ilab:appointment-request', refreshAppointments);
    return () => window.removeEventListener('ilab:appointment-request', refreshAppointments);
  }, []);

  const updateFilters = (nextFilters) => {
    setPage(0);
    setFilters(nextFilters);
  };

  const showDetails = async (id) => {
    try {
      const result = await staffRequest(`/appointments/${id}`);
      setSelected(result.appointment);
      setStaffPass(null);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const acceptAppointment = async () => {
    setDetailBusy(true);
    setError('');
    try {
      const result = await staffRequest(`/appointments/${selected.appointment_id}/confirm`, { method: 'POST' });
      setSelected((current) => ({ ...current, ...result.appointment }));
      refreshAppointments();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailBusy(false);
    }
  };

  const generatePass = async () => {
    setDetailBusy(true);
    setError('');
    try {
      const result = await staffRequest(`/appointments/${selected.appointment_id}/pass`);
      setStaffPass(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailBusy(false);
    }
  };

  return (
    <section className="staff-page">
      <div className="staff-page-heading">
        <div><span className="staff-overline">VISITOR SCHEDULE</span><h1>Appointments</h1></div>
        <span className="staff-record-count">{appointments.length} of {total} records</span>
      </div>
      {error && <div className="staff-error" role="alert">{error}</div>}
      <section className="staff-section staff-appointments-section">
        <div className="staff-filters">
          <label>Visitor or topic<input type="search" value={filters.search} placeholder="Search names, email, topic" onChange={(event) => updateFilters({ ...filters, search: event.target.value })} /></label>
          <label>Date<input type="date" value={filters.date} onChange={(event) => updateFilters({ ...filters, date: event.target.value })} /></label>
          <label>Status<select value={filters.status} onChange={(event) => updateFilters({ ...filters, status: event.target.value })}>
            <option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}
          </select></label>
          <button className="staff-filter-reset" type="button" onClick={() => updateFilters({ date: '', status: '', search: '' })}>Reset</button>
          <button className="staff-filter-reset" type="button" onClick={refreshAppointments} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead><tr><th>Visitor</th><th>Visit</th><th>Date &amp; time</th><th>Status</th><th /></tr></thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.appointment_id}>
                  <td><strong>{appointment.first_name} {appointment.last_name}</strong><small>{appointment.email}</small></td>
                  <td>{appointment.topic || 'General visit'}<small>{appointment.facility_name}</small></td>
                  <td>{formatStaffDate(appointment.start_time)}<small>Until {formatStaffDate(appointment.end_time, { dateStyle: undefined })}</small></td>
                  <td><span className={`staff-status ${appointment.status.toLowerCase()}`}>{appointment.status}</span></td>
                  <td><button className="staff-row-action" type="button" onClick={() => showDetails(appointment.appointment_id)} aria-label={`View ${appointment.first_name} ${appointment.last_name} appointment`}>View <span>↗</span></button></td>
                </tr>
              ))}
              {!loading && appointments.length === 0 && <tr><td colSpan="5" className="staff-table-empty">No appointments match these filters.</td></tr>}
              {loading && <tr><td colSpan="5" className="staff-table-empty">Loading appointments...</td></tr>}
            </tbody>
          </table>
        </div>
        {appointments.length < total && <div className="staff-load-more"><button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading}>Load more appointments</button></div>}
      </section>
      {selected && (
        <div className="staff-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="staff-detail-panel" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title">
            <button className="staff-detail-close" type="button" onClick={() => setSelected(null)} aria-label="Close appointment details">×</button>
            <span className="staff-overline">APPOINTMENT DETAILS</span>
            <h2 id="appointment-detail-title">{selected.first_name} {selected.last_name}</h2>
            <dl>
              <div><dt>Contact</dt><dd>{selected.email}</dd></div>
              <div><dt>Requested topic</dt><dd>{selected.topic || 'General visit'}</dd></div>
              <div><dt>Facility</dt><dd>{selected.facility_name}</dd></div>
              <div><dt>Schedule</dt><dd>{formatStaffDate(selected.start_time)} – {formatStaffDate(selected.end_time)}</dd></div>
              <div><dt>Status</dt><dd><span className={`staff-status ${selected.status.toLowerCase()}`}>{selected.status}</span></dd></div>
              <div><dt>Check-in</dt><dd>{formatStaffDate(selected.log?.check_in_time)}</dd></div>
              <div><dt>Check-out</dt><dd>{formatStaffDate(selected.log?.check_out_time)}</dd></div>
            </dl>
            {selected.status === 'Pending' && <button className="staff-primary-button" type="button" onClick={acceptAppointment} disabled={detailBusy}>
              {detailBusy ? 'Accepting...' : 'Accept appointment'}
            </button>}
            {selected.status === 'Confirmed' && <button className="staff-primary-button" type="button" onClick={generatePass} disabled={detailBusy}>
              {detailBusy ? 'Generating...' : 'Generate QR code'}
            </button>}
            {staffPass && <div className="visitor-pass">
              <img src={staffPass.qr_code} alt="QR code for visitor check-in" />
              <span>Valid until {formatStaffDate(staffPass.expires_at)}</span>
            </div>}
          </section>
        </div>
      )}
    </section>
  );
}

export default StaffAppointmentsPage;