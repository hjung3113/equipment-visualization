import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type Route =
  | { name: 'fleet' }
  | { name: 'layouts'; file: string | null }
  | { name: 'onboarding'; equipmentId: string }
  | { name: 'focus'; equipmentId: string; entityType: string | null; anchor: string | null }
  | { name: 'not-found'; pathname: string };

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseRoute(pathname: string, search: string): Route {
  const segments = pathname.split('/').filter((segment) => segment !== '');
  const query = new URLSearchParams(search);
  const [head, id, ...extra] = segments;
  const equipmentId = id === undefined ? null : decode(id);
  if (head === 'fleet' && segments.length === 1) return { name: 'fleet' };
  if (head === 'layouts' && segments.length === 1) return { name: 'layouts', file: query.get('file') };
  if (head === 'onboarding' && equipmentId && extra.length === 0) return { name: 'onboarding', equipmentId };
  if (head === 'focus' && equipmentId && extra.length === 0) {
    return { name: 'focus', equipmentId, entityType: query.get('entityType') || null, anchor: query.get('anchor') || null };
  }
  return { name: 'not-found', pathname };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'fleet':
      return '/fleet';
    case 'layouts':
      return route.file === null ? '/layouts' : `/layouts?${new URLSearchParams({ file: route.file })}`;
    case 'onboarding':
      return `/onboarding/${encodeURIComponent(route.equipmentId)}`;
    case 'focus': {
      const query = new URLSearchParams();
      if (route.entityType !== null) query.set('entityType', route.entityType);
      if (route.anchor !== null) query.set('anchor', route.anchor);
      const text = query.toString();
      return `/focus/${encodeURIComponent(route.equipmentId)}${text ? `?${text}` : ''}`;
    }
    case 'not-found':
      return route.pathname;
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function navigate(href: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const snapshot = () => `${window.location.pathname}${window.location.search}`;

/** Current location as a string so the store snapshot stays referentially stable. */
export function useLocation(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '/');
}

export function useRoute(): Route {
  const location = useLocation();
  const [pathname = '/', search = ''] = location.split(/(?=\?)/, 2);
  return parseRoute(pathname, search);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

export function Link({ href, onClick, ...rest }: LinkProps) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return createElement('a', { ...rest, href, onClick: handle });
}
