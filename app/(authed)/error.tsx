'use client';

import Link from 'next/link';

// Catches render/data errors under the authed group so a thrown exception shows
// something usable instead of Next's bare error screen. `error.message` is
// deliberately not rendered — in production Next replaces it with a digest
// anyway, and echoing server error text to the browser is how internals leak.
export default function AuthedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <span className="cms-eyebrow mb-2 block">Something broke</span>
      <h1 className="cms-title mb-3">This page didn&apos;t load</h1>
      <p className="mb-6 max-w-prose text-sm text-wareongo-slate">
        This request could not finish. If you were saving changes, check the saved content before retrying.
      </p>
      <div className="flex gap-2">
        <button onClick={reset} className="cms-btn-primary">
          Try again
        </button>
        <Link href="/blogs" className="cms-btn px-4 py-2.5 text-sm">
          Back to blogs
        </Link>
      </div>
    </main>
  );
}
