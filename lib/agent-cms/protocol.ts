import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import { CmsError } from './schema';

const claims = z
  .object({
    actor_email: z.email().max(254),
    actor_id: z.number().int().positive(),
    action: z.enum([
      'schema',
      'list_pages',
      'read_page',
      'prepare_import',
      'read_import',
      'fill_empty_drafts',
      'edit_drafts',
    ]),
    args: z.record(z.string(), z.unknown()),
    issued_at: z.number().int(),
    expires_at: z.number().int(),
    request_id: z.uuid(),
    audience: z.literal('wareongo:cms-drafts:v1'),
  })
  .strict();
const keys = z
  .array(
    z
      .object({
        kid: z.string().regex(/^[A-Za-z0-9_-]{1,48}$/),
        expiresAt: z.iso.datetime(),
        publicKey: z
          .object({
            kty: z.literal('OKP'),
            crv: z.literal('Ed25519'),
            x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          })
          .strict(),
      })
      .strict(),
  )
  .min(1)
  .max(3);
export async function authenticatedRequest(
  request: Request,
  allowed: (email: string) => boolean,
  env = process.env,
  now = Date.now(),
) {
  if (env.CMS_CONTEXT_ENABLED !== 'true')
    throw new CmsError('CMS_DISABLED', 'CMS integration is disabled.', 503);
  if (
    request.method !== 'POST' ||
    request.headers.has('origin') ||
    request.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
    request.headers.has('content-encoding')
  )
    throw new CmsError('CMS_UNAUTHORIZED', 'Invalid integration request.', 401);
  const auth =
    /^ContextEngine ([A-Za-z0-9_-]{1,48})\.([A-Za-z0-9_-]{86})$/.exec(
      request.headers.get('authorization') ?? '',
    );
  if (!auth)
    throw new CmsError(
      'CMS_UNAUTHORIZED',
      'Signed integration credentials required.',
      401,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new CmsError('CMS_UNAUTHORIZED', 'Request body required.', 401);
  const chunks: Buffer[] = [];
  let bytes = 0;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  const cancel = () => {
    void reader.cancel();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 32768) {
        void reader.cancel();
        throw new CmsError('BODY_TOO_LARGE', 'Use a smaller CSV batch.', 413);
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const key = keys
    .parse(JSON.parse(env.CMS_CONTEXT_PUBLIC_KEYS_JSON ?? '[]'))
    .find((k) => k.kid === auth[1]);
  const body = Buffer.concat(chunks);
  if (
    !key ||
    Date.parse(key.expiresAt) <= now ||
    !verify(
      null,
      body,
      createPublicKey({ key: key.publicKey, format: 'jwk' }),
      Buffer.from(auth[2], 'base64url'),
    )
  )
    throw new CmsError(
      'CMS_UNAUTHORIZED',
      'Integration signature is invalid.',
      401,
    );
  const value = claims.parse(JSON.parse(body.toString('utf8')));
  if (
    value.issued_at > now + 5000 ||
    value.issued_at < now - 60000 ||
    value.expires_at <= now ||
    value.expires_at > value.issued_at + 60000 ||
    value.actor_email !== value.actor_email.trim().toLowerCase()
  )
    throw new CmsError(
      'CMS_UNAUTHORIZED',
      'Integration credential expired or invalid.',
      401,
    );
  if (!allowed(value.actor_email))
    throw new CmsError(
      'CMS_FORBIDDEN',
      'Current CMS editor access is required.',
      403,
    );
  return value;
}
