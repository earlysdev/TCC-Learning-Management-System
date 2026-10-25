import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BookOpen, Sparkles, BarChart2,
  ArrowRight, Eye, 
  Target, Heart, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown,
  Download, Smartphone, Menu, X, GraduationCap, ShieldCheck,
  Compass, Library, Award, Laptop, Building2
} from 'lucide-react';

const slides = [
  {
    image: '/assets/images/tcc-banner.jpg',
    title: 'Truly We Remain!',
    subtitle: 'Tagoloan Community College · Vincit Omnia Veritas (Truth Conquers All)',
    ctaLink: '/login',
    ctaText: 'Access Student Portal'
  },
  {
    image: '/assets/images/tcc-programs.png',
    title: 'Excellence in Higher Education',
    subtitle: 'ALCUCOA-Accredited Degree Programs at the Nee Building Campus',
    ctaLink: '#programs',
    ctaText: 'Explore Degree Programs'
  },
  {
    image: '/assets/images/tcc-campus.jpg',
    title: 'A Premier Community Institution',
    subtitle: 'Forming Holistic Individuals and Competent Global Entrepreneurs',
    ctaLink: '/login',
    ctaText: 'Join TCC Community'
  },
  {
    image: '/assets/images/tcc-lobby.png',
    title: 'Next-Generation Digital LMS',
    subtitle: 'AI-Powered Assessments, Integrity Proctoring & Targeted Study Recommendations',
    ctaLink: '/login',
    ctaText: 'Sign In to Workspace'
  }
];

interface AcademicCollege {
  code: string;
  name: string;
  icon: typeof Laptop;
  degrees: string[];
}

const academicColleges: AcademicCollege[] = [
  {
    code: 'CIT',
    name: 'College of Information Technology',
    icon: Laptop,
    degrees: [
      'Bachelor of Science in Information Technology (BSIT)'
    ]
  },
  {
    code: 'CED',
    name: 'College of Education',
    icon: GraduationCap,
    degrees: [
      'Bachelor of Physical Education (BPEd)',
      'Bachelor of Elementary Education (BEEd)',
      'Bachelor of Secondary Education (BSEd) — Major in Filipino, English, and Social Studies (AP)'
    ]
  },
  {
    code: 'CAS',
    name: 'College of Arts and Sciences',
    icon: Compass,
    degrees: [
      'Bachelor of Arts in Sociology',
      'Bachelor of Science in Community Development'
    ]
  },
  {
    code: 'CCJPS',
    name: 'College of Criminal Justice and Public Safety',
    icon: ShieldCheck,
    degrees: [
      'Bachelor of Science in Criminology'
    ]
  },
  {
    code: 'CBA',
    name: 'College of Business Administration',
    icon: BarChart2,
    degrees: [
      'Bachelor of Science in Business Administration'
    ]
  },
  {
    code: 'CHM',
    name: 'College of Hospitality Management',
    icon: Award,
    degrees: [
      'Bachelor of Science in Hospitality Management'
    ]
  },
  {
    code: 'COM',
    name: 'College of Midwifery',
    icon: Heart,
    degrees: [
      'Bachelor of Science in Midwifery'
    ]
  },
  {
    code: 'CLIS',
    name: 'College of Library Information Science',
    icon: Library,
    degrees: [
      'Bachelor in Library Information Science'
    ]
  }
];

export default function LandingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header className="navbar">
        <div className="container">
          <div className="navbar-content">
            <Link to="/" className="logo-section">
              <img src="/assets/images/logo.png" alt="TCC Official Seal" className="logo-img" />
              <div className="logo-text">
                <h1 className="logo-title">Tagoloan Community College</h1>
                <p className="logo-subtitle">Learning Management System · Baluarte, Tagoloan</p>
              </div>
            </Link>

            <nav className="nav-buttons desktop-nav">
              <a href="#about" className="nav-btn">About TCC</a>
              <a href="#programs" className="nav-btn">Colleges</a>
              <a href="#features" className="nav-btn">Features</a>
              <a href="#download-app" className="nav-btn">
                <Smartphone size={15} /> Mobile App
              </a>
              <Link to="/login" className="nav-btn nav-btn-primary">
                Sign In <ArrowRight size={15} />
              </Link>
            </nav>

            <button 
              type="button" 
              className="mobile-nav-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <nav className="mobile-nav-drawer">
              <a href="#about" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                About TCC
              </a>
              <a href="#programs" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                Colleges & Programs
              </a>
              <a href="#features" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                Platform Features
              </a>
              <a href="#download-app" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Smartphone size={16} /> Mobile App (.apk)
              </a>
              <Link to="/login" className="mobile-nav-link mobile-nav-link-primary" onClick={() => setMobileMenuOpen(false)}>
                Sign In to Workspace <ArrowRight size={16} />
              </Link>
            </nav>
          )}
        </div>
      </header>

      {/* Hero Section with Slider */}
      <section className="hero">
        <div className="hero-slider">
          {slides.map((slide, index) => (
            <div 
              key={index}
              className={`hero-slide ${index === currentSlide ? 'active' : ''}`}
              style={{ backgroundImage: `url('${slide.image}')` }}
            >
              <div className="hero-overlay" />
              <div className="hero-content">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.45)', padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-full)', color: '#fbbf24', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                  <Building2 size={14} /> Tagoloan Community College · Est. 2003
                </div>
                <h1 className="hero-title">{slide.title}</h1>
                <p className="hero-subtitle">{slide.subtitle}</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <Link to={slide.ctaLink} className="btn btn-accent btn-lg">
                    {slide.ctaText} <ArrowRight size={18} />
                  </Link>
                  <a href="#about" className="btn btn-glass btn-lg">
                    About TCC
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Slider Controls */}
        <button 
          className="slider-btn slider-prev" 
          onClick={() => setCurrentSlide(prev => (prev - 1 + slides.length) % slides.length)}
          aria-label="Previous Slide"
        >
          <ChevronLeft size={28} />
        </button>
        <button 
          className="slider-btn slider-next" 
          onClick={() => setCurrentSlide(prev => (prev + 1) % slides.length)}
          aria-label="Next Slide"
        >
          <ChevronRight size={28} />
        </button>

        {/* Indicators */}
        <div className="slider-indicators">
          {slides.map((_, idx) => (
            <span 
              key={idx}
              className={`indicator ${idx === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(idx)}
            />
          ))}
        </div>

        {/* Scroll down prompt */}
        <a href="#about" className="hero-scroll-down" aria-label="Scroll to about section">
          <span>Explore</span>
          <ChevronDown size={18} className="scroll-arrow" />
        </a>
      </section>

      {/* About Section - Vision, Mission, Philosophy, Core Values (High-Contrast White Cards) */}
      <section id="about" className="section section-about">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              VINCIT OMNIA VERITAS · ESTABLISHED 2003
            </span>
            <h2 className="section-title text-center" style={{ marginTop: '0.35rem' }}>
              About Tagoloan Community College
            </h2>
            <p className="section-description text-center">
              Tagoloan Community College is an ALCUCOA-accredited local college in Baluarte, Tagoloan, Misamis Oriental, dedicated to providing quality tertiary instruction, research, and holistic formation.
            </p>
          </div>

          <div className="grid grid-3">
            {/* Vision Card */}
            <div className="card-white">
              <div className="icon-wrapper">
                <Eye size={28} />
              </div>
              <h3>Vision</h3>
              <p style={{ flex: 1, fontSize: '1.3rem', marginTop: '2rem', fontWeight: 500, color: '#2d3748' }}>
                To be a premiere community based institution by <b>2030</b> producing globally competent graduates.
              </p>
            </div>

            {/* Mission Card */}
            <div className="card-white">
              <div className="icon-wrapper">
                <Target size={28} />
              </div>
              <h3>Mission</h3>
              <p style={{ fontSize: '1.25rem', marginBottom: '0.75rem',marginTop: '2rem', fontWeight: 500, color: '#2d3748' }}>
                Tagoloan Community College is committed to produce competent graduates fully equipped with knowledge and skills driven by values conforming to global standards.
              </p>
            </div>

            {/* Philosophy & Core Values Card */}
            <div className="card-white">
              <div className="icon-wrapper">
                <Heart size={28} />
              </div>
              <h3>Philosophy & Core Values</h3>
              <div className="values-badge-column">
                <span className="value-badge badge-diyos">Transformational</span>
                <span className="value-badge badge-tao">Community-Based</span>
                <span className="value-badge badge-kalikasan">Competence & Integrity</span>
                <span className="value-badge badge-bansa">Accountability & Discipline</span>
                <span className="value-badge badge-tcc">Excellence & Professionalism</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Academic Colleges & Programs Section */}
      <section id="programs" className="section section-programs">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              MEMBER: ASSOCIATION OF LOCAL COLLEGES AND UNIVERSITIES — COMMISSION ON ACCREDITATION (ALCUCOA)
            </span>
            <h2 className="section-title text-center" style={{ marginTop: '0.35rem' }}>
              Academic Colleges & Degree Programs
            </h2>
            <p className="section-description text-center">
              Offered at the Nee Building and Tagoloan Community College campuses, prepared for industry competence and community leadership.
            </p>
          </div>

          <div className="programs-grid">
            {academicColleges.map((college) => {
              const Icon = college.icon;
              return (
                <div key={college.code} className="program-card">
                  <span className="program-code-badge">{college.code}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
                    <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', width: '38px', height: '38px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24', flexShrink: 0 }}>
                      <Icon size={20} />
                    </div>
                    <h3 className="program-title" style={{ margin: 0 }}>
                      {college.name}
                    </h3>
                  </div>
                  <ul className="program-degrees">
                    {college.degrees.map((degree, dIdx) => (
                      <li key={dIdx}>
                        <CheckCircle2 size={15} />
                        <span>{degree}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="section section-features">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              INNOVATIVE HIGHER EDUCATION TECHNOLOGY
            </span>
            <h2 className="section-title text-center" style={{ marginTop: '0.35rem' }}>
              LMS Platform Features
            </h2>
            <p className="section-description text-center">
              A comprehensive digital portal designed for students, faculty, academic departments, and college leadership.
            </p>
          </div>

          <div className="grid grid-3">
            <div className="feature-card">
              <div className="icon-wrapper" style={{ width: '56px', height: '56px', marginBottom: '1rem' }}>
                <BookOpen size={28} />
              </div>
              <h3>Online Assessment System</h3>
              <p>
                Take secure collegiate assessments anytime, anywhere with instant weighted scoring, randomized options, and automated answer review.
              </p>
              <ul className="feature-list">
                <li><CheckCircle2 size={16} color="#fbbf24" /> Instant scoring & weighted points</li>
                <li><CheckCircle2 size={16} color="#fbbf24" /> Anti-cheat blackout & telemetry</li>
                <li><CheckCircle2 size={16} color="#fbbf24" /> Question skill and competency breakdown</li>
              </ul>
            </div>

            <div className="feature-card">
              <div className="icon-wrapper" style={{ width: '56px', height: '56px', marginBottom: '1rem' }}>
                <BarChart2 size={28} />
              </div>
              <h3>Dean & Faculty Analytics</h3>
              <p>
                Monitor college performance, student retention, block progress, passing rates, and active academic audit trails in real time.
              </p>
              <ul className="feature-list">
                <li><CheckCircle2 size={16} color="#fbbf24" /> College-level pass rates & averages</li>
                <li><CheckCircle2 size={16} color="#fbbf24" /> Score distribution and analytics export</li>
                <li><CheckCircle2 size={16} color="#fbbf24" /> Security surveillance and incident logs</li>
              </ul>
            </div>

            <div className="feature-card">
              <div className="icon-wrapper" style={{ width: '56px', height: '56px', marginBottom: '1rem' }}>
                <Sparkles size={28} />
              </div>
              <h3>AI Learning Recommendations</h3>
              <p>
                Personalized study roadmaps powered by Gemini AI that analyze quiz responses, pinpoint missed skills, and recommend verified study references.
              </p>
              <ul className="feature-list">
                <li><CheckCircle2 size={16} color="#fbbf24" /> Tailored study focus competencies</li>
                <li><CheckCircle2 size={16} color="#fbbf24" /> Curated external learning reference links</li>
                <li><CheckCircle2 size={16} color="#fbbf24" /> Step-by-step actionable improvement plans</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Download Section (Phone Mockup) */}
      <section id="download-app" className="section section-download">
        <div className="container">
          <div className="download-box">
            <div className="download-info">
              <span className="download-tag">
                <Smartphone size={15} /> MOBILE LEARNING SPACE
              </span>
              <h2 className="download-title">
                Learn Anywhere, Anytime with TCC LMS Mobile.
              </h2>
              <p className="download-desc">
                Take quizzes, check study recommendations, and review class grades straight from your smartphone. Download the official Tagoloan Community College mobile app for Android devices.
              </p>
              <div className="download-note">
                <p style={{ margin: 0 }}>
                  <strong>Note:</strong> Students, faculty members, and academic secretaries can access both mobile and web portals. Executive leadership (Dean) utilizes the desktop web version for institutional surveillance and administrative reporting.
                </p>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="btn btn-accent btn-md"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: 0.65,
                  cursor: 'not-allowed',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                <Download size={18} /> Mobile App Not Currently Available — We&apos;re still developing the web, stay tuned for mobile updates
              </button>
            </div>

            {/* Smartphone Mockup */}
            <div className="phone-mockup-wrapper">
              <div className="phone-mockup">
                <div className="phone-notch" />
                <div className="phone-screen">
                  <div className="phone-screen-logo-wrap">
                    <img src="/assets/images/logo.png" alt="TCC Seal" className="phone-screen-logo" />
                  </div>
                  <h4 className="phone-screen-title">TCC LMS</h4>
                  <p className="phone-screen-sub">Mobile Learning Space</p>
                  
                  <div className="phone-screen-form">
                    <div className="phone-form-input" />
                    <div className="phone-form-input" />
                    <div className="phone-form-btn">
                      Sign In
                    </div>
                  </div>
                  <span className="phone-screen-footer">
                    Tagoloan Community College
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="site-footer-glass">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <img src="/assets/images/logo.png" alt="TCC Seal" style={{ width: '46px', height: '46px', objectFit: 'contain' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff' }}>Tagoloan Community College</h4>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#fbbf24' }}>Vincit Omnia Veritas · Est. 2003</p>
                </div>
              </div>
              <p>
                A premier community-based tertiary institution forming holistic individuals and providing quality, accessible higher education.
              </p>
            </div>

            <div className="footer-section">
              <h4>Institutional Accreditation</h4>
              <p>Member: Association of Local Colleges and Universities — Commission on Accreditation (ALCUCOA)</p>
              <p>Baluarte, Tagoloan, Misamis Oriental, Philippines</p>
              <p>College Programs: CIT · CED · CAS · CCJPS · CBA · CHM · COM · CLIS</p>
            </div>

            <div className="footer-section">
              <h4>Quick Links</h4>
              <p><a href="#about" style={{ color: 'rgba(255,255,255,0.85)' }}>About TCC</a></p>
              <p><a href="#programs" style={{ color: 'rgba(255,255,255,0.85)' }}>Colleges & Programs</a></p>
              <p><a href="#features" style={{ color: 'rgba(255,255,255,0.85)' }}>Platform Features</a></p>
              <p><a href="#download-app" style={{ color: 'rgba(255,255,255,0.85)' }}>Mobile App</a></p>
              <p><Link to="/login" style={{ color: '#fbbf24', fontWeight: 600 }}>Sign In to Portal</Link></p>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© 2026 Tagoloan Community College (TCC). All rights reserved. Vincit Omnia Veritas.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
