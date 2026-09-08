import { timingSafeEqual } from 'node:crypto';
import { deployHookUrl } from '@/lib/deploy';
import { requestSiteBuild } from '@/lib/site-build';

export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// The existing hook URL is already a build-only credential. Supabase holds
// the same value in Vault and sends it as a bearer token. No session signing
// secret or user cookie is needed for machine-to-machine deployment.
export async function POST(request: Request) {
  const hook = deployHookUrl();
  if (!hook.ok) return json({ error: 'Website deployment is not configured.' }, 503);

  const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  const provided = Buffer.from(token ?? '', 'utf8');
  const expected = Buffer.from(hook.url, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const result = await requestSiteBuild();
  if (!result.ok) return json({ error: result.error }, result.status);

  // Accepted means Vercel acknowledged the trigger, not that the build is live.
  return json({
    status: 'accepted',
    message: 'Website build requested. Check Vercel for deployment completion.',
    jobId: result.jobId ?? null,
    ...(result.warning ? { warning: result.warning } : {}),
  }, 202);
}
