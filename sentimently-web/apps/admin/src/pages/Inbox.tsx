import { shortDate } from '@sentimently/api';
import { Badge, Button, Chip, EmptyState } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../lib/admin-api';
import type { ContactMessage } from '../lib/admin-api';
import { ActionError, QueryError } from '../lib/present';

const TOPIC: Record<string, string> = {
  order: 'My order', delivery: 'Delivery', payment: 'Payment', personalisation: 'Personalising',
  bulk_gifting: 'Bulk or corporate gifting', other: 'Other',
};

function Row({ m }: { m: ContactMessage }) {
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (status: ContactMessage['status']) => adminApi.setMessageStatus(m.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
  return (
    <li className="card">
      <h3>{m.subject}</h3>
      <p className="muted">
        {TOPIC[m.topic] ?? m.topic} · {shortDate(m.createdAt)} {m.topic === 'bulk_gifting' && <Badge tone="offer">Bulk enquiry</Badge>}
      </p>
      <p className="quote">{m.message}</p>
      <p>
        {m.name} · <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>{m.email}</a>
        {m.phone && <> · <a href={`tel:${m.phone}`}>{m.phone}</a></>}
        {m.orderNumber && <> · order {m.orderNumber}</>}
      </p>
      <div className="actions">
        {m.status === 'new' && <Button size="small" loading={set.isPending} onClick={() => set.mutate('in_progress')}>Start on this</Button>}
        {m.status !== 'closed' && <Button size="small" variant="secondary" loading={set.isPending} onClick={() => set.mutate('closed')}>Close</Button>}
        {m.status === 'closed' && <Button size="small" variant="ghost" loading={set.isPending} onClick={() => set.mutate('new')}>Reopen</Button>}
      </div>
      <ActionError error={set.error} />
    </li>
  );
}

const FILTERS = [['open', 'Open'], ['closed', 'Closed']] as const;

export function Inbox() {
  const q = useQuery({ queryKey: ['inbox'], queryFn: ({ signal }) => adminApi.inbox({ signal }), refetchInterval: 60_000 });
  const [show, setShow] = useState<'open' | 'closed'>('open');
  if (q.error) return <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the inbox" />;
  if (!q.data) return <p aria-busy="true">Loading…</p>;
  const rows = [...q.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((m) => (show === 'open' ? m.status !== 'closed' : m.status === 'closed'));
  return (
    <>
      <title>Inbox | Bloomora studio</title>
      <h1>Inbox</h1>
      <div className="presets" role="group" aria-label="Show">
        {FILTERS.map(([k, label]) => <Chip key={k} pressed={show === k} onClick={() => setShow(k)}>{label}</Chip>)}
      </div>
      {!rows.length ? <EmptyState title={show === 'open' ? 'Inbox zero' : 'Nothing closed yet'} message="Messages from the contact form and bulk-gifting enquiries appear here." /> : <ul className="cards">{rows.map((m) => <Row key={m.id} m={m} />)}</ul>}
    </>
  );
}
