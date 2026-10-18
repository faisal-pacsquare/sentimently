import type { SuggestResult } from '@sentimently/api';
import { rupees } from '@sentimently/api';
import { SafeImage } from '@sentimently/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const GROUP_ROUTE = { sentiment: 'feelings', occasion: 'occasions', recipient: 'recipients', category: 'categories' } as const;
const GROUP_LABEL = { sentiment: 'Feeling', occasion: 'Occasion', recipient: 'For', category: 'Category' } as const;
const MIN_LETTERS = 2;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The typed words in bold inside a name, so people see why it matched. */
function Highlight({ text, words }: { text: string; words: string[] }): ReactNode {
  const lower = text.toLowerCase();
  const spans: [number, number][] = [];
  for (const w of words) {
    const i = lower.indexOf(w);
    if (w && i >= 0) spans.push([i, i + w.length]);
  }
  if (!spans.length) return text;
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  const out: ReactNode[] = [];
  let at = 0;
  merged.forEach(([a, b], i) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={i}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

interface Option {
  key: string;
  to: string;
  body: ReactNode;
}

function optionsFor(data: SuggestResult | undefined, typed: string, words: string[]): Option[] {
  const list: Option[] = [];
  for (const p of data?.products ?? [])
    list.push({
      key: `p:${p.slug}`,
      to: `/gifts/${encodeURIComponent(p.slug)}`,
      body: (
        <>
          <span className="suggest__thumb"><SafeImage src={p.imageUrl ?? undefined} name={p.name} /></span>
          <span className="suggest__name"><Highlight text={p.name} words={words} /></span>
          <span className="suggest__price">{rupees(p.price)}</span>
        </>
      ),
    });
  for (const g of data?.groups ?? [])
    list.push({
      key: `g:${g.kind}:${g.slug}`,
      to: `/browse/${GROUP_ROUTE[g.kind]}/${encodeURIComponent(g.slug)}`,
      body: (
        <>
          <span className="suggest__tag">{GROUP_LABEL[g.kind]}</span>
          <span className="suggest__name"><Highlight text={g.name} words={words} /></span>
          <span className="suggest__price">{g.gifts} {g.gifts === 1 ? 'gift' : 'gifts'}</span>
        </>
      ),
    });
  list.push({ key: 'all', to: `/shop?q=${encodeURIComponent(typed)}`, body: <span className="suggest__all">See all results for “{typed}”</span> });
  return list;
}

/** The header search. As someone types, gifts and groups from the shop's database are offered; Enter searches everything. */
export function SearchBox() {
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const typed = value.trim();
  const term = useDebounced(typed.toLowerCase(), 200);
  const enabled = term.length >= MIN_LETTERS;
  const q = useQuery({
    queryKey: ['suggest', term],
    queryFn: ({ signal }) => api.suggest(term, { signal }),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const showing = open && typed.length >= MIN_LETTERS;
  const words = term.split(/\s+/).filter(Boolean);
  const options = optionsFor(enabled ? q.data : undefined, typed, words);
  const empty = !!q.data && !q.data.products.length && !q.data.groups.length;
  const activeId = showing && active >= 0 && active < options.length ? `${listId}-${active}` : undefined;

  // A click anywhere else closes the list.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    input.current?.blur();
    navigate(to);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const picked = options[active];
    if (showing && picked) return go(picked.to);
    go(typed ? `/shop?q=${encodeURIComponent(typed)}` : '/shop');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (typed.length < MIN_LETTERS) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 ? (step > 0 ? 0 : options.length - 1) : (a + step + options.length) % options.length));
    }
  };

  return (
    <form ref={box} className="search" role="search" aria-label="Search the shop" onSubmit={submit}>
      <label className="sy-sr-only" htmlFor="site-search">
        Search the shop
      </label>
      <input
        ref={input}
        id="site-search"
        className="sy-input"
        type="search"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        placeholder="Search gifts"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <button className="search__go" type="submit" aria-label="Search">
        <span aria-hidden="true">⌕</span>
      </button>
      {showing && (
        <div className="suggest">
          <ul id={listId} role="listbox" aria-label="Suggestions" className="suggest__list">
            {options.map((o, i) => (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`suggest__item${i === active ? ' is-active' : ''}${o.key === 'all' ? ' suggest__item--all' : ''}`}
                onMouseDown={(e) => e.preventDefault() /* keep focus in the box */}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(o.to)}
              >
                {o.body}
              </li>
            ))}
          </ul>
          <p className="suggest__status" role="status" aria-live="polite">
            {q.error ? 'Suggestions are not available right now. Press Enter to search.' : empty ? `Nothing matches “${typed}” yet.` : q.isFetching && !q.data ? 'Searching…' : ''}
          </p>
        </div>
      )}
    </form>
  );
}
