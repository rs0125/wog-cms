import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import MicromarketList, { type MicromarketRow } from '@/components/MicromarketList';
import DeployButton from '@/components/DeployButton';
import Toast from '@/components/Toast';
import { stateOf } from '@/lib/micromarket-staging';
import { buildablePages, fetchMicromarkets } from '@/lib/micromarkets-api';
import { isDeployConfigured } from '@/lib/deploy';

// Auth and dynamic rendering both come from app/(authed)/layout.tsx.

export default async function MicromarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ reverted?: string; deleted?: string }>;
}) {
  const { reverted, deleted } = await searchParams;
  const deployable = isDeployConfigured();

  const [rows, inventory] = await Promise.all([
    prisma.micromarketPage.findMany(),
    // The backend can be down independently of this app's own database; an
    // empty list degrades the screen to "written pages only" rather than to an
    // error page.
    fetchMicromarkets()
      .then((r) => r.data)
      .catch((err) => {
        console.error('[micromarkets] backend unavailable:', err);
        return [];
      }),
  ]);

  const written = new Map(rows.map((r) => [`${r.citySlug}/${r.slug}`, r]));
  const buildable = buildablePages(inventory);

  /** Every micromarket the site builds a page for, with any content matched on. */
  const pages: MicromarketRow[] = buildable.map((m) => {
    const row = written.get(`${m.citySlug}/${m.slug}`);
    return {
      id: row?.id ?? null,
      citySlug: m.citySlug as string,
      slug: m.slug,
      name: m.name,
      city: m.parentCity as string,
      listings: m.listings,
      state: row ? stateOf(row) : 'STUB',
      revertable: row?.deployedContent != null,
    };
  });

  /**
   * Content whose slug pair matches nothing the site builds. Surfaced rather
   * than hidden: this is the one failure mode of the whole feature that produces
   * no error anywhere — the URL simply keeps serving the plain grid.
   */
  const buildableKeys = new Set(buildable.map((m) => `${m.citySlug}/${m.slug}`));
  const orphans: MicromarketRow[] = rows
    .filter((r) => !buildableKeys.has(`${r.citySlug}/${r.slug}`))
    .map((r) => ({
      id: r.id,
      citySlug: r.citySlug,
      slug: r.slug,
      name: r.name,
      city: r.citySlug,
      listings: 0,
      state: stateOf(r),
      revertable: r.deployedContent != null,
    }));

  const belowThreshold = inventory
    .filter((m) => !m.hasPage)
    .map((m) => ({ name: m.name, city: m.parentCity, listings: m.listings }));

  const live = pages.filter((p) => p.state === 'PUBLISHED').length;
  const staged = pages.filter((p) => p.state === 'STAGED').length;
  const done = pages.filter((p) => p.state !== 'STUB').length;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <Link href="/dashboard" className="cms-eyebrow mb-1 block hover:text-wareongo-blue">
            ← Menu
          </Link>
          <h1 className="cms-title text-4xl">Micromarkets</h1>
          <p className="mt-1 text-sm text-wareongo-slate">
            {pages.length > 0
              ? `${done} of ${pages.length} written · ${live} live`
              : `${rows.length} pages`}
            {staged > 0 ? ` · ${staged} staged` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Whether the hook exists is all the client needs — never the URL. */}
          <DeployButton configured={deployable} />
          <Link href="/micromarkets/new" className="cms-btn-primary">
            New page
          </Link>
        </div>
      </header>

      <p className="mb-7 rounded-2xl border border-wareongo-blue/20 bg-white p-4 text-sm text-wareongo-slate">
        Every micromarket below already has a working URL showing a plain listing grid of its
        warehouses. Writing one replaces that grid with the editorial layout — prose, FAQs and
        cross-links wrapped around the same listings. <strong>No content</strong> is not a fault; it
        is the plain grid. Deleting or delisting a page hands the URL back to it, so nothing 404s.
      </p>

      {deleted && <Toast title={`“${deleted}” deleted`} tone="removed" />}
      {reverted && <Toast title="Reverted to the last deployed version" />}

      <MicromarketList pages={pages} orphans={orphans} belowThreshold={belowThreshold} />
    </main>
  );
}
