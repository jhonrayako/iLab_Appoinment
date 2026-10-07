import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';

const initialAnalytics = { visitorStats: [], utilization: [], attendance: [] };

function formatPercent(numerator, denominator) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminRequest('/analytics/visitor-stats'),
      adminRequest('/analytics/capacity-utilization'),
      adminRequest('/analytics/attendance'),
    ]).then(([visitorStats, utilization, attendance]) => {
      if (!active) return;
      setAnalytics({
        visitorStats: visitorStats.stats || [],
        utilization: utilization.utilization || [],
        attendance: attendance.attendance || [],
      });
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const totals = analytics.visitorStats.reduce((sum, row) => ({
    visits: sum.visits + Number(row.total_appointments || 0),
    confirmed: sum.confirmed + Number(row.confirmed || 0),
    pending: sum.pending + Number(row.pending || 0),
    completed: sum.completed + Number(row.completed || 0),
  }), { visits: 0, confirmed: 0, pending: 0, completed: 0 });
  const attendanceTotals = analytics.attendance.reduce((sum, row) => ({
    scheduled: sum.scheduled + Number(row.scheduled || 0),
    checkedIn: sum.checkedIn + Number(row.checked_in || 0),
    noShow: sum.noShow + Number(row.no_show || 0),
  }), { scheduled: 0, checkedIn: 0, noShow: 0 });
  const averageUtilization = analytics.utilization.length
    ? analytics.utilization.reduce((sum, row) => sum + Number(row.utilization_percent || 0), 0) / analytics.utilization.length
    : 0;

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Analytics</span>
          <h1>Facility performance overview</h1>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <p role="status">Loading analytics…</p>}

      <div className="summary-grid admin-grid">
        <div className="summary-card primary"><span>Appointments</span><strong>{totals.visits}</strong></div>
        <div className="summary-card warning"><span>Pending requests</span><strong>{totals.pending}</strong></div>
        <div className="summary-card success"><span>Check-ins completed</span><strong>{formatPercent(attendanceTotals.checkedIn, attendanceTotals.scheduled)}</strong></div>
        <div className="summary-card"><span>No-shows</span><strong>{formatPercent(attendanceTotals.noShow, attendanceTotals.scheduled)}</strong></div>
      </div>

      <div className="panel">
        <h3>Facility capacity utilization</h3>
        {analytics.utilization.length ? (
          <table className="data-table">
            <thead><tr><th>Facility</th><th>Date</th><th>Booked</th><th>Capacity</th><th>Utilization</th></tr></thead>
            <tbody>{analytics.utilization.map((row, index) => (
              <tr key={`${row.facility_id}-${row.date}-${index}`}>
                <td>{row.facility_name}</td>
                <td>{new Date(row.date).toLocaleDateString()}</td>
                <td>{row.booked_slots}</td>
                <td>{row.max_capacity}</td>
                <td>{row.utilization_percent}%</td>
              </tr>
            ))}</tbody>
          </table>
        ) : !loading && !error ? <p>No capacity data is available yet.</p> : null}
        <p>Average utilization for returned facility records: {averageUtilization.toFixed(1)}%.</p>
      </div>

      <div className="panel">
        <h3>Daily appointment activity</h3>
        {analytics.visitorStats.length ? (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Total</th><th>Confirmed</th><th>Pending</th><th>Completed</th><th>Cancelled</th></tr></thead>
            <tbody>{analytics.visitorStats.map((row) => (
              <tr key={String(row.date)}>
                <td>{new Date(row.date).toLocaleDateString()}</td>
                <td>{row.total_appointments}</td>
                <td>{row.confirmed}</td>
                <td>{row.pending}</td>
                <td>{row.completed}</td>
                <td>{row.cancelled}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : !loading && !error ? <p>No appointment activity is available yet.</p> : null}
        <p>{totals.confirmed} appointments are currently counted as confirmed.</p>
      </div>
    </div>
  );
}

export default AdminAnalyticsPage;
