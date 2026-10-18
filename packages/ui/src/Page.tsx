import type { ElementType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface PageProps {
  /** The page's `h1`. Omit it when the content owns the heading. */
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Ancestor crumbs before the `h1`, which stays the current page. Needs `title`. */
  breadcrumb?: { label: string; items: readonly { key: string; label: ReactNode; href?: string }[] };
  /** The router link used for crumbs with `href`; default `a`. */
  linkComponent?: ElementType;
  children: ReactNode;
}

/** Page head (50px, AP ADR-0011) over the padded body. */
export function Page({ title, description, actions, breadcrumb, linkComponent: LinkComponent = 'a', children }: PageProps) {
  return (
    <>
      {title !== undefined && (
        <header className="sticky top-0 z-10 flex h-toolbar shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border-subtle bg-surface-canvas px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {breadcrumb !== undefined && (
              <nav aria-label={breadcrumb.label} className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
                {breadcrumb.items.map((item) => (
                  <span key={item.key} className="flex min-w-0 items-center gap-1">
                    {item.href !== undefined ? (
                      <LinkComponent href={item.href} className="min-w-0 truncate text-text-muted hover:text-accent-primary">{item.label}</LinkComponent>
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                    <ChevronRight className="size-3 shrink-0" aria-hidden />
                  </span>
                ))}
              </nav>
            )}
            <h1 tabIndex={-1} className="min-w-0 shrink truncate text-sm font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{title}</h1>
            {description !== undefined && <div className="min-w-0 truncate text-xs text-text-muted">{description}</div>}
          </div>
          {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-8 pt-7 pb-9">{children}</div>
    </>
  );
}
