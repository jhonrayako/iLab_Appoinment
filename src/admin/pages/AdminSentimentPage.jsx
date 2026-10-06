const sentimentData = [
  { label: 'Positive', value: '72%' },
  { label: 'Neutral', value: '18%' },
  { label: 'Negative', value: '10%' },
];

function AdminSentimentPage() {
  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Visitor sentiment</span>
          <h1>NLP feedback summary</h1>
        </div>
      </div>

      <div className="summary-grid admin-grid">
        {sentimentData.map((entry) => (
          <div key={entry.label} className="summary-card success">
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Recent trends</h3>
        <p>Positive sentiment increased over the last 30 days, while negative comments were limited to scheduling delays and facility information clarity.</p>
      </div>
    </div>
  );
}

export default AdminSentimentPage;
