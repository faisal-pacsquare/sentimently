import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BasketProvider, MAX_QUANTITY, useBasket } from './basket';

const wrapper = ({ children }: { children: ReactNode }) => <BasketProvider>{children}</BasketProvider>;
const mug = { productId: 'p1', slug: 'mug', name: 'Mug', type: 'physical' as const, hintPrice: 800 };
const person = { recipientName: 'Ayesha', relationship: 'friend', cardDesign: 'classic', message: 'Hello' };

describe('gift box state', () => {
  it('merges plain gifts of the same kind, and caps the quantity', () => {
    const { result } = renderHook(() => useBasket(), { wrapper });
    act(() => result.current.add({ ...mug, quantity: 2 }));
    act(() => result.current.add({ ...mug }));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.count).toBe(3);
    act(() => result.current.add({ ...mug, quantity: 99 }));
    expect(result.current.lines[0]?.quantity).toBe(MAX_QUANTITY);
  });

  it('keeps every personalised gift as its own line of one', () => {
    const { result } = renderHook(() => useBasket(), { wrapper });
    act(() => result.current.add({ ...mug, personalisation: person, quantity: 5 }));
    act(() => result.current.add({ ...mug, personalisation: { ...person, recipientName: 'Bilal' } }));
    expect(result.current.lines.map((l) => l.quantity)).toEqual([1, 1]);
    const id = result.current.lines[0]!.id;
    act(() => result.current.setQuantity(id, 4));
    expect(result.current.lines[0]?.quantity).toBe(1);
  });

  it('removes a line when its quantity goes to zero', () => {
    const { result } = renderHook(() => useBasket(), { wrapper });
    act(() => result.current.add({ ...mug }));
    act(() => result.current.setQuantity(result.current.lines[0]!.id, 0));
    expect(result.current.lines).toEqual([]);
  });

  it('gives the server only ids and choices, never prices', () => {
    const { result } = renderHook(() => useBasket(), { wrapper });
    act(() => result.current.add({ ...mug, quantity: 2 }));
    act(() => result.current.add({ ...mug, productId: 'p2', personalisation: person }));
    expect(result.current.asQuoteLines()).toEqual([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1, personalisation: person },
    ]);
    expect(JSON.stringify(result.current.asQuoteLines())).not.toMatch(/price/i);
  });

  it('remembers the box between visits', () => {
    const first = renderHook(() => useBasket(), { wrapper });
    act(() => first.result.current.add({ ...mug, quantity: 2 }));
    first.unmount();
    const second = renderHook(() => useBasket(), { wrapper });
    expect(second.result.current.count).toBe(2);
  });

  it('ignores a damaged saved box instead of crashing', () => {
    localStorage.setItem('sentimently.box.v1', '{not json');
    expect(renderHook(() => useBasket(), { wrapper }).result.current.lines).toEqual([]);
    localStorage.setItem('sentimently.box.v1', JSON.stringify([{ nonsense: true }, { productId: 'p1', quantity: 0 }]));
    expect(renderHook(() => useBasket(), { wrapper }).result.current.lines).toEqual([]);
  });

  it('still works when the browser will not let us save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useBasket(), { wrapper });
    act(() => result.current.add({ ...mug }));
    expect(result.current.count).toBe(1);
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useBasket(), { wrapper });
    localStorage.setItem('sentimently.box.v1', JSON.stringify([{ id: 'x', ...mug, quantity: 4 }]));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sentimently.box.v1' }));
    });
    expect(result.current.count).toBe(4);
  });
});
