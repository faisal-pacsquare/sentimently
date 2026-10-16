import { Button, Container, ErrorState, SkipLink } from '@sentimently/ui';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { QueryError } from '../lib/present';

/** Simple outline icons (24px grid). Decorative: the link text carries the meaning. */
const ICONS: Record<string, string> = {
  orders: 'M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  production: 'M2 20h20M4 20V9l6 4V9l6 4V4h4v16',
  catalogue: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  dispatch: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  returns: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  reviews: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  inbox: 'M3 5h18v14H3zM3 7l9 6 9-6',
  reports: 'M3 3v18h18M7 15v3M12 9v9M17 5v13',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV = [
  ['/', 'Orders', true, 'orders'],
  ['/production', 'Production', false, 'production'],
  ['/catalogue', 'Catalogue', false, 'catalogue'],
  ['/dispatch', 'Dispatch', false, 'dispatch'],
  ['/returns', 'Returns and refunds', false, 'returns'],
  ['/reviews', 'Reviews', false, 'reviews'],
  ['/inbox', 'Inbox', false, 'inbox'],
  ['/reports', 'Reports', false, 'reports'],
] as const;

const ADMIN_NAV = [
  ['/settings', 'Settings', 'settings'],
  ['/team', 'Team and tools', 'team'],
] as const;

/** Only studio staff get past this. A person who is signed in but is only a customer is told so, not shown a broken page. */
export function Shell() {
  const auth = useAuth();
  const here = useLocation();

  if (auth.status === 'out') return <Navigate to="/login" state={{ from: here.pathname + here.search }} replace />;
  if (auth.status === 'error') return <Container className="page"><QueryError error={auth.error} onRetry={auth.retry} what="your account" /></Container>;
  if (auth.status === 'loading') return <Container className="page"><div className="sy-skeleton" style={{ height: '10rem' }} aria-busy="true" aria-label="Loading" /></Container>;
  if (auth.status === 'forbidden') {
    return (
      <Container className="page page--narrow">
        <ErrorState title="This is for studio staff" message="Your account does not have access to the studio console." temporary={false} />
        <Button variant="secondary" onClick={auth.signOut}>Sign out</Button>
      </Container>
    );
  }

  const name = auth.user?.name ?? auth.user?.email ?? '';
  return (
    <div className="shell">
      <SkipLink href="#main" />
      <aside className="shell__side">
        <p className="brand">
          <svg className="brand__mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <defs><linearGradient id="am" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e0577f" /><stop offset="1" stopColor="#9d2c52" /></linearGradient></defs>
            <rect width="32" height="32" rx="10" fill="url(#am)" />
            <path d="M16 24.5c-5.6-4-8-7-8-10.3a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 3.3-2.4 6.3-8 10.3z" fill="#fff" />
          </svg>
          <span>Sentimently <span className="brand__sub">studio</span></span>
        </p>
        <nav aria-label="Studio">
          {NAV.map(([to, label, end, icon]) => <NavLink key={to} to={to} end={end}><Icon name={icon} />{label}</NavLink>)}
          {auth.isAdmin && <span className="nav-sep" aria-hidden="true" />}
          {auth.isAdmin && ADMIN_NAV.map(([to, label, icon]) => <NavLink key={to} to={to}><Icon name={icon} />{label}</NavLink>)}
        </nav>
        <div className="shell__who">
          <span className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <p>{name}<br /><span>{auth.isAdmin ? 'Administrator' : 'Staff'}</span></p>
          <Button variant="ghost" size="small" onClick={auth.signOut}>Sign out</Button>
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
