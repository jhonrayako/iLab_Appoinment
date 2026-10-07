import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';

function downloadCsv(filename, rows, columns) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    columns.map(([, label]) => quote(label)).join(','),
    ...rows.map((row) => columns.map(([key]) => quote(row[key])).join(',')),
  ].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function ReportTable({ title, rows, columns, filename, loading }) {
  return (
    <div className="panel table-panel">
      <div className="section-header">
        <h3>{title}</h3>
        <button
          className="button small-button"
          type="button"
          disabled={loading || !rows.length}
          onClick={() => downloadCsv(filename, rows, columns)}
        >
          Export CSV
        </button>
      </div>
      <table className="data-table">
        <thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.appointment_id || row.user_id || `${row.facility_id}-${row.date}-${index}`}>
              {columns.map(([key]) => <td key={key}>{row[key] ?? ''}</td>)}
            </tr>
          ))}
          {!rows.length && !loading && <tr><td colSpan={columns.length}>No report data is available yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AdminReportsPage() {
  const [reports, setReports] = useState({ attendance: [], demographics: [], utilization: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminRequest('/analytics/attendance'),
      adminRequest('/analytics/demographics?limit=100'),
      adminRequest('/analytics/capacity-utilization'),
    ]).then(([attendanceResult, demographicsResult, utilizationResult]) => {
      if (!active) return;
      setReports({
        attendance: attendanceResult.attendance || [],
        demographics: demographicsResult.demographics || [],
        utilization: utilizationResult.utilization || [],
      });
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Reports</span>
          <h1>Attendance and demographic reports</h1>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <p role="status">Loading reports…</p>}

      <ReportTable
        title="Attendance"
        rows={reports.attendance}
        filename="ilab-attendance-report.csv"
        loading={loading}
        columns={[
          ['date', 'Date'],
          ['facility_name', 'Facility'],
          ['scheduled', 'Scheduled'],
          ['checked_in', 'Checked in'],
          ['no_show', 'No-show'],
          ['completed', 'Completed'],
        ]}
      />
      <ReportTable
        title="Visitor demographics"
        rows={reports.demographics}
        filename="ilab-visitor-demographics.csv"
        loading={loading}
        columns={[
          ['first_name', 'First name'],
          ['last_name', 'Last name'],
          ['total_bookings', 'Bookings'],
          ['completed_visits', 'Completed visits'],
          ['actual_visits', 'Actual visits'],
        ]}
      />
      <ReportTable
        title="Facility usage"
        rows={reports.utilization}
        filename="ilab-facility-usage.csv"
        loading={loading}
        columns={[
          ['date', 'Date'],
          ['facility_name', 'Facility'],
          ['booked_slots', 'Booked'],
          ['max_capacity', 'Capacity'],
          ['utilization_percent', 'Utilization (%)'],
        ]}
      />
    </div>
  );
}

export default AdminReportsPage;
