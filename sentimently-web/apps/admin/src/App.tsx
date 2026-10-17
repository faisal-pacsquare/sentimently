import { Container, ErrorState } from '@sentimently/ui';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdminOnly } from './components/AdminOnly';
import { ScrollToTop } from './components/ScrollToTop';
import { Shell } from './components/Shell';
import { AuthProvider } from './lib/auth';
import { Catalogue } from './pages/Catalogue';
import { Dispatch } from './pages/Dispatch';
import { Groups } from './pages/Groups';
import { Inbox } from './pages/Inbox';
import { Login } from './pages/Login';
import { OrderDetail } from './pages/OrderDetail';
import { ProductForm } from './pages/ProductForm';
import { Orders } from './pages/Orders';
import { Production } from './pages/Production';
import { Reports } from './pages/Reports';
import { Returns } from './pages/Returns';
import { Reviews } from './pages/Reviews';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Container className="page"><ErrorState title="This page hit a problem" message="Reloading usually fixes it." onRetry={() => window.location.reload()} /></Container>;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="production" element={<Production />} />
            <Route path="catalogue" element={<Catalogue />} />
            <Route path="catalogue/groups" element={<Groups />} />
            <Route path="catalogue/new" element={<ProductForm />} />
            <Route path="catalogue/:id" element={<ProductForm />} />
            <Route path="dispatch" element={<Dispatch />} />
            <Route path="returns" element={<Returns />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
            <Route path="team" element={<AdminOnly><Team /></AdminOnly>} />
            <Route path="*" element={<Container className="page"><ErrorState title="Page not found" message="That page does not exist in the studio console." temporary={false} /></Container>} />
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}
