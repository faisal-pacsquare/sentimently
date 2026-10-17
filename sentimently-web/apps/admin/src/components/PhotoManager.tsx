import { ApiError } from '@sentimently/api';
import { Alert, Badge, Button, SafeImage, TextField } from '@sentimently/ui';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { adminApi } from '../lib/admin-api';
import { MAX_PHOTOS, photoSrc, PHOTO_TYPES, PhotoError, preparePhoto } from '../lib/photos';

const isLink = (s: string) => /^https:\/\/\S+$/i.test(s.trim());
const reason = (e: unknown) =>
  e instanceof PhotoError ? e.message : e instanceof ApiError && !e.isTemporary ? e.details[0] ?? e.message : 'Could not upload (the connection failed). Please try again.';

interface Props {
  /** The photos, main photo first. */
  value: string[];
  onChange(urls: string[]): void;
  /** The photos the gift already had when the form opened (they are deleted from storage only once the gift is saved). */
  saved: string[];
  /** Photos uploaded in this session: deleted again if the form is left without saving. */
  fresh: React.MutableRefObject<Set<string>>;
  name: string;
}

/**
 * Add, remove and reorder a gift's photos. The first photo is the main one (the shop's card and the top of the gift page).
 * Photos are shrunk in the browser and uploaded straight away; links to photos elsewhere also work.
 */
export function PhotoManager({ value, onChange, saved, fresh, name }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [dragging, setDragging] = useState(false);
  const latest = useRef(value);
  latest.current = value;

  const room = MAX_PHOTOS - value.length;

  async function addFiles(files: File[]) {
    if (!files.length) return;
    const wanted = files.slice(0, Math.max(room, 0));
    const errors: string[] = files.length > wanted.length ? [`Only ${MAX_PHOTOS} photos per gift: ${files.length - wanted.length} not added.`] : [];
    setBusy((n) => n + wanted.length);
    // One at a time, so the order they were chosen in is the order they appear in.
    for (const file of wanted) {
      try {
        const { blob, name: fileName } = await preparePhoto(file);
        const { url } = await adminApi.uploadPhoto(blob, fileName);
        fresh.current.add(url);
        onChange([...latest.current, url]);
        latest.current = [...latest.current, url];
      } catch (e) {
        errors.push(`${file.name}: ${reason(e).replace(`${file.name}: `, '')}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    setProblems(errors);
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ''; // so choosing the same file again works
    void addFiles(files);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles([...e.dataTransfer.files]);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    onChange(next);
  };

  const remove = async (url: string) => {
    onChange(value.filter((u) => u !== url));
    // A photo uploaded a moment ago and never saved on the gift can go from storage at once.
    // One the gift already had is deleted when the gift is saved, so cancelling the form loses nothing.
    if (fresh.current.has(url) && !saved.includes(url)) {
      fresh.current.delete(url);
      try {
        await adminApi.deletePhoto(url);
      } catch {
        /* a leftover file is harmless */
      }
    }
  };

  const addLink = () => {
    const url = link.trim();
    if (!isLink(url)) return setLinkError('Use a full link starting with https://.');
    if (value.includes(url)) return setLinkError('That photo is already on this gift.');
    if (room <= 0) return setLinkError(`Only ${MAX_PHOTOS} photos per gift.`);
    onChange([...value, url]);
    setLink('');
    setLinkError('');
  };

  // Leaving the page with photos that were uploaded but not saved: tidy them away.
  const leftover = useRef<() => void>(() => undefined);
  leftover.current = () => {
    for (const url of fresh.current) if (!saved.includes(url) && !latest.current.includes(url)) void adminApi.deletePhoto(url).catch(() => undefined);
  };
  useEffect(() => () => leftover.current(), []);

  return (
    <fieldset className="photos">
      <legend>Photos</legend>
      <p className="muted">The first photo is the main one: it is the picture on the shop's cards and at the top of the gift page. Photos are shrunk automatically.</p>

      {value.length > 0 && (
        <ol className="photos__list" aria-label="Photos of this gift">
          {value.map((url, i) => (
            <li key={url} className="photos__item">
              <span className="photos__thumb"><SafeImage src={photoSrc(url)} name={name || 'Gift'} /></span>
              {i === 0 && <Badge tone="digital">Main photo</Badge>}
              <span className="photos__actions">
                {i > 0 && <Button variant="secondary" size="small" onClick={() => move(i, 0)} aria-label={`Make photo ${i + 1} the main photo`}>Make main</Button>}
                <Button variant="ghost" size="small" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move photo ${i + 1} earlier`}>←</Button>
                <Button variant="ghost" size="small" disabled={i === value.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move photo ${i + 1} later`}>→</Button>
                <Button variant="ghost" size="small" onClick={() => remove(url)} aria-label={`Remove photo ${i + 1}`}>Remove</Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {value.length === 0 && busy === 0 && <p className="photos__none">No photos yet. Gifts without one show a coloured tile with their first letter.</p>}

      <div
        className={`photos__drop${dragging ? ' photos__drop--over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={input} className="sy-sr-only" type="file" accept={PHOTO_TYPES.join(',')} multiple onChange={onPick} aria-label="Choose photos to upload" disabled={room <= 0} />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={room <= 0} loading={busy > 0}>
          {busy > 0 ? `Uploading ${busy}…` : 'Add photos'}
        </Button>
        <span className="muted"> or drop photos here · JPEG, PNG, WebP or GIF · {room > 0 ? `${room} more allowed` : 'the limit is reached'}</span>
      </div>
      {problems.length > 0 && <Alert tone="error"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert>}

      <div className="photos__link">
        <TextField label="Or add a photo by link" value={link} onChange={(e) => { setLink(e.target.value); setLinkError(''); }} hint="A full link starting with https://, from another website." error={linkError} />
        <Button variant="secondary" size="small" onClick={addLink}>Add link</Button>
      </div>
    </fieldset>
  );
}
