import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Keyed to the ?error= values the OAuth routes redirect back with.
const ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: "Google sign-in isn't configured yet.",
  missing_code: 'Google sign-in was cancelled.',
  invalid_state: 'Sign-in session expired. Please try again.',
  token_exchange_failed: 'Could not complete Google sign-in.',
  no_access_token: 'Could not complete Google sign-in.',
  userinfo_failed: 'Could not read your Google profile.',
  email_not_verified: 'Your Google email is not verified.',
  not_allowed: "That account doesn't have access. Ask an admin to grant it.",
  access_denied: 'You declined the Google sign-in prompt.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentUser()) redirect('/guides');

  const sp = await searchParams;
  const rawErr = typeof sp.error === 'string' ? sp.error : null;
  const email = typeof sp.email === 'string' ? sp.email : null;
  const err = rawErr
    ? `${ERROR_MESSAGES[rawErr] ?? 'Sign-in failed.'}${email ? ` (${email})` : ''}`
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-wareongo-blue/20 bg-white p-8">
        <div className="mb-4 flex items-center gap-2.5">
          <Image src="/wareongo-logo.webp" alt="WareOnGo" width={120} height={85} priority className="h-7 w-auto" />
          <span className="text-sm font-bold tracking-widest text-wareongo-blue">WAREONGO</span>
        </div>
        <h1 className="cms-title text-3xl">Content Studio</h1>
        <p className="mt-2 mb-7 text-sm text-wareongo-slate">
          Sign in with your WareOnGo Google account to manage site content.
        </p>

        {err && (
          <p className="mb-5 rounded-xl border border-wareongo-sienna/30 bg-wareongo-sienna/5 px-4 py-2.5 text-sm text-wareongo-sienna">
            {err}
          </p>
        )}

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-wareongo-blue/25 bg-white px-5 py-3 text-sm font-semibold text-wareongo-charcoal transition-colors hover:bg-wareongo-blue/5"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
            />
          </svg>
          Continue with Google
        </a>

      </div>
    </main>
  );
}
