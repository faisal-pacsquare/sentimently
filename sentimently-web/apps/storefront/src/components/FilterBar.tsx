import type { ProductQuery, TaxonomyItem } from '@sentimently/api';
import { Button, Chip } from '@sentimently/ui';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { activeBudget, BUDGETS, KINDS, SORTS, withFilter } from '../lib/filters';
import type { KindRoute } from '../lib/filters';
import { useTaxonomy } from '../lib/queries';

interface Props {
  query: ProductQuery;
  onChange: (next: ProductQuery) => void;
  /** A filter fixed by the page (a browse hub); it cannot be changed or removed here. */
  locked?: keyof ProductQuery;
}

function GroupSelect({ kind, query, onChange, disabled }: { kind: KindRoute } & Pick<Props, 'query' | 'onChange'> & { disabled?: boolean }) {
  const { data } = useTaxonomy(kind);
  const { param, one } = KINDS[kind];
  const current = (query[param as keyof ProductQuery] as string | undefined) ?? '';
  // If the groups did not load the filter simply is not offered: the grid itself still works.
  if (!data?.length && !current) return null;
  const label = one.charAt(0).toUpperCase() + one.slice(1);
  return (
    <div className="filter-field">
      <label htmlFor={`f-${param}`}>{label}</label>
      <select
        id={`f-${param}`}
        className="sy-input"
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(withFilter(query, { [param]: e.target.value || undefined } as Partial<ProductQuery>))}
      >
        <option value="">Any</option>
        {(data ?? []).map((t: TaxonomyItem) => (
          <option key={t.slug} value={t.slug}>
            {t.name}
            {t.productCount !== undefined ? ` (${t.productCount})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterBar({ query, onChange, locked }: Props) {
  const [text, setText] = useState(query.q ?? '');
  useEffect(() => setText(query.q ?? ''), [query.q]);

  const budget = activeBudget(query);
  const searchSubmit = (e: FormEvent) => {
    e.preventDefault();
    onChange(withFilter(query, { q: text.trim() || undefined }));
  };
  const lockedParam = (k: string) => locked === k;
  const activeKeys = Object.keys(query).filter((k) => k !== 'page' && k !== 'pageSize' && k !== 'sort' && k !== locked);
  const filtered = activeKeys.length > 0;
  // On a phone the panel starts folded so the gifts are on the first screen; it opens by itself when filters are on.
  // (Where the browser cannot tell the screen size, as in tests, it stays open.)
  const [open, setOpen] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 60rem)').matches || filtered);

  return (
    <section className="filters" aria-label="Filter gifts">
      <details className="filters__panel" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="filters__toggle">
          Filters and sorting
          {filtered && <span className="filters__count"> · {activeKeys.length} on</span>}
        </summary>
        <form className="filters__row" onSubmit={searchSubmit} role="search" aria-label="Search and sort">
          <div className="filter-field filter-field--wide">
            <label htmlFor="f-q">Search these gifts</label>
            <div className="filter-search">
              <input id="f-q" className="sy-input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name or description" />
              <Button type="submit" size="small" variant="secondary">Find</Button>
            </div>
          </div>
          <div className="filter-field">
            <label htmlFor="f-sort">Sort by</label>
            <select id="f-sort" className="sy-input" value={query.sort ?? 'popularity'} onChange={(e) => onChange({ ...withFilter(query, {}), sort: e.target.value as ProductQuery['sort'] })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </form>

        <div className="filters__row">
          {(['feelings', 'occasions', 'recipients', 'categories'] as KindRoute[]).map((k) => (
            <GroupSelect key={k} kind={k} query={query} onChange={onChange} disabled={lockedParam(KINDS[k].param)} />
          ))}
        </div>

        <div className="filters__row filters__chips">
          <div role="group" aria-label="Kind of gift">
            <Chip pressed={!query.type} onClick={() => onChange(withFilter(query, { type: undefined }))}>All</Chip>
            <Chip pressed={query.type === 'physical'} onClick={() => onChange(withFilter(query, { type: 'physical' }))}>Posted gifts</Chip>
            <Chip pressed={query.type === 'digital'} onClick={() => onChange(withFilter(query, { type: 'digital' }))}>Digital</Chip>
          </div>
          <div role="group" aria-label="Budget">
            {BUDGETS.map((b) => (
              <Chip
                key={b.id}
                pressed={budget?.id === b.id}
                onClick={() => onChange(withFilter(query, budget?.id === b.id ? { minPrice: undefined, maxPrice: undefined } : { minPrice: b.min, maxPrice: b.max }))}
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </div>

        {filtered && (
          <Button variant="ghost" size="small" onClick={() => onChange(locked ? ({ [locked]: query[locked] } as ProductQuery) : {})}>
            Clear all filters
          </Button>
        )}
      </details>
    </section>
  );
}
