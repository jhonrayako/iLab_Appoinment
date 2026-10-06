function AdminReportsPage() {
  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Reports</span>
          <h1>Attendance and demographic reports</h1>
        </div>
      </div>

      <div className="panel">
        <h3>Available exports</h3>
        <ul className="log-list">
          <li>Daily attendance report</li>
          <li>Monthly visitor demographics</li>
          <li>Facility usage summary</li>
        </ul>
      </div>
    </div>
  );
}

export default AdminReportsPage;
