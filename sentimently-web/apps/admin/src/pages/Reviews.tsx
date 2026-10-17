import { shortDate } from '@sentimently/api';
import { Alert, Badge, Button, Chip, EmptyState } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import type { AdminReview } from '../lib/admin-api';
import { ActionError, QueryError } from '../lib/present';

function Row({ r }: { r: AdminReview }) {
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (status: 'published' | 'hidden') => adminApi.moderate(r.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews'] }),
  });
  const { isAdmin } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const erase = useMutation({ mutationFn: () => adminApi.deleteReview(r.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews'] }) });
  const hidden = r.status === 'hidden';
  return (
    <li className="card">
      <p><span aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> {r.verified ? <Badge tone="digital">Verified purchase</Badge> : <Badge>Not a verified purchase</Badge>} {hidden && <Badge tone="offer">Hidden</Badge>}</p>
      {r.text ? <p className="quote">{r.text}</p> : <p className="muted">No text.</p>}
      <p className="muted">{shortDate(r.createdAt)}</p>
      <Button size="small" variant="secondary" loading={set.isPending} onClick={() => set.mutate(hidden ? 'published' : 'hidden')}>
        {hidden ? 'Show on the shop' : 'Hide from the shop'}
      </Button>
      {isAdmin && !confirm && <Button size="small" variant="ghost" onClick={() => setConfirm(true)} aria-label={`Delete this ${r.rating} star review`}>Delete</Button>}
      {confirm && (
        <Alert tone="error">
          <p><strong>Delete this review for good?</strong> It is removed from the shop and from the gift's rating. This cannot be undone. Hide it instead to keep it.</p>
          <div className="actions">
            <Button size="small" loading={erase.isPending} onClick={() => erase.mutate()}>Yes, delete it</Button>
            <Button size="small" variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
          </div>
        </Alert>
      )}
      <ActionError error={set.error ?? erase.error} />
    </li>
  );
}

export function Reviews() {
  const q = useQuery({ queryKey: ['reviews'], queryFn: ({ signal }) => adminApi.reviews({ signal }) });
  const [show, setShow] = useState<'all' | 'published' | 'hidden'>('all');
  if (q.error) return <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the reviews" />;
  if (!q.data) return <p aria-busy="true">Loading…</p>;
  const rows = [...q.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((r) => show === 'all' || r.status === show);
  return (
    <>
      <title>Reviews | Bloomora studio</title>
      <h1>Reviews</h1>
      <p className="muted">Only published, verified reviews count towards a gift's rating.</p>
      <div className="presets" role="group" aria-label="Show">
        {(['all', 'published', 'hidden'] as const).map((k) => <Chip key={k} pressed={show === k} onClick={() => setShow(k)}>{k === 'all' ? 'All' : k === 'published' ? 'Published' : 'Hidden'}</Chip>)}
      </div>
      {!rows.length ? <EmptyState title="No reviews here" message="Customer reviews appear here." /> : <ul className="cards">{rows.map((r) => <Row key={r.id} r={r} />)}</ul>}
    </>
  );
}
