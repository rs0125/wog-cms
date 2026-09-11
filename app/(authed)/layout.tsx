import CmsNavigation from '@/components/CmsNavigation';
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
      <CmsNavigation user={{ name: user.name, email: user.email }} />
      <div id="cms-content" tabIndex={-1} className="min-w-0 outline-none lg:ml-64">
        {children}
      </div>
    </div>
  );
}
