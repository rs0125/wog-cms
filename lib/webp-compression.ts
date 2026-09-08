import { createHmac } from 'node:crypto';

export type WebpTriggerResult =
  | { ok: true; status: 'accepted' | 'already_running'; jobId: string }
  | { ok: false; error: string };

/** Await the backend's acknowledgement, never the full compression sweep. */
export async function requestWebpCompression(): Promise<WebpTriggerResult> {
  const secret = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!secret) return { ok: false, error: 'WebP compression requires the shared R2 configuration.' };

  try {
    const base = new URL(process.env.WAREONGO_API_BASE?.trim() || 'https://wareongo-website-backend.onrender.com');
    if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) || base.username || base.password) {
      return { ok: false, error: 'The warehouse backend URL is invalid.' };
    }
    // Domain-separated credential: matches the backend and confers permission
    // to trigger/read this job only. The underlying R2 secret is never sent.
    const token = createHmac('sha256', secret).update('wareongo:warehouse-webp-trigger:v1').digest('hex');
    const response = await fetch(new URL('/maintenance/webp', base).href, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 202) return { ok: false, error: `WebP service returned HTTP ${response.status}.` };
    const body = await response.json() as { status?: string; jobId?: string };
    if (!['accepted', 'already_running'].includes(body?.status ?? '') || typeof body?.jobId !== 'string' || !body.jobId) {
      return { ok: false, error: 'WebP service did not acknowledge a compression job.' };
    }
    return { ok: true, status: body.status as 'accepted' | 'already_running', jobId: body.jobId };
  } catch {
    // No upstream bodies, raw exceptions, URLs or credentials in the response.
    return { ok: false, error: 'WebP service could not be reached in time. Check its job status before retrying.' };
  }
}
