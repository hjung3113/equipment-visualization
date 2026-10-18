import { Suspense, lazy, useEffect, useRef } from 'react';
import { Factory, LayoutTemplate } from 'lucide-react';
import { APP_FRAME_MAIN_ID, AppFrame, Page } from '@eqv/ui';
import { Button } from '@fops/ui';
import { FocusPage } from './FocusPage.js';
import { LayoutsPage } from './LayoutsPage.js';
import { BoardPage, FleetPage, OnboardingPage } from './OnboardingPages.js';
import { Link, hrefFor, navigate, useLocation, useRoute, type Route } from './router.js';

const UiGallery = import.meta.env.DEV ? lazy(() => import('./dev/UiGallery.js')) : null;

function RoutePage({ route }: { route: Route }) {
  switch (route.name) {
    case 'fleet':
      return <FleetPage />;
    case 'layouts':
      return <LayoutsPage file={route.file} />;
    case 'onboarding':
      return <OnboardingPage equipmentId={route.equipmentId} />;
    case 'board':
      return <BoardPage equipmentId={route.equipmentId} />;
    case 'focus':
      return <FocusPage equipmentId={route.equipmentId} entityType={route.entityType} anchor={route.anchor} />;
    case 'dev-ui':
      return UiGallery ? <Suspense fallback={null}><UiGallery /></Suspense> : null;
    case 'not-found':
      return (
        <Page title="페이지를 찾을 수 없습니다">
          <div role="status" className="max-w-md space-y-3 rounded-lg border border-border-subtle bg-surface-card p-6">
            <p className="text-text-secondary">주소가 바뀌었거나 없는 페이지입니다.</p>
            <Button asChild variant="outline"><Link href="/fleet">Fleet으로 이동</Link></Button>
          </div>
        </Page>
      );
  }
}

/** After a pathname change (not the first render, not a query-only change) focus the page `h1`, else `main`. */
function useRouteFocus(pathname: string) {
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = document.getElementById(APP_FRAME_MAIN_ID);
    const target = main?.querySelector<HTMLElement>('h1') ?? main;
    target?.focus({ preventScroll: true });
  }, [pathname]);
}

export function App() {
  const location = useLocation();
  const route = useRoute();
  useRouteFocus(location.split('?')[0]!);
  useEffect(() => {
    if (window.location.pathname === '/') navigate('/fleet', { replace: true });
  }, [location]);
  const items = [
    { key: 'fleet', label: 'Fleet', icon: <Factory className="size-4" />, href: '/fleet', current: ['fleet', 'onboarding', 'board', 'focus'].includes(route.name) },
    { key: 'layouts', label: '레이아웃', icon: <LayoutTemplate className="size-4" />, href: hrefFor({ name: 'layouts', file: null }), current: route.name === 'layouts' },
  ];
  return (
    <AppFrame
      appName="Studio"
      brand="EV"
      items={items}
      linkComponent={Link}
      collapsedStorageKey="eqv.studio.sidebar-collapsed"
      labels={{ nav: '주 메뉴', skipToContent: '본문으로 건너뛰기', collapse: '사이드바 접기', expand: '사이드바 펼치기' }}
    >
      <RoutePage route={route} />
    </AppFrame>
  );
}
