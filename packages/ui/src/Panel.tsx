import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@ap/ui';

export interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
}

/** Framed section in the AP `PlatformPage` panel look; with a title it is a named `section`. */
export function Panel({ title, subtitle, actions, headingLevel = 2, className, children }: PanelProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section aria-labelledby={title !== undefined ? headingId : undefined} className={cn('rounded-lg border border-border-subtle bg-surface-card', className)}>
      {hasHeader && (
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3">
          <div className="min-w-0">
            {title !== undefined && <Heading id={headingId} className="m-0 text-base leading-5 font-semibold text-text-primary">{title}</Heading>}
            {subtitle !== undefined && <p className="m-0 text-xs text-text-muted">{subtitle}</p>}
          </div>
          {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('px-4 pb-4', !hasHeader && 'pt-4')}>{children}</div>
    </section>
  );
}
