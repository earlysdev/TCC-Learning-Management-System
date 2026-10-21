import type { CSSProperties, ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'primary';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  style?: CSSProperties;
}

export default function Badge({ children, variant = 'primary', className = '', style }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`} style={style}>
      {children}
    </span>
  );
}
