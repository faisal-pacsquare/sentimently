import { shortDate } from '@sentimently/api';
import { Alert, Badge, Button, SelectField, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../lib/admin-api';
import type { TeamMember } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import { ActionError, QueryError } from '../lib/present';

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function Member({ m, isMe }: { m: TeamMember; isMe: boolean }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({ mutationFn: () => adminApi.removeTeamMember(m.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }) });
  return (
    <tr>
      <th scope="row">{m.name ?? m.email}{isMe && <> <Badge>You</Badge></>}<br /><span className="muted">{m.email}</span></th>
      <td>{m.role === 'admin' ? 'Administrator' : 'Staff'}</td>
      <td>{shortDate(m.createdAt)}</td>
      <td>
        {!isMe && !confirm && <Button size="small" variant="ghost" onClick={() => setConfirm(true)} aria-label={`Remove access for ${m.name ?? m.email}`}>Remove access</Button>}
        {confirm && (
          <div className="actions">
            <Button size="small" loading={remove.isPending} onClick={() => remove.mutate()}>Yes, remove</Button>
            <Button size="small" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
          </div>
        )}
        <ActionError error={remove.error} />
      </td>
    </tr>
  );
}

function AddMember() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    email: emailOk(email) ? '' : 'Enter their email address.',
    password: password.length >= 12 ? '' : 'Use at least 12 characters.',
  };
  const add = useMutation({
    mutationFn: () => adminApi.addTeamMember({ email: email.trim(), password, role, ...(name.trim() ? { name: name.trim() } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); setEmail(''); setName(''); setPassword(''); setSubmitted(false); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!errors.email && !errors.password) add.mutate();
  };
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h2>Add someone</h2>
      <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} hint="Must not already have a customer account." error={submitted ? errors.email : ''} />
      <TextField label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 12 characters. Tell them privately, and ask them to keep it safe." error={submitted ? errors.password : ''} />
      <SelectField label="Access" value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'admin')} hint="Staff can run orders, the catalogue and the inbox. Administrators can also change settings and the team.">
        <option value="staff">Staff</option>
        <option value="admin">Administrator</option>
      </SelectField>
      <ActionError error={add.error} />
      {add.isSuccess && <Alert tone="info">Added. They can sign in at once.</Alert>}
      <Button type="submit" loading={add.isPending}>Add to the team</Button>
    </form>
  );
}

function Tools() {
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState(false);
  const erase = useMutation({ mutationFn: () => adminApi.erasePerson(email.trim()), onSuccess: () => setConfirm(false) });
  const jobs = useMutation({ mutationFn: () => adminApi.runJobs() });
  return (
    <>
      <section aria-labelledby="jobs">
        <h2 id="jobs">Run the daily jobs now</h2>
        <p className="muted">Sends reminders, scheduled digital gifts, overdue-refund alerts and expires old gift links. They also run by themselves on a schedule; this is for when you do not want to wait.</p>
        <Button variant="secondary" loading={jobs.isPending} onClick={() => jobs.mutate()}>Run now</Button>
        <ActionError error={jobs.error} />
        {jobs.isSuccess && <Alert tone="info">Done.</Alert>}
      </section>

      <section aria-labelledby="erase">
        <h2 id="erase">Erase a person's data</h2>
        <p className="muted">For a privacy request. Removes their account, wishlist and reminders, and takes their name, email, phone and address off their orders. Amounts and dates stay for the accounts. This cannot be undone.</p>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (emailOk(email)) setConfirm(true); }} noValidate>
          <TextField label="Their email address" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setConfirm(false); erase.reset(); }} />
          {!confirm && <Button type="submit" variant="secondary" disabled={!emailOk(email)}>Erase…</Button>}
        </form>
        {confirm && (
          <div className="actions">
            <Button loading={erase.isPending} onClick={() => erase.mutate()}>Yes, erase everything for {email.trim()}</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        )}
        <ActionError error={erase.error} />
        {erase.data && <Alert tone="info">{erase.data.erased ? 'Their data has been erased.' : 'We hold no data for that email address.'}</Alert>}
      </section>
    </>
  );
}

export function Team() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['team'], queryFn: ({ signal }) => adminApi.team({ signal }) });
  return (
    <>
      <title>Team | Bloomora studio</title>
      <h1>Team and tools</h1>
      <div className="cols">
        <section aria-labelledby="tm">
          <h2 id="tm">Who has access</h2>
          {q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the team" /> : !q.data ? <p aria-busy="true">Loading…</p> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sy-sr-only">Team</caption>
                <thead><tr><th scope="col">Person</th><th scope="col">Access</th><th scope="col">Added</th><th scope="col"><span className="sy-sr-only">Action</span></th></tr></thead>
                <tbody>{q.data.map((m) => <Member key={m.id} m={m} isMe={m.id === user?.id} />)}</tbody>
              </table>
            </div>
          )}
          <p className="muted">Removing access turns the person back into an ordinary customer. You cannot remove yourself or the last administrator.</p>
        </section>
        <AddMember />
      </div>
      <Tools />
    </>
  );
}
