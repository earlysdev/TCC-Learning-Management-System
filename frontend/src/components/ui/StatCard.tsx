import React from 'react';
import { Link } from 'react-router-dom';
import GlassCard from './GlassCard';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
  linkTo?: string;
}

export default function StatCard({ icon, label, value, detail, linkTo }: StatCardProps) {
  const CardContent = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--neutral-300)' }}>{label}</h3>
        <div style={{ color: 'var(--primary-300)' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>
        {value}
      </div>
      {detail && (
        <p style={{ fontSize: '0.875rem', color: 'var(--neutral-400)' }}>{detail}</p>
      )}
    </>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} style={{ display: 'block' }}>
        <GlassCard hoverable className="stat-card">
          {CardContent}
        </GlassCard>
      </Link>
    );
  }

  return (
    <GlassCard className="stat-card">
      {CardContent}
    </GlassCard>
  );
}
