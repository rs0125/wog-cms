import Image from 'next/image';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

// Every authenticated page lives under this route group, so the auth check
// happens once here instead of being repeated (and eventually forgotten) in each
// page. `(authed)` is a route group: it enforces the gate without appearing in
// any URL, so /blogs stays /blogs.
//
// This is the security boundary. There is no proxy doing a partial check — one
// place, in the render path, with access to the session.
export const dynamic = 'force-dynamic';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-wareongo-blue/15 bg-white/70">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-6 py-3">
          {/* Same logo + wordmark pairing as the public site's navbar. */}
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image src="/wareongo-logo.webp" alt="WareOnGo" width={120} height={85} priority className="h-8 w-auto" />
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-widest text-wareongo-blue">WAREONGO</span>
              <span className="block text-[11px] tracking-wide text-wareongo-slate">Content Studio</span>
            </span>
          </Link>
          {/* Section switcher. Plain links, not a client component with an
              active state: both destinations are one segment deep and the page
              heading already says which one you're in. */}
          <nav aria-label="Sections" className="order-last flex w-full flex-wrap items-center gap-1 sm:order-none sm:ml-4 sm:w-auto">
            <Link
              href="/dashboard"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-wareongo-slate transition-colors hover:bg-wareongo-blue/5 hover:text-wareongo-blue"
            >
              Menu
            </Link>
            <Link
              href="/blogs"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-wareongo-slate transition-colors hover:bg-wareongo-blue/5 hover:text-wareongo-blue"
            >
              Blogs
            </Link>
            <Link
              href="/micromarkets"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-wareongo-slate transition-colors hover:bg-wareongo-blue/5 hover:text-wareongo-blue"
            >
              Micromarkets
            </Link>
            <Link href="/locations?kind=CITY" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-wareongo-slate transition-colors hover:bg-wareongo-blue/5 hover:text-wareongo-blue">
              Cities
            </Link>
            <Link href="/locations?kind=STATE" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-wareongo-slate transition-colors hover:bg-wareongo-blue/5 hover:text-wareongo-blue">
              States
            </Link>
          </nav>

          <span className="ml-auto hidden text-xs text-wareongo-slate sm:inline" title={user.email}>
            {user.name}
          </span>
          <form action="/api/auth/logout" method="post" className="ml-auto sm:ml-0">
            <button className="cms-btn">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
