import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { visitorRequest } from '../visitorApi';

const defaultHomeContent = {
  hero_title: 'Connecting communities with science-driven plant innovation.',
  hero_description: 'iLAB Guiguinto advances tissue culture, ornamental planting, and sustainable agriculture through research, field support, and public access programs in Bulacan.',
  mission_title: 'Supporting farmers, growers, and communities through accessible agricultural science.',
  mission_summary: 'iLAB Guiguinto helps local agricultural stakeholders and the public understand modern plant propagation, nursery systems, and science-based practices that can improve productivity and resilience.',
  phone_number: '0955 593 4054',
  email_address: 'ilabguiguinto@gmail.com',
  location: 'Guiguinto, Bulacan',
};

const stats = [
  { value: '3+', label: 'Core programs' },
  { value: '13h', label: 'Daily support window' },
  { value: '100%', label: 'Public access' },
];

const features = [
  { id: 1, title: 'Tissue Culture', description: 'Explore modern propagation and plant improvement initiatives supporting resilient agricultural practices.' },
  { id: 2, title: 'Ornamental Growing', description: 'Learn about ornamental and alternative planting systems that promote sustainable local livelihood opportunities.' },
  { id: 3, title: 'Visitor Guidance', description: 'Access schedule information, facility tours, and guided support before you arrive on site.' },
];

const defaultSlides = [
  {
    image: '/images/ilab-news.jpg',
    title: 'iLAB Guiguinto opens new tissue culture laboratory',
    description: 'Supporting ornamental plants, local growers, and agricultural innovation in Bulacan.',
  },
  {
    image: '/images/ilab-news.webp',
    title: 'Growing ornamental plants in Guiguinto',
    description: 'Learn how local growers care for and develop plants for the community.',
  },
  {
    image: '/images/ilab-tissue-culture.webp',
    title: 'Growing healthy plants through tissue culture',
    description: 'Discover the laboratory work behind stronger ornamental plants and sustainable growing.',
  },
  {
    image: '/images/ilab-carousel-1.jpg',
    title: 'Welcome to the iLAB Guiguinto facility',
    description: 'Explore the welcoming spaces and plant laboratory facilities supporting local innovation.',
  },
  {
    image: '/images/ilab-carousel-2.jpg',
    title: 'Where science and community meet',
    description: 'See tissue culture research in action at iLAB Guiguinto.',
  },
];

const activities = [
  { date: 'MON - SAT', title: 'Public information desk', detail: '7:00 AM - 6:00 PM' },
  { date: 'WEEKLY', title: 'Plant propagation learning sessions', detail: 'Ask the support desk for the next public schedule.' },
  { date: 'SEASONAL', title: 'Community planting activities', detail: 'Announcements are posted here as dates are confirmed.' },
];

const visitorGroups = [
  { title: 'Students and teachers', detail: 'Find accessible learning resources about tissue culture and plant science.' },
  { title: 'Growers and farmers', detail: 'Explore practical ornamental and alternative planting support.' },
  { title: 'Community organizations', detail: 'Connect with public programs and agricultural innovation activities.' },
];

function HomePage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [homeContent, setHomeContent] = useState(defaultHomeContent);
  const [slides, setSlides] = useState(defaultSlides);

  useEffect(() => {
    visitorRequest('/content/homepage')
      .then((data) => {
        setHomeContent({ ...defaultHomeContent, ...(data.content || {}) });
        setAnnouncements(data.announcements || []);
        if (Array.isArray(data.slides) && data.slides.length > 0) {
          setSlides(data.slides.map((slide, index) => ({
            id: slide.slide_id || `${slide.title || 'slide'}-${index}`,
            image: slide.image || slide.image_url || slide.image_data || '/images/ilab-news.jpg',
            title: slide.title,
            description: slide.description,
          })));
          setActiveSlide(0);
        } else {
          setSlides(defaultSlides);
          setActiveSlide(0);
        }
      })
      .catch(() => {
        setHomeContent(defaultHomeContent);
        setAnnouncements([]);
        setSlides(defaultSlides);
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  const goToSlide = (index) => setActiveSlide((index + slides.length) % slides.length);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="kicker">Public Visitor Portal</span>
            <h1>{homeContent.hero_title}</h1>
            <p>{homeContent.hero_description}</p>
            <div className="hero-actions">
              <Link to="/book" className="button">Book an appointment</Link>
              <button type="button" className="button-secondary" onClick={() => window.dispatchEvent(new CustomEvent('ilab:open-chat'))}>Ask a question</button>
              <Link to="/contact" className="button-secondary">Contact support</Link>
              <Link to="/about" className="button-ghost">Learn More</Link>
            </div>
            <div className="stat-row">
              {stats.map((item) => (
                <div key={item.label} className="stat-pill">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-slideshow" aria-label="iLAB Guiguinto facility highlights">
            {slides.map((slide, index) => (
              <article key={slide.id || `${slide.title}-${index}`} className={`hero-slide ${index === activeSlide ? 'is-active' : ''}`}>
                <img src={slide.image} alt={slide.title} />
                <div className="hero-slide-caption">
                  <strong>{slide.title}</strong>
                  <span>{slide.description}</span>
                </div>
              </article>
            ))}
            <button className="slide-control slide-previous" type="button" aria-label="Previous slide" onClick={() => goToSlide(activeSlide - 1)}>&lsaquo;</button>
            <button className="slide-control slide-next" type="button" aria-label="Next slide" onClick={() => goToSlide(activeSlide + 1)}>&rsaquo;</button>
            <div className="slide-dots" aria-label="Choose a slide">
              {slides.map((slide, index) => (
                <button key={slide.id || `${slide.title}-${index}`} className={index === activeSlide ? 'is-active' : ''} type="button" aria-label={`Show slide ${index + 1}`} onClick={() => goToSlide(index)} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-intro">
            <span className="kicker">What we offer</span>
            <h2>Programs designed for learning, growth, and agricultural innovation.</h2>
          </div>

          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.id} className="feature-card">
                <div className="card-badge">0{feature.id}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-information">
        <div className="container home-info-grid">
          <div>
            <div className="section-intro left-align">
              <span className="kicker">Announcements</span>
              <h2>What is happening at iLAB.</h2>
            </div>
            <div className="announcement-list">
              {announcements.length > 0
                ? announcements.map((item) => <article className="announcement-item" key={item.announcement_id}><span>{item.label}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)
                : <p>There are no current announcements.</p>}
            </div>
          </div>
          <div>
            <div className="section-intro left-align">
              <span className="kicker">Scheduled activities</span>
              <h2>Plan your learning time.</h2>
            </div>
            <div className="activity-list">
              {activities.map((item) => <article className="activity-item" key={item.title}><strong>{item.date}</strong><div><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}
            </div>
          </div>
        </div>
      </section>

      <section className="section visitor-groups-band">
        <div className="container">
          <div className="section-intro">
            <span className="kicker">Visitor categories</span>
            <h2>Find the information that fits your group.</h2>
          </div>
          <div className="feature-grid">
            {visitorGroups.map((group) => <article className="feature-card" key={group.title}><h3>{group.title}</h3><p>{group.detail}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mission-band section">
        <div className="container inline-grid">
          <div>
            <span className="kicker">Why it matters</span>
            <h2>{homeContent.mission_title}</h2>
            <p>{homeContent.mission_summary}</p>
          </div>

          <div className="card">
            <h3>What visitors can do</h3>
            <ul className="list">
              <li>Ask questions about public services</li>
              <li>Request information about tissue-culture programs</li>
              <li>Learn about ornamental and alternative planting approaches</li>
              <li>Connect with the public support desk</li>
            </ul>
          </div>
        </div>
      </section>

    </>
  );
}

export default HomePage;
