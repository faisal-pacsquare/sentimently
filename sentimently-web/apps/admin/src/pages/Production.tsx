import { shortDate } from '@sentimently/api';
import { Badge, Button, EmptyState } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import type { ProductionView } from '../lib/admin-api';
import { ActionError, QueryError } from '../lib/present';

function Ticket({ o, next, label }: { o: ProductionView; next: 'in_production' | 'dispatched'; label: string }) {
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: () => adminApi.move(o.id, { status: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', o.id] });
    },
  });
  return (
    <li className={`card${o.sameDay ? ' card--urgent' : ''}`}>
      <h3><Link to={`/orders/${o.id}`}>{o.number}</Link></h3>
      <p className="muted">{o.city ?? ''}{o.deliveryDate ? ` · due ${shortDate(o.deliveryDate)}` : ''} {o.sameDay && <Badge tone="offer">Same day</Badge>}</p>
      {o.lines.map((l, i) => (
        <div key={i}>
          <strong>{l.quantity} × {l.name}</strong>
          {l.extras.length > 0 && <div className="muted">Extras: {l.extras.map((x) => x.name).join(', ')}</div>}
          {l.personalisation && (
            <>
              <div>For {l.personalisation.recipientName} ({l.personalisation.relationship}), {l.personalisation.cardDesign} card</div>
              {l.personalisation.message && <p className="quote">{l.personalisation.message}</p>}
            </>
          )}
        </div>
      ))}
      <Button size="small" loading={move.isPending} onClick={() => move.mutate()}>{label}</Button>
      <ActionError error={move.error} />
    </li>
  );
}

export function Production() {
  const q = useQuery({ queryKey: ['production'], queryFn: ({ signal }) => adminApi.production({ signal }), refetchInterval: 60_000 });
  if (q.error) return <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the production board" />;
  if (!q.data) return <p aria-busy="true">Loading…</p>;
  const { preparing, inProduction } = q.data;
  return (
    <>
      <title>Production | Sentimently studio</title>
      <h1>Production board</h1>
      {!preparing.length && !inProduction.length && <EmptyState title="Nothing to make or pack" message="New paid orders will appear here once they are started." />}
      <section aria-labelledby="pp">
        <h2 id="pp">To prepare ({preparing.length})</h2>
        <ul className="cards">
          {preparing.map((o) => <Ticket key={o.id} o={o} next="in_production" label="Start making" />)}
        </ul>
      </section>
      <section aria-labelledby="ip">
        <h2 id="ip">Being made ({inProduction.length})</h2>
        <ul className="cards">
          {inProduction.map((o) => <Ticket key={o.id} o={o} next="dispatched" label="Ready: mark dispatched" />)}
        </ul>
      </section>
    </>
  );
}
