import React from 'react';
import GlassCard from './GlassCard';

export interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({
  label,
  value,
  detail,
  icon,
}: StatCardProps) {
  return (
    <GlassCard
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '0.85rem',
        height: '100%',
        padding: '1.35rem 1.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <span
          style={{
            color: 'var(--neutral-300)',
            fontSize: '0.84rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            lineHeight: 1.35,
          }}
        >
          {label}
        </span>
        {icon && (
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(251, 191, 36, 0.28)',
              color: 'var(--accent-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--white)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {detail && (
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--neutral-300)',
            paddingTop: '0.55rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          {detail}
        </div>
      )}
    </GlassCard>
  );
}

export default StatCard;
