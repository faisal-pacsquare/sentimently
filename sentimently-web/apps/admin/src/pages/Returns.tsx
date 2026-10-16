import { rupees, shortDate } from '@sentimently/api';
import { Badge, Button, Chip, EmptyState, TextArea } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../lib/admin-api';
import type { Refund, ReturnRequest } from '../lib/admin-api';
import { ActionError, QueryError } from '../lib/present';

function Request({ r }: { r: ReturnRequest }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<'refund' | 'replacement'>('refund');
  const [faulty, setFaulty] = useState(false);
  const done = () => {
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['refunds'] });
  };
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      adminApi.decide(r.id, { decision, ...(r.kind === 'damaged' && decision === 'approve' ? { resolution } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: done,
  });
  const complete = useMutation({ mutationFn: () => adminApi.completeReturn(r.id, { faulty }), onSuccess: done });

  return (
    <li className="card">
      <h3>{r.orderNumber} <Badge tone={r.kind === 'damaged' ? 'offer' : undefined}>{r.kind === 'damaged' ? 'Damaged' : 'Return'}</Badge></h3>
      <p className="muted">{shortDate(r.createdAt)} · up to {rupees(r.refundAmount)} · {r.status}{r.resolution ? ` (${r.resolution})` : ''}</p>
      <p>{r.reason}</p>
      {r.photoUrls.length > 0 && (
        <ul>
          {r.photoUrls.map((u, i) => <li key={i}><a href={u} target="_blank" rel="noopener noreferrer">Photo {i + 1}</a></li>)}
        </ul>
      )}
      {r.staffNote && <p className="muted">Note: {r.staffNote}</p>}
      {r.status === 'requested' && (
        <>
          {r.kind === 'damaged' && (
            <fieldset className="actions">
              <legend className="sy-sr-only">Resolution</legend>
              <label><input type="radio" name={`res-${r.id}`} checked={resolution === 'refund'} onChange={() => setResolution('refund')} /> Refund in full</label>
              <label><input type="radio" name={`res-${r.id}`} checked={resolution === 'replacement'} onChange={() => setResolution('replacement')} /> Send a replacement</label>
            </fieldset>
          )}
          <TextArea label="Note to the customer (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="actions">
            <Button size="small" loading={decide.isPending && decide.variables === 'approve'} disabled={decide.isPending} onClick={() => decide.mutate('approve')}>Approve</Button>
            <Button size="small" variant="secondary" loading={decide.isPending && decide.variables === 'reject'} disabled={decide.isPending} onClick={() => decide.mutate('reject')}>Reject</Button>
          </div>
          <ActionError error={decide.error} />
        </>
      )}
      {r.status === 'approved' && r.kind === 'return' && (
        <>
          <label className="actions"><input type="checkbox" checked={faulty} onChange={(e) => setFaulty(e.target.checked)} /> The goods were faulty (also refund delivery)</label>
          <Button size="small" loading={complete.isPending} onClick={() => complete.mutate()}>Goods received: create refund</Button>
          <ActionError error={complete.error} />
        </>
      )}
    </li>
  );
}

function RefundRow({ f }: { f: Refund }) {
  const qc = useQueryClient();
  const process = useMutation({ mutationFn: () => adminApi.processRefund(f.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['refunds'] }); qc.invalidateQueries({ queryKey: ['orders'] }); } });
  const overdue = f.status === 'pending' && f.dueBy < new Date().toISOString().slice(0, 10);
  return (
    <tr>
      <th scope="row">{f.orderNumber}<br /><span className="muted">{f.reason}</span></th>
      <td className="num">{rupees(f.amount)}</td>
      <td>{f.method === 'cod' ? 'Cash' : f.method === 'card' ? 'Card' : 'Bank transfer'}</td>
      <td>{f.status === 'processed' ? `Paid ${f.processedAt ? shortDate(f.processedAt) : ''}` : <>Due {shortDate(f.dueBy)} {overdue && <Badge tone="offer">Overdue</Badge>}</>}</td>
      <td>
        {f.status === 'pending' && <Button size="small" loading={process.isPending} onClick={() => process.mutate()}>Mark money sent</Button>}
        <ActionError error={process.error} />
      </td>
    </tr>
  );
}

const FILTERS = [['requested', 'To decide'], ['approved', 'Approved'], ['', 'All']] as const;

export function Returns() {
  const [filter, setFilter] = useState<string>('requested');
  const returns = useQuery({ queryKey: ['returns', filter], queryFn: ({ signal }) => adminApi.returns(filter || undefined, { signal }) });
  const refunds = useQuery({ queryKey: ['refunds'], queryFn: ({ signal }) => adminApi.refunds({ signal }) });
  const pending = refunds.data?.filter((f) => f.status === 'pending') ?? [];
  return (
    <>
      <title>Returns and refunds | Sentimently studio</title>
      <h1>Returns and refunds</h1>

      <section aria-labelledby="rf">
        <h2 id="rf">Refunds to send{refunds.data ? ` (${pending.length})` : ''}</h2>
        {refunds.error ? <QueryError error={refunds.error} onRetry={() => refunds.refetch()} what="the refunds" /> : !refunds.data ? <p aria-busy="true">Loading…</p> : !refunds.data.length ? <p>No refunds yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sy-sr-only">Refunds</caption>
              <thead><tr><th scope="col">Order</th><th scope="col" className="num">Amount</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col"><span className="sy-sr-only">Action</span></th></tr></thead>
              <tbody>{[...refunds.data].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || a.dueBy.localeCompare(b.dueBy)).map((f) => <RefundRow key={f.id} f={f} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="rq">
        <h2 id="rq">Return and damage requests</h2>
        <div className="presets" role="group" aria-label="Show">
          {FILTERS.map(([k, label]) => <Chip key={k} pressed={filter === k} onClick={() => setFilter(k)}>{label}</Chip>)}
        </div>
        {returns.error ? <QueryError error={returns.error} onRetry={() => returns.refetch()} what="the requests" /> : !returns.data ? <p aria-busy="true">Loading…</p> : !returns.data.length ? (
          <EmptyState title="No requests here" message="Customer return and damage requests appear here." />
        ) : (
          <ul className="cards">{returns.data.map((r) => <Request key={r.id} r={r} />)}</ul>
        )}
      </section>
    </>
  );
}
