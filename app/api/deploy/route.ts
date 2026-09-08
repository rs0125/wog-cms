import { timingSafeEqual } from 'node:crypto';
import { deployHookUrl } from '@/lib/deploy';
import { requestSiteBuild, type SiteBuildResult } from '@/lib/site-build';
import { requestWebpCompression, type WebpTriggerResult } from '@/lib/webp-compression';

export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// The existing hook URL remains the nightly maintenance credential. Supabase holds
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

  // Both triggers start immediately. A compression failure cannot prevent the
  // website build, and the CMS never waits for the backend's full photo sweep.
  const [buildAttempt, compressionAttempt] = await Promise.allSettled([
    requestSiteBuild(), requestWebpCompression(),
  ]);
  const result: SiteBuildResult = buildAttempt.status === 'fulfilled' ? buildAttempt.value
    : { ok: false, status: 502, error: 'Website build request failed. Check Vercel before retrying.' };
  const webp: WebpTriggerResult = compressionAttempt.status === 'fulfilled' ? compressionAttempt.value
    : { ok: false, error: 'WebP compression could not be requested.' };
  const compression = webp.ok ? { status: webp.status, jobId: webp.jobId }
    : { status: 'unavailable', error: webp.error };
  if (!result.ok) return json({ error: result.error, compression }, result.status);
  const warnings = [result.warning, webp.ok ? undefined : `Website build accepted, but ${webp.error}`].filter(Boolean);

  // Accepted means Vercel acknowledged the trigger, not that the build is live.
  return json({
    status: 'accepted',
    message: 'Website build requested. Compression runs independently; check each service for completion.',
    jobId: result.jobId ?? null,
    compression,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  }, 202);
}
