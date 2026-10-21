import type { CSSProperties, ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  id?: string;
  className?: string;
  hoverable?: boolean;
  style?: CSSProperties;
}

export default function GlassCard({ children, id, className = '', hoverable = false, style }: GlassCardProps) {
  return (
    <div id={id} className={`card-glass ${hoverable ? 'hoverable' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}
