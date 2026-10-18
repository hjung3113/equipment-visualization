import { useEffect } from 'react';
import { Factory, LayoutTemplate } from 'lucide-react';
import { AppFrame, Page } from '@eqv/ui';
import { FocusPage } from './FocusPage.js';
import { LayoutsPage } from './LayoutsPage.js';
import { BoardPage, FleetPage, OnboardingPage } from './OnboardingPages.js';
import { Link, hrefFor, navigate, useLocation, useRoute, type Route } from './router.js';

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
    case 'not-found':
      return (
        <Page title="페이지를 찾을 수 없습니다">
          <p><Link href="/fleet">Fleet으로 이동</Link></p>
        </Page>
      );
  }
}

export function App() {
  const location = useLocation();
  const route = useRoute();
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
      labels={{ nav: '주 메뉴', skipToContent: '본문으로 건너뛰기', collapse: '사이드바 접기', expand: '사이드바 펼치기' }}
    >
      <RoutePage route={route} />
    </AppFrame>
  );
}
