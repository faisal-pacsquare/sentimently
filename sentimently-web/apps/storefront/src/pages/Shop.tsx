import type { ProductQuery } from '@sentimently/api';
import { Button, Container } from '@sentimently/ui';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { ProductGrid } from '../components/ProductGrid';
import { isKindRoute, KINDS, PAGE_SIZE, readFilters, writeFilters } from '../lib/filters';
import type { KindRoute } from '../lib/filters';
import { QueryError } from '../lib/present';
import { useProducts, useTaxonomy } from '../lib/queries';
import { NotFound } from './NotFound';

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages of results">
      <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span aria-current="page">Page {page} of {pages}</span>
      <Button variant="secondary" size="small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

interface ViewProps {
  title: string;
  intro?: string;
  /** A browse hub fixes one filter (for example the feeling). It is not kept in the address bar. */
  lock?: { param: keyof ProductQuery; value: string };
  crumbs?: { to: string; label: string }[];
}

function ShopView({ title, intro, lock, crumbs }: ViewProps) {
  const [sp, setSp] = useSearchParams();
  const fromUrl = readFilters(sp);
  const query: ProductQuery = { ...fromUrl, ...(lock ? { [lock.param]: lock.value } : {}) };
  const setQuery = (next: ProductQuery) => {
    const clean = { ...next };
    if (lock) delete clean[lock.param];
    setSp(writeFilters(clean));
  };

  const { data, error, isPending, isFetching, refetch } = useProducts({ ...query, pageSize: PAGE_SIZE });
  const page = data?.page ?? query.page ?? 1;
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <Container className="page">
      <title>{`${title} | Sentimently`}</title>
      {crumbs && (
        <nav aria-label="Breadcrumb" className="crumbs">
          {crumbs.map((c) => (
            <span key={c.to}>
              <Link to={c.to}>{c.label}</Link> /{' '}
            </span>
          ))}
          <span aria-current="page">{title}</span>
        </nav>
      )}
      <h1>{title}</h1>
      {intro && <p className="lead">{intro}</p>}
      <FilterBar query={query} onChange={setQuery} locked={lock?.param} />

      <p className="results-count" aria-live="polite">
        {data ? (data.total ? `Showing ${from} to ${to} of ${data.total} ${data.total === 1 ? 'gift' : 'gifts'}` : 'No gifts match') : ''}
      </p>

      <ProductGrid
        products={data?.data}
        loading={isPending}
        error={error}
        onRetry={() => refetch()}
        retrying={isFetching}
        skeletons={PAGE_SIZE}
        empty={{
          title: 'No gifts match',
          message: 'Try removing a filter or searching for something else.',
          action: Object.keys(fromUrl).length ? <Button variant="secondary" onClick={() => setQuery({})}>Clear filters</Button> : undefined,
        }}
      />
      {data && <Pagination page={page} total={data.total} onPage={(p) => setQuery({ ...fromUrl, page: p })} />}
    </Container>
  );
}

export function Shop() {
  return <ShopView title="All gifts" intro="Every gift, personalised by you." />;
}

/** /browse/feelings/i-miss-you: the shop with one filter fixed. */
export function Hub() {
  const { kind, slug } = useParams();
  if (!isKindRoute(kind) || !slug) return <NotFound />;
  return <HubInner kind={kind} slug={slug} />;
}

function HubInner({ kind, slug }: { kind: KindRoute; slug: string }) {
  const { data, error, isPending, refetch, isFetching } = useTaxonomy(kind);
  if (error) return <Container className="page"><QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="this page" /></Container>;
  if (isPending) return <Container className="page"><p aria-busy="true">Loading…</p></Container>;
  const group = data.find((t) => t.slug === slug);
  if (!group) return <NotFound what="that page" />; // a real 404: the list loaded and the slug is not in it
  return (
    <ShopView
      key={`${kind}/${slug}`}
      title={group.name}
      intro={group.blurb}
      lock={{ param: KINDS[kind].param, value: slug }}
      crumbs={[{ to: `/browse/${kind}`, label: KINDS[kind].title }]}
    />
  );
}

/** /browse/feelings: every group of one kind. */
export function BrowseIndex() {
  const { kind } = useParams();
  if (!isKindRoute(kind)) return <NotFound />;
  return <BrowseIndexInner kind={kind} />;
}

function BrowseIndexInner({ kind }: { kind: KindRoute }) {
  const { data, error, isPending, refetch, isFetching } = useTaxonomy(kind);
  const k = KINDS[kind];
  return (
    <Container className="page">
      <title>{`${k.title} | Sentimently`}</title>
      <h1>{k.title}</h1>
      <p className="lead">{k.blurb}</p>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="this list" />
      ) : isPending ? (
        <p aria-busy="true">Loading…</p>
      ) : data.length ? (
        <ul className="group-grid" role="list">
          {data.map((t) => (
            <li key={t.slug}>
              <Link className="group-card" to={`/browse/${kind}/${t.slug}`}>
                <span className="group-card__name">{t.name}</span>
                {t.blurb && <span className="group-card__blurb">{t.blurb}</span>}
                <span className="group-card__count">{t.productCount ?? 0} {t.productCount === 1 ? 'gift' : 'gifts'}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nothing here yet.</p>
      )}
    </Container>
  );
}
