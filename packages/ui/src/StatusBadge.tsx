import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@fops/ui';

export type StatusBadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface StatusBadgeProps {
  tone: StatusBadgeTone;
  /** Decorative; the text is what carries the status. */
  icon?: LucideIcon;
  children: ReactNode;
}

const TONE = {
  success: 'bg-accent-success/12 text-text-success-label',
  warning: 'bg-accent-warn/12 text-text-warning-label',
  danger: 'bg-accent-danger/12 text-text-danger-label',
  neutral: 'bg-surface-card-elevated text-text-secondary',
  info: 'bg-accent-primary/12 text-text-info-label',
} as const;

/** AP status pill. Never an evidence level: `EvidenceBadge` is the only evidence presentation (ADR-0003). */
export function StatusBadge({ tone, icon: Icon, children }: StatusBadgeProps) {
  return (
    <span data-tone={tone} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-tiny font-semibold', TONE[tone])}>
      {Icon !== undefined && <Icon className="size-3 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}
