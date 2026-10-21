import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import GlassCard from '../components/ui/GlassCard';

export default function NotFoundPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <GlassCard style={{ maxWidth: '440px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '4.5rem', fontWeight: 800, color: 'var(--primary-300)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-display)' }}>
          404
        </h1>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', marginBottom: '0.75rem' }}>
          Page Not Found
        </h2>
        <p style={{ color: 'var(--neutral-300)', marginBottom: '2rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
          The page or workspace you are looking for doesn't exist or has been relocated.
        </p>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Button variant="primary" style={{ width: '100%' }}>
            Return to Learning Space
          </Button>
        </Link>
      </GlassCard>
    </div>
  );
}
