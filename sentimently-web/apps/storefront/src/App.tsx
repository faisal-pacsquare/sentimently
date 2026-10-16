import { Container, ErrorState } from '@sentimently/ui';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './lib/auth';
import { Account, Details, OrderDetail, Orders, Reminders, Wishlist } from './pages/Account';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Auth';
import { Box } from './pages/Box';
import { CheckCard, GiftLink } from './pages/Gift';
import { CancelOrder, ReturnOrder } from './pages/OrderHelp';
import { Checkout } from './pages/Checkout';
import { Contact, Delivery, Track } from './pages/Help';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { OrderPlaced } from './pages/OrderPlaced';
import { Product } from './pages/Product';
import { BrowseIndex, Hub, Shop } from './pages/Shop';
import { Studio } from './pages/Studio';

/** The last safety net: a bug in one page shows a message and a way out, not a white screen. */
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
    return (
      <Container className="page">
        <ErrorState title="This page hit a problem" message="Reloading usually fixes it." onRetry={() => window.location.reload()} />
      </Container>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="browse/:kind" element={<BrowseIndex />} />
          <Route path="browse/:kind/:slug" element={<Hub />} />
          <Route path="gifts/:slug" element={<Product />} />
          <Route path="studio/:slug" element={<Studio />} />
          <Route path="box" element={<Box />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order-placed" element={<OrderPlaced />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="verify-email" element={<VerifyEmail />} />
          <Route path="account" element={<Account />}>
            <Route index element={<Orders />} />
            <Route path="orders/:number" element={<OrderDetail />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="details" element={<Details />} />
          </Route>
          <Route path="gift/:token" element={<GiftLink />} />
          <Route path="gift-card" element={<CheckCard />} />
          <Route path="cancel-order" element={<CancelOrder />} />
          <Route path="returns" element={<ReturnOrder />} />
          <Route path="delivery" element={<Delivery />} />
          <Route path="track" element={<Track />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}
