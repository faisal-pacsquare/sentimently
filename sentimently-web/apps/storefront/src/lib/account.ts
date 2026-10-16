import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ACCOUNT, useAuth } from './auth';

const useSignedIn = () => useAuth().status === 'in';

export const useMyOrders = () =>
  useQuery({ queryKey: [ACCOUNT, 'orders'], queryFn: ({ signal }) => api.myOrders({ signal }), enabled: useSignedIn() });

export const useMyOrder = (number: string) =>
  useQuery({ queryKey: [ACCOUNT, 'order', number], queryFn: ({ signal }) => api.myOrder(number, { signal }), enabled: useSignedIn() });

export const useWishlist = () =>
  useQuery({ queryKey: [ACCOUNT, 'wishlist'], queryFn: ({ signal }) => api.wishlist({ signal }), enabled: useSignedIn() });

export const useReminders = () =>
  useQuery({ queryKey: [ACCOUNT, 'reminders'], queryFn: ({ signal }) => api.reminders({ signal }), enabled: useSignedIn() });

/** Add or remove a gift from the wishlist, then reload the list. */
export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, on }: { productId: string; on: boolean }) =>
      on ? api.addToWishlist(productId) : api.removeFromWishlist(productId),
    onSettled: () => qc.invalidateQueries({ queryKey: [ACCOUNT, 'wishlist'] }),
  });
}

export function useReminderActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [ACCOUNT, 'reminders'] });
  return {
    add: useMutation({ mutationFn: api.addReminder, onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteReminder(id), onSuccess: refresh }),
  };
}
