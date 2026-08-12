import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import GuideList, { type GuideRow } from '@/components/GuideList';
import DeployButton from '@/components/DeployButton';
import Toast from '@/components/Toast';
import { stateOf } from '@/lib/staging';
import { isDeployConfigured } from '@/lib/deploy';

// Auth and dynamic rendering both come from app/(authed)/layout.tsx.

export default async function GuidesPage({
  searchParams,
}: {
  searchParams: Promise<{ reordered?: string; reverted?: string; deleted?: string }>;
}) {
  const { reordered, reverted, deleted } = await searchParams;
  const deployable = isDeployConfigured();
  const rows = await prisma.guide.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  // State computed once per row and carried alongside it, so nothing has to
  // look it up again (and no non-null assertion on a Map lookup).
  const withState = rows.map((g) => ({ row: g, state: stateOf(g) }));
  const live = withState.filter((e) => e.state === 'PUBLISHED').length;
  const staged = withState.filter((e) => e.state === 'STAGED').length;

  // Dates are formatted here: a Date can't cross into a client component, and
  // formatting on the client would risk a timezone-dependent hydration mismatch.
  const guides: GuideRow[] = withState.map(({ row: g, state }) => ({
    id: g.id,
    slug: g.slug,
    title: g.title,
    state,
    revertable: g.deployedContent !== null,
    dateModified: g.dateModified.toISOString().slice(0, 10),
    sortOrder: g.sortOrder,
  }));

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="cms-title text-4xl">Guides</h1>
          <p className="mt-1 text-sm text-wareongo-slate">
            {rows.length} total · {live} live{staged > 0 ? ` · ${staged} staged` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Whether the hook exists is all the client needs — never the URL. */}
          <DeployButton configured={deployable} />
          <Link href="/guides/new" className="cms-btn-primary">
            New guide
          </Link>
        </div>
      </header>

      {/* No second line: whether the site still serves the page depends on what
          was last deployed, which this page can't know without reading the
          snapshot column, and a confident wrong sentence is worse than none. */}
      {deleted && <Toast title={`“${deleted}” deleted`} tone="removed" />}

      {reverted && <Toast title="Reverted to the last deployed version" />}

      {/* Stays an inline banner: it holds a Deploy button, and an action that
          fades itself out after six seconds is a trap. */}
      {reordered && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-wareongo-green/30 bg-wareongo-green/5 px-4 py-2.5 text-sm text-wareongo-green">
          <span>Order saved. Deploy to push it live.</span>
          <span className="ml-auto">
            <DeployButton configured={deployable} variant="subtle" />
          </span>
        </div>
      )}

      <GuideList guides={guides} />
    </main>
  );
}
