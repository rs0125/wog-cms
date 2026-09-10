import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import LocationList, { type LocationRow } from '@/components/LocationList';
import DeployButton from '@/components/DeployButton';
import Toast from '@/components/Toast';
import { stateOf } from '@/lib/location-staging';
import { eligible, fetchLocations, listFor, locationOverviewPath, KIND_PLURAL } from '@/lib/locations-api';
import { locationKindSchema, type LocationKind } from '@/lib/location-schema';
import { isDeployConfigured } from '@/lib/deploy';

// Auth and dynamic rendering both come from app/(authed)/layout.tsx.
//
// One screen for both kinds, switched by ?kind= — the two are the same list over
// a different slug namespace, and the dashboard links straight to each.

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; reverted?: string; deleted?: string }>;
}) {
  const { kind: rawKind, reverted, deleted } = await searchParams;
  const kind: LocationKind = locationKindSchema.safeParse(rawKind?.toUpperCase()).data ?? 'CITY';
  const deployable = isDeployConfigured();

  const [rows, inventory] = await Promise.all([
    prisma.locationPage.findMany({ where: { kind } }),
    // The backend can be down independently of this app's own database; empty
    // degrades the screen to "written pages only" rather than to an error page.
    fetchLocations().catch((err) => {
      console.error('[locations] backend unavailable:', err);
      return { cities: [], states: [], gates: { locationPageMinListings: 0 } };
    }),
  ]);

  const all = listFor(inventory, kind);
  const written = new Map(rows.map((r) => [r.slug, r]));
  const worthWriting = eligible(all);

  /** Every location worth a page, with any content matched on. */
  const pages: LocationRow[] = worthWriting.map((l) => {
    const row = written.get(l.slug);
    return {
      id: row?.id ?? null,
      kind,
      slug: l.slug,
      name: l.name,
      path: locationOverviewPath(l),
      group: kind === 'CITY' ? l.parentState : null,
      listings: l.listings,
      state: row ? stateOf(row) : 'STUB',
      revertable: row?.deployedContent != null,
    };
  });

  /**
   * Keep saved pages visible even after their inventory drops below the
   * threshold or the location disappears. They remain editable as drafts.
   */
  const knownSlugs = new Set(worthWriting.map((l) => l.slug));
  const orphans: LocationRow[] = rows
    .filter((r) => !knownSlugs.has(r.slug))
    .map((r) => ({
      id: r.id,
      kind,
      slug: r.slug,
      name: r.name,
      path: null,
      group: null,
      listings: 0,
      state: stateOf(r),
      revertable: r.deployedContent != null,
    }));

  const belowThreshold = all
    .filter((l) => !l.hasPage)
    .map((l) => ({ name: l.name, listings: l.listings }));

  const live = pages.filter((p) => p.state === 'PUBLISHED').length;
  const staged = pages.filter((p) => p.state === 'STAGED').length;
  const done = pages.filter((p) => p.state !== 'STUB').length;
  const other: LocationKind = kind === 'CITY' ? 'STATE' : 'CITY';

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <Link href="/dashboard" className="cms-eyebrow mb-1 block hover:text-wareongo-blue">
            ← Menu
          </Link>
          <h1 className="cms-title text-4xl">{KIND_PLURAL[kind]}</h1>
          <p className="mt-1 text-sm text-wareongo-slate">
            {pages.length > 0
              ? `${done} of ${pages.length} written · ${live} live`
              : `${rows.length} pages`}
            {staged > 0 ? ` · ${staged} staged` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={`/locations?kind=${other}`} className="cms-btn">
            {KIND_PLURAL[other]}
          </Link>
          {/* Whether the hook exists is all the client needs — never the URL. */}
          <DeployButton configured={deployable} />
          <Link href={`/locations/new?kind=${kind}`} className="cms-btn-primary">
            New page
          </Link>
        </div>
      </header>

      <p className="mb-7 rounded-2xl border border-wareongo-blue/20 bg-white p-4 text-sm text-wareongo-slate">
        Publish a {kind === 'CITY' ? 'city overview at /overview/{state}/{city}' : 'state overview at /overview/{state}'}
        {' '}using the shared wireframe: prose, images, FAQs and live inventory statistics.
        The existing listing pages keep their warehouse grids. Deleting or delisting content
        removes its overview on the next build.
      </p>

      {deleted && <Toast title={`“${deleted}” deleted`} tone="removed" />}
      {reverted && <Toast title="Reverted to the last deployed version" />}

      <LocationList kind={kind} pages={pages} orphans={orphans} belowThreshold={belowThreshold} />
    </main>
  );
}
