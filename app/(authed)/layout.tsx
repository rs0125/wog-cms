import Image from 'next/image';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

// Every authenticated page lives under this route group, so the auth check
// happens once here instead of being repeated (and eventually forgotten) in each
// page. `(authed)` is a route group: it enforces the gate without appearing in
// any URL, so /guides stays /guides.
//
// This is the security boundary. There is no proxy doing a partial check — one
// place, in the render path, with access to the session.
export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-wareongo-blue/15 bg-white/70">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-3">
          {/* Same logo + wordmark pairing as the public site's navbar. */}
          <Link href="/guides" className="flex items-center gap-2.5">
            <Image src="/wareongo-logo.webp" alt="WareOnGo" width={120} height={85} priority className="h-8 w-auto" />
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-widest text-wareongo-blue">WAREONGO</span>
              <span className="block text-[11px] tracking-wide text-wareongo-slate">Content Studio</span>
            </span>
          </Link>
          <span className="ml-auto hidden text-xs text-wareongo-slate sm:inline" title={user.email}>
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
