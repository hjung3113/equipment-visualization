import { useEffect } from 'react';
import { FocusPage } from './FocusPage.js';
import { LayoutsPage } from './LayoutsPage.js';
import { BoardPage, FleetPage, OnboardingPage } from './OnboardingPages.js';
import { Link, hrefFor, navigate, useLocation, useRoute, type Route } from './router.js';

function Page({ route }: { route: Route }) {
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
        <>
          <h1>페이지를 찾을 수 없습니다</h1>
          <p><Link href="/fleet">Fleet으로 이동</Link></p>
        </>
      );
  }
}

export function App() {
  const location = useLocation();
  const route = useRoute();
  useEffect(() => {
    if (window.location.pathname === '/') navigate('/fleet', { replace: true });
  }, [location]);
  return (
    <>
      <nav aria-label="Studio">
        <Link href="/fleet" aria-current={route.name === 'fleet' ? 'page' : undefined}>Fleet</Link>{' '}
        <Link href={hrefFor({ name: 'layouts', file: null })} aria-current={route.name === 'layouts' ? 'page' : undefined}>레이아웃</Link>
      </nav>
      <main>
        <Page route={route} />
      </main>
    </>
  );
}
