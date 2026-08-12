// Browser-side half of the image upload: downscale, re-encode to WebP, measure,
// then POST to /api/uploads.
//
// Why the work happens here and not on the server:
//   * A Vercel function's request body is capped at 4.5MB, and phone photos are
//     routinely bigger. Encoding first means what crosses the wire is a few
//     hundred KB, not 8MB.
//   * The dimensions the guide stores have to match the file that was actually
//     stored. Measuring the very bitmap we encoded is the only way to be sure,
//     and it costs nothing extra here.
//   * No sharp in this app, so no native binary to build or bundle.
//
// The whole pass is best-effort: if any step is unsupported the original file is
// uploaded as-is (subject to the same size limit) and measured from an <img>.

/** Longest edge kept. The guide column is 768px wide, so this covers 2× displays. */
const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.82;

/** Mirrors the route's own limit, so an oversized file fails before it's sent. */
const MAX_BYTES = 4 * 1024 * 1024;

export type UploadedImage = { url: string; alt: string; width: number; height: number };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

/** Natural size as the browser will render it, EXIF orientation included. */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image the browser can read."));
    };
    img.src = url;
  });
}

/**
 * Returns null — rather than throwing — whenever the browser can't do this, so
 * the caller falls back to the original file instead of losing the upload.
 * `imageOrientation: 'from-image'` matters: without it a portrait phone photo
 * would be baked in sideways, since canvas draws the raw bitmap and ignores EXIF.
 */
async function toWebp(file: File): Promise<{ file: File; width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
  );
  // Safari used to hand back a PNG when asked for WebP; checking the type keeps
  // the extension the route derives honest.
  if (!blob || blob.type !== 'image/webp') return null;

  const name = `${file.name.replace(/\.[a-zA-Z0-9]+$/, '')}.webp`;
  return { file: new File([blob], name, { type: 'image/webp' }), width, height };
}

/**
 * Uploads one file and returns the entry to store in the block. `alt` comes back
 * empty on purpose — it's the editor's to write, and the schema won't let a
 * guide save without it.
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const encoded = await toWebp(file);
  const { file: toSend, width, height } = encoded ?? { file, ...(await measure(file)) };

  if (toSend.size > MAX_BYTES) {
    throw new Error(
      `${file.name} is ${mb(toSend.size)} after compression — the limit is ${mb(MAX_BYTES)}. Try a smaller crop.`,
    );
  }

  const body = new FormData();
  body.set('file', toSend);

  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? `Upload failed (${res.status}).`);
  }

  return { url: json.url, alt: '', width, height };
}
