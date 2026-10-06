const logs = [
  { time: '2026-09-02 08:15 AM', actor: 'Administrator', action: 'Updated facility capacity setting', ip: '192.168.0.15' },
  { time: '2026-09-02 09:40 AM', actor: 'Administrator', action: 'Reviewed visitor activity log', ip: '192.168.0.20' },
  { time: '2026-09-02 11:05 AM', actor: 'Administrator', action: 'Updated visitor access policy', ip: '192.168.0.15' },
];

function AdminAuditLogPage() {
  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Audit log</span>
          <h1>Administrative actions and traceability</h1>
        </div>
      </div>

      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={`${log.actor}-${log.time}`}>
                <td>{log.time}</td>
                <td>{log.actor}</td>
                <td>{log.action}</td>
                <td>{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminAuditLogPage;
