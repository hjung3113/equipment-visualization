import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton, cn } from '@ap/ui';

export interface StateMessageProps {
  tone?: 'neutral' | 'warning' | 'danger';
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export interface LoadingBlockProps {
  /** Announced to assistive technology; the block shows only skeleton rows. */
  label: string;
  rows?: number;
}

const TONE = {
  neutral: 'bg-surface-card-elevated text-text-secondary',
  warning: 'bg-accent-warn/12 text-text-warning-label',
  danger: 'bg-accent-danger/12 text-text-danger-label',
} as const;

const ICON_TONE = {
  neutral: '',
  warning: 'text-text-warning',
  danger: 'text-text-danger',
} as const;

/** Empty / error / notice block (AP `StateView`). `danger` is an alert, the others a status. */
export function StateMessage({ tone = 'neutral', icon: Icon, title, body, action, compact }: StateMessageProps) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-col items-start gap-2 rounded-md', TONE[tone], compact ? 'p-3' : 'min-h-24 p-4')}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn('size-4 shrink-0', ICON_TONE[tone])} aria-hidden />
        {title}
      </div>
      {body !== undefined && <div className="max-w-prose text-xs leading-4">{body}</div>}
      {action !== undefined && <div className="flex flex-wrap items-center gap-3">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label, rows = 3 }: LoadingBlockProps) {
  return (
    <div role="status" aria-busy="true" className="relative min-h-24 space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={i % 3 === 0 ? 'h-5 w-11/12' : i % 3 === 1 ? 'h-5 w-4/5' : 'h-5 w-2/3'} />
      ))}
    </div>
  );
}
