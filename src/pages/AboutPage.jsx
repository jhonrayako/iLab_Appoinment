function AboutPage() {
  return (
    <div className="page-header">
      <div className="container">
        <span className="kicker">About iLAB</span>
        <h1>Science and service for a more resilient agricultural future.</h1>
      </div>

      <section className="section page-block">
        <div className="container inline-grid">
          <div>
            <p>
              iLAB Guiguinto is a DOST-backed facility focused on tissue culture, ornamental plant development,
              and agriculture-related innovation for communities in Bulacan and nearby areas.
            </p>
            <p>
              The facility supports public learning, technical assistance, and agriculture-based enterprise
              development through practical research and accessible service pathways.
            </p>
          </div>

          <div className="card">
            <h3>Mission</h3>
            <p>
              To promote science-based agricultural solutions, support community knowledge-sharing, and make
              modern plant propagation technologies accessible to the public and relevant stakeholders.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="info-grid">
            <div className="info-card">
              <div className="card-badge">01</div>
              <h3>Public Education</h3>
              <p>Facility visits and informational support help visitors better understand plant science and local innovation.</p>
            </div>
            <div className="info-card">
              <div className="card-badge">02</div>
              <h3>Research Support</h3>
              <p>We support propagation and plant-health initiatives rooted in evidence-based agricultural science.</p>
            </div>
            <div className="info-card">
              <div className="card-badge">03</div>
              <h3>Community Impact</h3>
              <p>Our programs are designed to help communities adopt practical, sustainable, and innovative agriculture practices.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AboutPage;
