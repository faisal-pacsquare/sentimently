import { ApiError } from '@sentimently/api';
import { Alert, Button, ProblemList } from '@sentimently/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import type { ImportReport } from '../lib/admin-api';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const MAX = 90_000;

/** Add many gifts (and any new categories, occasions and so on) at once from the studio's two spreadsheets. */
export function ImportGifts() {
  const qc = useQueryClient();
  const [groups, setGroups] = useState<{ name: string; text: string } | null>(null);
  const [gifts, setGifts] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [checked, setChecked] = useState<ImportReport | null>(null);

  const pick = (set: typeof setGroups) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setChecked(null);
    run.reset();
    if (!file) return;
    if (file.size > MAX) return setFileError(`${file.name} is too big (the limit is about 90 KB, around 150 gifts). Split it into two files.`);
    setFileError('');
    set({ name: file.name, text: await readText(file) });
  };

  const run = useMutation({
    mutationFn: (dryRun: boolean) => adminApi.importCatalogue({ productsCsv: gifts!.text, ...(groups ? { taxonomyCsv: groups.text } : {}), dryRun }),
    onSuccess: (report) => {
      setChecked(report);
      if (report.saved) {
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['groups'] });
      }
    },
  });

  const problems = run.error instanceof ApiError && !run.error.isTemporary ? (run.error.details.length ? run.error.details : [run.error.message]) : [];
  const offline = run.error && !problems.length;
  const nothingNew = checked && !checked.addedGifts.length && !checked.addedGroups.length;

  return (
    <>
      <title>Add gifts from a spreadsheet | Bloomora studio</title>
      <h1>Add gifts from a spreadsheet</h1>
      <p><Link to="/catalogue">← Back to the catalogue</Link></p>
      <p className="muted">
        Use this to add many gifts at once. Choose the gifts file (and the groups file, if it adds new categories or occasions), check it, then add it. Gifts that are already in the shop are never changed, so photos and prices you edited stay as they are, and adding the same file twice does nothing.
      </p>

      <div className="auth-form">
        <div className="sy-field">
          <label htmlFor="groups-file">Groups file (optional)</label>
          <input id="groups-file" type="file" accept=".csv,text/csv" onChange={pick(setGroups)} />
          <span className="sy-field__hint">{groups ? `Chosen: ${groups.name}` : 'The categories, occasions and so on the new gifts use.'}</span>
        </div>
        <div className="sy-field">
          <label htmlFor="gifts-file">Gifts file</label>
          <input id="gifts-file" type="file" accept=".csv,text/csv" onChange={pick(setGifts)} />
          <span className="sy-field__hint">{gifts ? `Chosen: ${gifts.name}` : 'The gifts to add, one per row.'}</span>
        </div>
        {fileError && <Alert tone="error">{fileError}</Alert>}
        <div className="actions">
          <Button variant="secondary" disabled={!gifts} loading={run.isPending && run.variables === true} onClick={() => run.mutate(true)}>Check the files</Button>
          <Button disabled={!gifts || !checked || checked.saved || !!nothingNew} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
            Add to the shop
          </Button>
        </div>
      </div>

      {problems.length > 0 && <ProblemList title="Nothing was added. Fix these rows and choose the file again:" problems={problems} />}
      {offline && <Alert tone="error">That did not go through (the server could not be reached). Nothing was added; please try again.</Alert>}

      {checked && (
        <section aria-live="polite" aria-labelledby="report">
          <h2 id="report">{checked.saved ? 'Added' : 'The check passed'}</h2>
          {nothingNew ? (
            <Alert tone="info">Everything in these files is already in the shop, so there is nothing to add.</Alert>
          ) : (
            <>
              {checked.addedGroups.length > 0 && <p><strong>{checked.saved ? 'New groups added' : 'New groups to add'}:</strong> {checked.addedGroups.join(', ')}</p>}
              <p><strong>{checked.saved ? 'Gifts added' : 'Gifts to add'} ({checked.addedGifts.length}):</strong> {checked.addedGifts.join(', ') || 'none'}</p>
            </>
          )}
          {checked.skippedGifts.length > 0 && <p className="muted">Already in the shop and left as they are ({checked.skippedGifts.length}): {checked.skippedGifts.join(', ')}</p>}
          {checked.warnings.length > 0 && <Alert tone="warn"><ul>{checked.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
          {checked.saved && <p><Button as={Link} to="/catalogue">See the catalogue</Button></p>}
          {!checked.saved && !nothingNew && <p className="muted">Nothing is saved yet. Press <strong>Add to the shop</strong> to save these.</p>}
        </section>
      )}
    </>
  );
}
