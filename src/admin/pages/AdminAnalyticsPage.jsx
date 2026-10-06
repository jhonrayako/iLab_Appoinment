const stats = [
  { label: 'Visitors this month', value: '540' },
  { label: 'Check-ins completed', value: '91%' },
  { label: 'No-shows', value: '7%' },
];

function AdminAnalyticsPage() {
  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Analytics</span>
          <h1>Facility performance overview</h1>
        </div>
      </div>

      <div className="summary-grid admin-grid">
        {stats.map((item) => (
          <div key={item.label} className="summary-card primary">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Capacity utilization</h3>
        <div className="progress-bar">
          <span style={{ width: '68%' }} />
        </div>
        <p>Facility usage remains within operational targets for the current period.</p>
      </div>
    </div>
  );
}

export default AdminAnalyticsPage;
