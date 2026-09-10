import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { stateOf as blogStateOf } from '@/lib/staging';
import { stateOf as micromarketStateOf } from '@/lib/micromarket-staging';
import { stateOf as locationStateOf } from '@/lib/location-staging';
import { buildablePages, fetchMicromarkets } from '@/lib/micromarkets-api';
import { eligible, fetchLocations, type Location } from '@/lib/locations-api';

// Auth and dynamic rendering both come from app/(authed)/layout.tsx.

/**
 * The signed-in landing page.
 *
 * One card per kind of content, and a count on each, because the useful thing to
 * know on arrival is how much is live and how much is waiting — not a list. The
 * location figures count every place the site would carry an editorial page, not
 * the rows this app happens to hold, so "3 of 41 written" is visible from the
 * front door.
 */
export default async function DashboardPage() {
  const [blogs, pages, locationRows, inventory, locations] = await Promise.all([
    prisma.blog.findMany(),
    prisma.micromarketPage.findMany(),
    prisma.locationPage.findMany(),
    // Never fatal: the dashboard is still worth showing if the backend is down.
    fetchMicromarkets()
      .then((r) => r.data)
      .catch(() => []),
    fetchLocations().catch(() => ({
      cities: [] as Location[],
      states: [] as Location[],
      gates: { locationPageMinListings: 0 },
    })),
  ]);

  const blogLive = blogs.filter((b) => blogStateOf(b) === 'PUBLISHED').length;
  const blogStaged = blogs.filter((b) => blogStateOf(b) === 'STAGED').length;

  const withPage = buildablePages(inventory);
  const written = new Set(pages.map((p) => `${p.citySlug}/${p.slug}`));
  const mmLive = pages.filter((m) => micromarketStateOf(m) === 'PUBLISHED').length;
  const mmStaged = pages.filter((m) => micromarketStateOf(m) === 'STAGED').length;
  const mmWritten = withPage.filter((m) => written.has(`${m.citySlug}/${m.slug}`)).length;

  /** Both kinds share one table, so each card counts its own slice of it. */
  const locationCard = (kind: 'CITY' | 'STATE') => {
    const rows = locationRows.filter((r) => r.kind === kind);
    const all = eligible(kind === 'CITY' ? locations.cities : locations.states);
    const slugs = new Set(rows.map((r) => r.slug));
    return {
      total: all.length,
      written: all.filter((l) => slugs.has(l.slug)).length,
      live: rows.filter((r) => locationStateOf(r) === 'PUBLISHED').length,
      staged: rows.filter((r) => locationStateOf(r) === 'STAGED').length,
      rows: rows.length,
    };
  };
  const cityStats = locationCard('CITY');
  const stateStats = locationCard('STATE');

  const cards = [
    {
      href: '/blogs',
      title: 'Blogs',
      lead: `${blogs.length} ${blogs.length === 1 ? 'blog' : 'blogs'}`,
      detail: `${blogLive} live${blogStaged > 0 ? ` · ${blogStaged} staged` : ''}`,
      body: 'Long-form pages at /blogs. Unlinked from the nav, but in the sitemap so search engines and AI assistants can find them.',
    },
    {
      href: '/micromarkets',
      title: 'Micromarket pages',
      lead:
        withPage.length > 0
          ? `${mmWritten} of ${withPage.length} written`
          : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`,
      detail: `${mmLive} live${mmStaged > 0 ? ` · ${mmStaged} staged` : ''}`,
      body: 'Market overviews at /overview/{state}/{city}/{micromarket}. Existing warehouse listing pages keep their plain grids.',
    },
    {
      href: '/locations?kind=CITY',
      title: 'City pages',
      lead:
        cityStats.total > 0
          ? `${cityStats.written} of ${cityStats.total} written`
          : `${cityStats.rows} ${cityStats.rows === 1 ? 'page' : 'pages'}`,
      detail: `${cityStats.live} live${cityStats.staged > 0 ? ` · ${cityStats.staged} staged` : ''}`,
      body: 'City overviews at /overview/{state}/{city}, using the shared editorial wireframe.',
    },
    {
      href: '/locations?kind=STATE',
      title: 'State pages',
      lead:
        stateStats.total > 0
          ? `${stateStats.written} of ${stateStats.total} written`
          : `${stateStats.rows} ${stateStats.rows === 1 ? 'page' : 'pages'}`,
      detail: `${stateStats.live} live${stateStats.staged > 0 ? ` · ${stateStats.staged} staged` : ''}`,
      body: 'State overviews at /overview/{state}, using the shared editorial wireframe.',
    },
  ];

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <h1 className="cms-title text-4xl">Content Studio</h1>
      <p className="mt-1 mb-8 text-sm text-wareongo-slate">
        Everything here is saved to the database first and reaches wareongo.com on the next deploy.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-3xl border border-wareongo-blue/20 bg-white p-6 transition-colors hover:border-wareongo-blue/50 hover:bg-wareongo-blue/[0.03]"
          >
            <h2 className="cms-title text-xl">{c.title}</h2>
            <p className="mt-3 text-2xl font-bold tabular-nums text-wareongo-blue">{c.lead}</p>
            <p className="mt-0.5 text-xs text-wareongo-slate">{c.detail}</p>
            <p className="mt-4 text-sm leading-relaxed text-wareongo-slate">{c.body}</p>
            <span className="mt-4 inline-block text-sm font-semibold text-wareongo-blue">
              Open <span className="transition-transform group-hover:translate-x-0.5 inline-block">→</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
