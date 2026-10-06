import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import ChatWidget from './ChatWidget';

function Layout({ visitorAuthState }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="site-shell">
      <div className="leaf-background" aria-hidden="true">
        <span className="floating-leaf leaf-one" />
        <span className="floating-leaf leaf-two" />
        <span className="floating-leaf leaf-three" />
        <span className="floating-leaf leaf-four" />
        <span className="floating-leaf leaf-five" />
        <span className="floating-leaf leaf-six" />
        <span className="floating-leaf leaf-seven" />
        <span className="floating-leaf leaf-eight" />
        <span className="floating-leaf leaf-nine" />
        <span className="floating-leaf leaf-ten" />
      </div>
      <header className="site-header">
        <div className={`container navbar${menuOpen ? ' menu-open' : ''}`}>
          <div className="nav-brand-group">
            <button
              className="mobile-menu-toggle"
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="main-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
            <Link to="/" className="brand" aria-label="Go to home page" onClick={closeMenu}>
              <img src="/ilab-guiguinto-logo.svg" alt="iLAB Guiguinto" className="brand-logo" />
            </Link>
          </div>

          <div className="menu-panel" id="main-navigation" aria-hidden={!menuOpen}>
            <nav className="nav-links" aria-label="Main navigation">
              <Link to="/" onClick={closeMenu}>Home</Link>
              <Link to="/about" onClick={closeMenu}>About</Link>
              {visitorAuthState?.isLoggedIn && <Link to="/my-appointments" onClick={closeMenu}>My visits</Link>}
            </nav>
          </div>

          <div className="nav-actions">
            {visitorAuthState?.isLoggedIn ? (
              <>
                <span className="badge confirmed">Welcome</span>
                <button className="button-ghost" type="button" onClick={visitorAuthState.logout}>Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="button-ghost">Login</Link>
                <Link to="/register" className="button">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <ChatWidget isAuthenticated={Boolean(visitorAuthState?.isLoggedIn)} visitorAuthState={visitorAuthState} />

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>iLAB Guiguinto</strong>
            <div>Facility services and public visitor support</div>
          </div>
          <div className="footer-links">
            <Link to="/contact">Contact</Link>
          </div>
          <div>© 2026 DOST-backed public portal</div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
