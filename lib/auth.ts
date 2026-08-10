import { cache } from 'react';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Google OAuth, following EmployeeReimbursementPortal's lib/auth.ts: the cookie
// identifies the signed-in user and authority is re-derived from the allowlist
// on every request, so removing someone locks them out immediately.
//
// SECURITY — why the cookie is signed:
// Storing the bare email made authentication forgeable. An email address is
// public information, so `Cookie: cms_session=someone@wareongo.com` was enough
// to get full read/write access without ever touching Google, which made the
// entire OAuth flow decorative. httpOnly does not help: it stops JavaScript
// *reading* a cookie, not an attacker *setting* one.
//
// So the cookie is now `<payload>.<hmac>`, where payload is base64url JSON and
// the HMAC is keyed with SESSION_SECRET. Forging it requires the secret.
// The allowlist check still runs on top, for instant revocation.

const COOKIE_NAME = 'cms_session';
const MAX_AGE = 60 * 60 * 24 * 30;

export type CurrentUser = {
  email: string;
  name: string;
};

type Payload = { e: string; n: string };

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 chars. Generate one with: openssl rand -base64 32',
    );
  }
  return Buffer.from(s, 'utf8');
}

const b64url = (b: Buffer) => b.toString('base64url');
const sign = (payload: string) => b64url(createHmac('sha256', secret()).update(payload).digest());

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would leak length itself.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Who may use the CMS. The portal reads its equivalent list from the DB and
 * uses env only for the admin flag; here it's env-only, because this app's
 * Prisma schema deliberately declares just the Guide model. Move it to a table
 * if the editor list changes often enough that a redeploy is annoying.
 */
function allowedEmails(): Set<string> {
  return new Set(
    (process.env.CMS_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const isAllowed = (email: string) => allowedEmails().has(email.trim().toLowerCase());

/** Random value for the OAuth `state` parameter. */
export const newOauthState = () => randomBytes(16).toString('hex');

export async function setSession(user: CurrentUser): Promise<void> {
  const payload = b64url(Buffer.from(JSON.stringify({ e: user.email, n: user.name } satisfies Payload)));
  const c = await cookies();
  c.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Returns the payload only when the signature verifies. */
function readCookie(raw: string | undefined): Payload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  const provided = raw.slice(dot + 1);
  if (!safeEqual(provided, sign(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Payload;
    if (typeof parsed?.e !== 'string' || !parsed.e) return null;
    return { e: parsed.e, n: typeof parsed.n === 'string' && parsed.n ? parsed.n : parsed.e };
  } catch {
    return null;
  }
}

// `cache` dedupes across a single render pass, so a layout and the page beneath
// it don't each redo the verification.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = readCookie((await cookies()).get(COOKIE_NAME)?.value);
  if (!payload) return null;
  // Signature proves the cookie came from us; the allowlist decides whether the
  // person is still permitted. Both must pass.
  if (!isAllowed(payload.e)) return null;
  return { email: payload.e, name: payload.n };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return user;
}
