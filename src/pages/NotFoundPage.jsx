import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <span className="kicker">404</span>
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist or has been moved.</p>
        <div className="form-actions">
          <Link to="/" className="button">Back to home</Link>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
