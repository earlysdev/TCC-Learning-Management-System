import { useState, type ReactNode } from 'react';
import { Check, CheckCheck, Clock, ShieldCheck } from 'lucide-react';
import type { SecurityLog } from '../../lib/types';
import GlassCard from '../ui/GlassCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

type StatusFilter = 'all' | 'pending' | 'resolved';

interface SecurityLogsPanelProps {
  logs: SecurityLog[];
  totalPendingMetrics?: number;
  busy: boolean;
  onResolveOne: (logId: number) => void;
  onResolveAll: () => void;
  header: (actionSlot?: ReactNode) => ReactNode;
}

function isAlertEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return (
    lower.includes('fail') ||
    lower.includes('blocked') ||
    lower.includes('wrong') ||
    lower.includes('unrecognized') ||
    lower.includes('violation')
  );
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function SecurityLogsPanel({
  logs,
  totalPendingMetrics = 0,
  busy,
  onResolveOne,
  onResolveAll,
  header,
}: SecurityLogsPanelProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const pendingInList = logs.filter((log) => !log.is_resolved).length;
  const resolvedCount = logs.length - pendingInList;
  const pendingCount = Math.max(pendingInList, totalPendingMetrics);

  const visibleLogs = logs.filter((log) => {
    if (filter === 'pending') return !log.is_resolved;
    if (filter === 'resolved') return log.is_resolved;
    return true;
  });

  const batchResolveAction = pendingCount > 0 ? (
    <Button
      variant="accent"
      size="md"
      disabled={busy}
      onClick={onResolveAll}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}
    >
      <CheckCheck size={18} /> All-in-One Resolve ({pendingCount} Pending)
    </Button>
  ) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {header(batchResolveAction)}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {([
            { id: 'all', label: `All Events (${logs.length})` },
            { id: 'pending', label: `Pending Review (${pendingInList})` },
            { id: 'resolved', label: `Resolved (${resolvedCount})` },
          ] as { id: StatusFilter; label: string }[]).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '999px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                  background: active ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                  color: active ? '#fbbf24' : 'var(--neutral-300)',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <ShieldCheck size={14} style={{ color: '#4ade80' }} />
          All resolutions record auditor attribution &amp; timestamps
        </span>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive" style={{ margin: 0 }}>
          <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', textAlign: 'left', color: 'white', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Event Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>User</th>
                <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
                <th style={{ padding: '0.75rem 1rem' }}>Occurred At</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status &amp; Auditor</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--neutral-400)' }}>
                    {filter === 'pending'
                      ? 'No pending security alerts. All incidents resolved.'
                      : 'No security events match this filter.'}
                  </td>
                </tr>
              ) : (
                visibleLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: isAlertEvent(log.event_type) ? '#ef5350' : '#66bb6a' }}>
                      {log.event_type}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {log.user?.name || `User #${log.user_id || 'Unknown'}`}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>
                      {log.ip_address || '127.0.0.1'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--neutral-400)' }}>
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                        <Badge variant={log.is_resolved ? 'success' : 'error'}>
                          {log.is_resolved ? 'Resolved' : 'Pending Review'}
                        </Badge>
                        {log.is_resolved && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={11} />
                            {log.resolver?.name ? `${log.resolver.name} • ` : ''}
                            {formatTimestamp(log.resolved_at)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {!log.is_resolved ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onResolveOne(log.id)}
                        >
                          <Check size={14} /> Resolve
                        </Button>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: '#4ade80', fontWeight: 600 }}>
                          Audited
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
