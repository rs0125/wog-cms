import Link from 'next/link';
import { requireUser } from '@/lib/auth';

// Every authenticated page lives under this route group, so the auth check
// happens once here instead of being repeated (and eventually forgotten) in each
// page. `(authed)` is a route group: it enforces the gate without appearing in
// any URL, so /guides stays /guides.
//
// This is the security boundary. There is no middleware/proxy doing a partial
// check — one place, in the render path, with access to the session.
export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-wareongo-blue/15 bg-white/70">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3">
          <Link href="/guides" className="font-display text-lg text-wareongo-blue">
            WareOnGo Content Studio
          </Link>
          <span className="ml-auto text-xs text-wareongo-slate" title={user.email}>
            {user.name}
          </span>
          <form action="/api/auth/logout" method="post">
            <button className="cms-btn">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
