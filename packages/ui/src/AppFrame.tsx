import { useState, type ElementType, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@fops/ui';

export interface AppFrameItem {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
  /** The item of the page being shown; gets `aria-current="page"`. */
  current: boolean;
}

export interface AppFrameProps {
  appName: string;
  /** The rail's brand mark (a few letters); decorative. */
  brand: ReactNode;
  items: readonly AppFrameItem[];
  /** The consumer's router link; defaults to a plain `a`. Receives `href`, `className`, `aria-*`. */
  linkComponent?: ElementType;
  labels: { nav: string; skipToContent: string; collapse: string; expand: string };
  /** localStorage key that persists the sidebar's collapsed state; omit to keep it per mount. */
  collapsedStorageKey?: string;
  children: ReactNode;
}

export const APP_FRAME_MAIN_ID = 'eqv-main';

function readCollapsed(key: string | undefined): boolean {
  if (key === undefined) return false;
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(key: string | undefined, value: boolean): void {
  if (key === undefined) return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Blocked storage: the sidebar still toggles for this mount.
  }
}

/** App shell (AP ADR-0011 structure): brand rail, collapsible sidebar with the nav, skip link and the focusable `main`. */
export function AppFrame({ appName, brand, items, linkComponent: LinkComponent = 'a', labels, collapsedStorageKey, children }: AppFrameProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapsedStorageKey));
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(collapsedStorageKey, next);
  };
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen">
        <a
          href={`#${APP_FRAME_MAIN_ID}`}
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface-card focus:px-3 focus:py-2"
        >
          {labels.skipToContent}
        </a>
        <div className="flex w-rail shrink-0 flex-col items-center gap-2 border-r border-border-subtle bg-surface-sidebar py-3">
          <div aria-hidden className="mb-1 grid size-8 shrink-0 place-items-center rounded-md bg-accent-primary text-text-on-accent">
            <span className="text-sm font-semibold">{brand}</span>
          </div>
        </div>
        <aside
          data-collapsed={collapsed}
          className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-sidebar-collapsed' : 'w-sidebar')}
        >
          <div className="flex h-toolbar shrink-0 items-center justify-between border-b border-border-subtle px-3">
            {!collapsed && <p className="min-w-0 truncate text-sm font-semibold">{appName}</p>}
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? labels.expand : labels.collapse}
              aria-expanded={!collapsed}
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary"
            >
              {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <nav aria-label={labels.nav}>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const link = (
                    <LinkComponent
                      href={item.href}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={item.current ? 'page' : undefined}
                      className={cn(
                        'relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
                        collapsed && 'justify-center px-0',
                        item.current && 'bg-surface-row-selected font-semibold text-text-primary',
                      )}
                    >
                      {item.current && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
                      <span aria-hidden className="grid size-4 shrink-0 place-items-center">{item.icon}</span>
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    </LinkComponent>
                  );
                  return (
                    <li key={item.key}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : link}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </aside>
        <main
          id={APP_FRAME_MAIN_ID}
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 scroll-pt-toolbar overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
        >
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
