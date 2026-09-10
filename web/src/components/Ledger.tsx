import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

type Status = 'present' | 'pending' | 'absent' | 'neutral' | 'structure' | 'holiday';

const STATUS_STYLE: Record<Status, { color: string; bg: string; label: string }> = {
  present: { color: 'var(--status-present)', bg: 'var(--status-present-bg)', label: 'Present' },
  pending: { color: 'var(--status-pending)', bg: 'var(--status-pending-bg)', label: 'Pending' },
  absent: { color: 'var(--status-absent)', bg: 'var(--status-absent-bg)', label: 'Absent' },
  neutral: { color: 'var(--status-neutral)', bg: 'var(--status-neutral-bg)', label: '—' },
  structure: { color: 'var(--accent-structure)', bg: 'var(--accent-structure-bg)', label: 'Info' },
  holiday: { color: 'var(--accent-holiday)', bg: 'var(--accent-holiday-bg)', label: 'Holiday' },
};

export function StatusTag({ status, label }: { status: Status; label?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{ color: s.color, background: s.bg, borderRadius: 'var(--radius-sm)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {label ?? s.label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  status = 'neutral',
  onClick,
}: {
  label: string;
  value: string | number;
  status?: Status;
  onClick?: () => void;
}) {
  const s = STATUS_STYLE[status];
  const navigate = useNavigate();
  const recruitmentRoute = {
    'Open positions': '/recruitment?openingStatus=OPEN',
    'Total candidates': '/candidates?filter=all',
    'Interviews scheduled': '/candidates?filter=interviews',
    'Offers sent': '/candidates?filter=OFFER_SENT',
    'Hired candidates': '/candidates?filter=HIRED',
    'Positions closed': '/recruitment?openingStatus=CLOSED',
  }[label];
  const handleClick = onClick ?? (recruitmentRoute ? () => navigate(recruitmentRoute) : undefined);
  return (
    <div
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(event) => { if (handleClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); handleClick(); } }}
      className={`relative overflow-hidden border bg-white px-5 py-4 ${handleClick ? 'cursor-pointer transition-shadow hover:shadow-sm' : ''}`}
      style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}
    >
      <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: s.color }} />
      <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="font-display mt-1.5 text-3xl font-medium" style={{ color: 'var(--ink)' }}>
        {value}
      </p>
    </div>
  );
}

export function LedgerPanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
      <div
        className="flex items-center justify-between border-b px-5 py-3.5"
        style={{ borderColor: 'var(--line-soft)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {title}
        </h3>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function LedgerRow({
  primary,
  secondary,
  meta,
  status,
  onClick,
}: {
  primary: string;
  secondary?: string;
  meta?: string;
  status: Status;
  onClick?: () => void;
}) {
  const s = STATUS_STYLE[status];
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 border-b px-5 py-3 last:border-b-0 hover:bg-[var(--paper)]"
      style={{ borderColor: 'var(--line-soft)' }}
    >
      <span className="h-8 w-[3px] shrink-0" style={{ background: s.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {primary}
        </p>
        {secondary && (
          <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
            {secondary}
          </p>
        )}
      </div>
      {meta && (
        <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          {meta}
        </span>
      )}
      <StatusTag status={status} />
    </div>
  );
}
