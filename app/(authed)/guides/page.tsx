import Link from 'next/link';
import { prisma } from '@/lib/prisma';

// Auth and dynamic rendering both come from app/(authed)/layout.tsx.

export default async function GuidesPage() {
  const guides = await prisma.guide.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const published = guides.filter((g) => g.status === 'PUBLISHED').length;
  // sortOrder isn't unique in the schema (a unique constraint would make
  // reordering a two-step dance), so ties are possible. Ordering still resolves
  // deterministically by id, but the editor should see it rather than wonder why
  // two guides won't swap.
  const tied = new Set(
    guides.map((g) => g.sortOrder).filter((n, i, all) => all.indexOf(n) !== i),
  );

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <span className="cms-eyebrow mb-2 block">WareOnGo Content Studio</span>
          <h1 className="font-display text-4xl text-wareongo-blue">Guides</h1>
          <p className="mt-1 text-sm text-wareongo-slate">
            {guides.length} total · {published} published on the site
          </p>
        </div>
        <Link href="/guides/new" className="cms-btn-primary ml-auto">
          New guide
        </Link>
      </header>

      <ul className="space-y-2.5">
        {guides.map((g) => (
          <li key={g.id}>
            <Link
              href={`/guides/${g.id}`}
              className="flex items-center gap-4 rounded-2xl border border-wareongo-blue/20 bg-white p-4 transition-colors hover:bg-wareongo-blue/5"
            >
              <span
                className={`w-6 shrink-0 text-xs ${
                  tied.has(g.sortOrder) ? 'font-semibold text-wareongo-sienna' : 'text-wareongo-slate'
                }`}
                title={tied.has(g.sortOrder) ? `Shares sort order ${g.sortOrder} with another guide` : undefined}
              >
                {g.sortOrder}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-wareongo-blue">{g.title}</p>
                <p className="truncate text-xs text-wareongo-slate">
                  /guides/{g.slug} · updated {g.dateModified.toISOString().slice(0, 10)}
                </p>
              </div>
              <span
                className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  g.status === 'PUBLISHED'
                    ? 'bg-wareongo-green/10 text-wareongo-green'
                    : 'bg-wareongo-slate/10 text-wareongo-slate'
                }`}
              >
                {g.status === 'PUBLISHED' ? 'Published' : 'Draft'}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {tied.size > 0 && (
        <p className="mt-4 rounded-2xl border border-wareongo-sienna/30 bg-wareongo-sienna/5 p-4 text-xs text-wareongo-sienna">
          Two or more guides share a sort order (highlighted). Order falls back to creation order, so give them
          distinct numbers if the sequence matters.
        </p>
      )}

      <p className="mt-8 rounded-2xl border border-wareongo-blue/20 bg-wareongo-blue/5 p-4 text-xs text-wareongo-slate">
        Published guides reach wareongo.com on the next site build — the build reads them via the backend&apos;s
        <code className="mx-1 rounded bg-white px-1 text-wareongo-blue">/guides</code> endpoint. Saving here does not
        deploy.
      </p>
    </main>
  );
}
