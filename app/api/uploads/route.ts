import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getCurrentUser } from '@/lib/auth';
import { KEY_PREFIX, r2 } from '@/lib/r2';

export const runtime = 'nodejs';

// Stores one image in R2 and returns its public URL. The browser has already
// downscaled and re-encoded to WebP (lib/image-upload.ts), which is why no
// image processing happens here — this route's whole job is to hold the R2
// credentials that must never reach the browser, and to put the bytes somewhere
// with a stable name.
//
// getCurrentUser rather than requireUser: requireUser signals by throwing a
// redirect, which a fetch() caller would see as an opaque failure. A 401 is
// something the editor can actually display.

const ALLOWED = new Map([
  ['image/webp', 'webp'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/avif', 'avif'],
]);

// Vercel caps a function's request body at 4.5MB, and a rejection there arrives
// as a bare 413 with no JSON. Refusing at 4MB keeps the failure ours, with a
// message that says what to do. The client-side WebP pass normally lands two
// orders of magnitude below this.
const MAX_BYTES = 4 * 1024 * 1024;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** `Dock levellers (final).JPG` → `dock-levellers-final` — readable keys, no escaping. */
const slugifyName = (name: string) =>
  name
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return fail(401, 'Your session has expired. Reload and sign in again.');

  const configured = r2();
  if (!configured.ok) return fail(500, configured.error);
  const { client, bucket, publicBase } = configured.target;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'Could not read the upload.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'No file was attached.');

  const ext = ALLOWED.get(file.type);
  if (!ext) return fail(415, `${file.type || 'That file type'} is not an image we can store — use JPEG, PNG, WebP or AVIF.`);
  if (file.size === 0) return fail(400, 'That file is empty.');
  if (file.size > MAX_BYTES) {
    return fail(413, `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 4MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Content-addressed key: re-uploading the same image lands on the same object
  // instead of littering the bucket with copies, and because the name changes
  // whenever the bytes do, the immutable cache header below is always safe.
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const key = `${KEY_PREFIX}/${slugifyName(file.name)}-${digest}.${ext}`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } catch (err) {
    console.error('[uploads] R2 put failed:', err);
    return fail(502, 'Cloudflare R2 refused the upload. The details are in the server logs.');
  }

  return NextResponse.json({ url: `${publicBase}/${key}`, bytes: bytes.length });
}
