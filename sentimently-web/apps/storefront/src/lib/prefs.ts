import { useEffect, useState } from 'react';

/** A small value kept in the browser (city, promo code). Never throws if storage is blocked. */
export function useStored(key: string, initial = ''): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

export const CITY_KEY = 'sentimently.city';
export const PROMO_KEY = 'sentimently.promo';

const LAST_ORDER = 'sentimently.lastOrder';
export function saveLastOrder(v: unknown) {
  try { sessionStorage.setItem(LAST_ORDER, JSON.stringify(v)); } catch { /* ignore */ }
}
export function loadLastOrder<T>(): T | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
