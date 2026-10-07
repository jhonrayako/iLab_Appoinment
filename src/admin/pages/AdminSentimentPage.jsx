import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';

const emptySummary = { Positive: 0, Neutral: 0, Negative: 0, total: 0 };

function AdminSentimentPage() {
  const [summary, setSummary] = useState(emptySummary);
  const [trend, setTrend] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminRequest('/sentiment/summary'),
      adminRequest('/sentiment/trend?period=day&limit=30'),
    ]).then(([summaryResult, trendResult]) => {
      if (!active) return;
      setSummary(summaryResult.summary || emptySummary);
      setTrend(trendResult.trend || []);
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const count = (label) => Number(summary[label] || 0);
  const percentage = (label) => summary.total
    ? `${Math.round((count(label) / Number(summary.total)) * 100)}%`
    : '0%';

  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Visitor sentiment</span>
          <h1>NLP feedback summary</h1>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <p role="status">Loading feedback analytics…</p>}

      <div className="summary-grid admin-grid">
        {['Positive', 'Neutral', 'Negative'].map((label) => (
          <div key={label} className="summary-card">
            <span>{label} feedback</span>
            <strong>{percentage(label)}</strong>
            <small>{count(label)} of {Number(summary.total || 0)} submissions</small>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Feedback sentiment over time</h3>
        {trend.length ? (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Positive</th><th>Neutral</th><th>Negative</th><th>Total</th></tr></thead>
            <tbody>{trend.map((row) => (
              <tr key={String(row.period)}>
                <td>{new Date(row.period).toLocaleDateString()}</td>
                <td>{row.Positive}</td>
                <td>{row.Neutral}</td>
                <td>{row.Negative}</td>
                <td>{row.total}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : !loading && !error ? <p>No visitor feedback has been submitted yet.</p> : null}
      </div>
    </div>
  );
}

export default AdminSentimentPage;
