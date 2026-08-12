import { S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2, addressed through the S3 API — the same five variables and the
// same bucket the backend's scripts/compress_photos_to_webp.js already uses, so
// there is one bucket and one public host to reason about. Guide images live
// under the `guides/` prefix, alongside the warehouse photos.
//
// Shaped like lib/deploy.ts: one module knows how this is configured, and a
// missing variable produces a sentence an editor can act on rather than a stack
// trace from deep inside the AWS SDK.

/** Object-key prefix for everything this app uploads. */
export const KEY_PREFIX = 'guides';

export type R2Target = {
  client: S3Client;
  bucket: string;
  /** Public host, no trailing slash — e.g. https://pub-xxxx.r2.dev */
  publicBase: string;
};

// Module scope, so a warm serverless instance reuses the client (and its
// connection pool) instead of building a new one per upload.
let cached: R2Target | undefined;

export function r2(): { ok: true; target: R2Target } | { ok: false; error: string } {
  if (cached) return { ok: true, target: cached };

  const env = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID?.trim(),
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID?.trim(),
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY?.trim(),
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME?.trim(),
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL?.trim(),
  };

  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    return { ok: false, error: `Image uploads are not configured. Missing: ${missing.join(', ')}.` };
  }

  // The public base is stored inside every guide's content, so a mis-pasted
  // value would bake broken image URLs into the site.
  const publicBase = env.R2_PUBLIC_URL!.replace(/\/+$/, '');
  if (!publicBase.startsWith('https://')) {
    return { ok: false, error: 'R2_PUBLIC_URL must be an https host with no trailing slash.' };
  }

  cached = {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    }),
    bucket: env.R2_BUCKET_NAME!,
    publicBase,
  };
  return { ok: true, target: cached };
}
