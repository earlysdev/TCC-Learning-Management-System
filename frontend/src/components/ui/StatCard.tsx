import React from 'react';
import { Link } from 'react-router-dom';
import GlassCard from './GlassCard';

export interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
  linkTo?: string;
}

export function StatCard({ icon, label, value, detail, linkTo }: StatCardProps) {
  const CardContent = (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.6rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <h3 style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--neutral-300)', margin: 0, lineHeight: 1.35, letterSpacing: '0.01em' }}>
          {label}
        </h3>
        {icon && (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: 'var(--accent-gold-light, #fbbf24)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: '1.85rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: '#ffffff', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {detail && (
        <p style={{ fontSize: '0.8rem', color: 'var(--neutral-400)', margin: 0, lineHeight: 1.4 }}>
          {detail}
        </p>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} style={{ display: 'block', height: '100%', textDecoration: 'none' }}>
        <GlassCard hoverable className="stat-card" style={{ height: '100%' }}>
          {CardContent}
        </GlassCard>
      </Link>
    );
  }

  return (
    <GlassCard className="stat-card" style={{ height: '100%' }}>
      {CardContent}
    </GlassCard>
  );
}

export default StatCard;
