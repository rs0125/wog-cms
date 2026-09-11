import Link from 'next/link';
import DeployButton from '@/components/DeployButton';
import { isDeployConfigured } from '@/lib/deploy';
import { NAVIGATION_GROUPS } from '@/lib/navigation';
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
 * Categories and destinations share the sidebar configuration. The cards add
 * saved/published counts so editors can choose a section with useful context.
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

  const cards: Record<string, { lead: string; detail: string; description: string }> = {
    blogs: {
      lead: `${blogs.length} ${blogs.length === 1 ? 'article' : 'articles'}`,
      detail: `${blogLive} published${blogStaged > 0 ? ` · ${blogStaged} staged` : ''}`,
      description: 'Write and manage articles, guides and warehouse insights.',
    },
    states: {
      lead: stateStats.total > 0 ? `${stateStats.written} of ${stateStats.total} written` : `${stateStats.rows} ${stateStats.rows === 1 ? 'page' : 'pages'}`,
      detail: `${stateStats.live} published${stateStats.staged > 0 ? ` · ${stateStats.staged} staged` : ''}`,
      description: 'Regional market context and state-wide warehouse overviews.',
    },
    cities: {
      lead: cityStats.total > 0 ? `${cityStats.written} of ${cityStats.total} written` : `${cityStats.rows} ${cityStats.rows === 1 ? 'page' : 'pages'}`,
      detail: `${cityStats.live} published${cityStats.staged > 0 ? ` · ${cityStats.staged} staged` : ''}`,
      description: 'City market guides, rental trends and local warehouse insights.',
    },
    micromarkets: {
      lead: withPage.length > 0 ? `${mmWritten} of ${withPage.length} written` : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`,
      detail: `${mmLive} published${mmStaged > 0 ? ` · ${mmStaged} staged` : ''}`,
      description: 'Detailed guides to individual warehouse and logistics clusters.',
    },
    legal: {
      lead: '2 pages',
      detail: 'Privacy Policy & Terms of Service',
      description: 'Manage policy wording, dates and legal information.',
    },
  };
  const descriptions: Record<string, string> = {
    content: 'Articles and resources for your readers.',
    overviews: 'Market guides, organized from states to individual clusters.',
    website: 'The information pages that support your website.',
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:p-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="cms-eyebrow mb-3">Your workspace</p>
          <h1 className="cms-title text-3xl sm:text-4xl">Content menu</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-wareongo-slate">
            Choose a category to create, edit or publish your website content.
          </p>
        </div>
        <DeployButton configured={isDeployConfigured()} label="Deploy website" />
      </header>

      <div className="space-y-10">
        {NAVIGATION_GROUPS.map(group => (
          <section key={group.id} id={group.id} aria-labelledby={`category-${group.id}`}>
            <div className="mb-4">
              <h2 id={`category-${group.id}`} className="cms-title text-lg">{group.label}</h2>
              <p className="mt-1 text-xs leading-relaxed text-wareongo-slate">{descriptions[group.id]}</p>
            </div>
            <div className={`grid gap-4 ${group.items.length > 1 ? 'xl:grid-cols-3' : ''}`}>
              {group.items.map(item => {
                const card = cards[item.id];
                return <article key={item.id} className="group overflow-hidden rounded-2xl border border-wareongo-blue/15 bg-white transition-colors hover:border-wareongo-blue/35">
                  <Link href={item.href} className={`block rounded-2xl p-5 outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-wareongo-blue sm:p-6 ${group.items.length === 1 ? 'sm:flex sm:items-center sm:justify-between sm:gap-8' : ''}`}>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="cms-title text-xl">{item.label}</h3>
                        <span aria-hidden="true" className="text-wareongo-slate transition-transform group-hover:translate-x-1">→</span>
                      </div>
                      <p className="mt-2 max-w-lg text-sm leading-relaxed text-wareongo-slate">{card.description}</p>
                    </div>
                    <div className={`mt-5 ${group.items.length === 1 ? 'sm:mt-0 sm:shrink-0 sm:text-right' : 'border-t border-wareongo-blue/10 pt-4'}`}>
                      <p className="text-lg font-semibold tabular-nums text-wareongo-blue">{card.lead}</p>
                      <p className="mt-1 text-xs text-wareongo-slate">{card.detail}</p>
                    </div>
                  </Link>
                  {item.children && <ul className="grid border-t border-wareongo-blue/10 bg-wareongo-ivory/40 sm:grid-cols-2">
                    {item.children.map(child => <li key={child.id} className="border-wareongo-blue/10 last:border-t sm:last:border-l sm:last:border-t-0">
                      <Link href={child.href} className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-wareongo-blue hover:bg-wareongo-blue/5 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-wareongo-blue sm:px-6">
                        {child.label}<span aria-hidden="true">→</span>
                      </Link>
                    </li>)}
                  </ul>}
                </article>;
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
