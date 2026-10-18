import { Container, Logo, SkipLink } from '@sentimently/ui';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useBasket } from '../lib/basket';
import { useStoreSettings } from '../lib/queries';

function AnnouncementBar() {
  const { data } = useStoreSettings();
  // Purely decorative: if the settings fail to load the bar is simply left out.
  if (!data?.announcement) return null;
  return (
    <div className="announce" role="note">
      <Container>{data.announcement}</Container>
    </div>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
  };
  return (
    <form className="search" role="search" aria-label="Search the shop" onSubmit={submit}>
      <label className="sy-sr-only" htmlFor="site-search">
        Search the shop
      </label>
      <input id="site-search" className="sy-input" type="search" placeholder="Search gifts" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="search__go" type="submit" aria-label="Search">
        <span aria-hidden="true">⌕</span>
      </button>
    </form>
  );
}

function Header() {
  const { count } = useBasket();
  const { status, customer, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="site-header">
      <Container className="site-header__bar">
        <Link to="/" className="brand" aria-label="Bloomora, home">
          <Logo />
        </Link>
        <SearchBox />
        <Link to={status === 'out' ? '/login' : '/account'} className="box-link" aria-label={status === 'out' ? 'Sign in' : 'My account'}>
          <span aria-hidden="true">👤</span>
          <span className="box-link__label">{status === 'out' ? 'Sign in' : customer?.name?.split(' ')[0] ?? 'Account'}</span>
        </Link>
        {status !== 'out' && (
          <button type="button" className="box-link box-link--button" aria-label="Sign out" onClick={() => { signOut(); navigate('/'); }}>
            <span aria-hidden="true">↩</span>
            <span className="box-link__label">Sign out</span>
          </button>
        )}
        <Link to="/box" className="box-link" aria-label={`Gift box, ${count} ${count === 1 ? 'item' : 'items'}`}>
          <span aria-hidden="true">🎁</span>
          <span className="box-link__label">Gift box</span>
          {count > 0 && (
            <span className="box-link__count" aria-hidden="true">
              {count}
            </span>
          )}
        </Link>
      </Container>
      <Container>
        <nav className="main-nav" aria-label="Main">
          <NavLink to="/shop" end>Shop all</NavLink>
          <NavLink to="/browse/feelings">By feeling</NavLink>
          <NavLink to="/browse/occasions">By occasion</NavLink>
          <NavLink to="/browse/recipients">By recipient</NavLink>
          <NavLink to="/browse/categories">Categories</NavLink>
        </nav>
      </Container>
    </header>
  );
}

function Footer() {
  const { data } = useStoreSettings();
  const social = Object.entries(data?.socialLinks ?? {});
  return (
    <footer className="site-footer">
      <Container className="site-footer__grid">
        <div>
          <Logo tone="dark" tagline className="brand--footer" />
          <p>Gifts that start from the feeling, delivered across Pakistan.</p>
        </div>
        <nav aria-label="Help">
          <h2 className="footer-h">Help</h2>
          <ul>
            <li><Link to="/delivery">Delivery and returns</Link></li>
            <li><Link to="/track">Track an order</Link></li>
            <li><Link to="/returns">Returns and damage</Link></li>
            <li><Link to="/contact">Contact us</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="footer-h">Say hello</h2>
          <ul>
            <li><Link to="/contact">Write to us</Link></li>
            {data?.contact.email && <li><a href={`mailto:${data.contact.email}`}>{data.contact.email}</a></li>}
            {data?.contact.phone && <li><a href={`tel:${data.contact.phone.replace(/\s/g, '')}`}>{data.contact.phone}</a></li>}
            {social.map(([name, url]) => (
              <li key={name}><a href={url} rel="noopener noreferrer" target="_blank">{name}</a></li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}

export function Layout() {
  return (
    <>
      <SkipLink href="#main" />
      <AnnouncementBar />
      <Header />
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
