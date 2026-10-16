import type { PersonalisationInput, ProductType, QuoteLineInput } from '@sentimently/api';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The gift box. It lives in the browser; the server prices it (POST /quote) every time it changes.
 * `unitPrice` is only a hint for showing something while the quote loads: it is never sent to the server.
 */
export interface BoxLine {
  id: string;
  productId: string;
  slug: string;
  name: string;
  image?: string;
  type: ProductType;
  hintPrice: number;
  quantity: number;
  /** A personalised gift is its own line with quantity 1. */
  personalisation?: PersonalisationInput;
  /** Digital gifts: who gets it and when. Collected at checkout if not set here. */
  digital?: { recipientEmail?: string; message?: string; sendAt?: string };
}

const KEY = 'sentimently.box.v1';
export const MAX_QUANTITY = 20;

function load(): BoxLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as BoxLine[]).filter((l) => l && typeof l.productId === 'string' && l.quantity >= 1) : [];
  } catch {
    return [];
  }
}

function save(lines: BoxLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage blocked: the box still works until the page is closed */
  }
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

interface BasketApi {
  lines: BoxLine[];
  count: number;
  /** Plain gifts of the same kind merge into one line; a personalised gift is always a new line. */
  add(line: Omit<BoxLine, 'id' | 'quantity'> & { quantity?: number }): void;
  setQuantity(id: string, quantity: number): void;
  update(id: string, change: Partial<Omit<BoxLine, 'id'>>): void;
  remove(id: string): void;
  clear(): void;
  /** The lines in the shape POST /quote wants (no prices). */
  asQuoteLines(): QuoteLineInput[];
}

const Ctx = createContext<BasketApi | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BoxLine[]>(load);

  useEffect(() => save(lines), [lines]);
  // another tab changed the box
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setLines(load());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback<BasketApi['add']>((line) => {
    setLines((prev) => {
      const quantity = Math.min(MAX_QUANTITY, Math.max(1, line.quantity ?? 1));
      if (!line.personalisation) {
        const same = prev.find((l) => l.productId === line.productId && !l.personalisation);
        if (same) return prev.map((l) => (l === same ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l));
      }
      return [...prev, { ...line, id: newId(), quantity: line.personalisation ? 1 : quantity }];
    });
  }, []);

  const setQuantity = useCallback<BasketApi['setQuantity']>((id, quantity) => {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.id !== id) return [l];
        if (quantity < 1) return [];
        return [{ ...l, quantity: l.personalisation ? 1 : Math.min(MAX_QUANTITY, quantity) }];
      }),
    );
  }, []);

  const update = useCallback<BasketApi['update']>((id, change) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...change } : l))), []);
  const remove = useCallback((id: string) => setLines((prev) => prev.filter((l) => l.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<BasketApi>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      add, setQuantity, update, remove, clear,
      asQuoteLines: () => lines.map((l) => ({ productId: l.productId, quantity: l.quantity, ...(l.personalisation ? { personalisation: l.personalisation } : {}) })),
    }),
    [lines, add, setQuantity, update, remove, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBasket(): BasketApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBasket must be used inside <BasketProvider>');
  return v;
}
