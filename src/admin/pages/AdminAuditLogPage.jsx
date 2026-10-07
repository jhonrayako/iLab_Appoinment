import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';

function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    adminRequest('/audit-log?limit=100')
      .then((result) => {
        if (!active) return;
        setLogs(result.logs || []);
        setError('');
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Audit log</span>
          <h1>Administrative actions and traceability</h1>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <p role="status">Loading audit records…</p>}

      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr><th>Time</th><th>Actor</th><th>Action</th><th>IP Address</th></tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.log_id}>
                <td>{log.recorded_timestamp ? new Date(log.recorded_timestamp).toLocaleString() : 'Unknown'}</td>
                <td>{[log.first_name, log.last_name].filter(Boolean).join(' ') || log.username || 'Unknown user'}</td>
                <td>{log.action_performed}</td>
                <td>{log.ip_address || 'Not recorded'}</td>
              </tr>
            ))}
            {!logs.length && !loading && !error && <tr><td colSpan="4">No audit records are available yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminAuditLogPage;
