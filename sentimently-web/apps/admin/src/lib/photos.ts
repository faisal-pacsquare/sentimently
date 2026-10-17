/** What the studio may upload, matching what the server accepts. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // the server (and Vercel) refuse larger
export const MAX_PHOTOS = 10;
const MAX_SIDE = 1600; // pixels: plenty for a product page, and keeps the shop fast

/**
 * A relative path such as /images/demo/mug.svg lives on the shop's website, not on this console's.
 * Set VITE_SHOP_URL (the shop's address) so those thumbnails show here too.
 */
export function photoSrc(url: string): string {
  const shop = (import.meta.env.VITE_SHOP_URL as string | undefined)?.replace(/\/+$/, '');
  return shop && url.startsWith('/') && !url.startsWith('/api/') ? `${shop}${url}` : url;
}

export class PhotoError extends Error {}

/**
 * Phone cameras make 5 to 12 MB photos. This shrinks them in the browser to at most 1600 pixels on the long side
 * and saves them as JPEG, so the upload is fast and the shop stays quick. GIFs are left alone (they may move).
 * Where the browser cannot do that, the original is sent if it is small enough.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; name: string }> {
  if (!PHOTO_TYPES.includes(file.type)) throw new PhotoError(`${file.name}: use a JPEG, PNG, WebP or GIF photo.`);
  const keep = { blob: file as Blob, name: file.name };
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return checkSize(file, keep);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return checkSize(file, keep);
    ctx.fillStyle = '#ffffff'; // transparent areas become white, as a JPEG has none
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || (blob.size >= file.size && file.size <= MAX_UPLOAD_BYTES)) return checkSize(file, keep); // no gain: keep the original
    return checkSize(file, { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' });
  } catch {
    return checkSize(file, keep);
  }
}

function checkSize(file: File, result: { blob: Blob; name: string }) {
  if (result.blob.size > MAX_UPLOAD_BYTES)
    throw new PhotoError(`${file.name} is too large (over 4 MB) and could not be shrunk here. Try a smaller photo.`);
  return result;
}
