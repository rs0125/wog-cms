import Link from 'next/link';
import EditorialForm, { type EditorialFormPage } from '@/components/EditorialForm';
import { createLocation } from '../actions';
import { prisma } from '@/lib/prisma';
import { NO_OVERRIDES } from '@/lib/editorial-schema';
import { locationKindSchema, type LocationKind } from '@/lib/location-schema';
import { fetchLocations, findLocation, listFor, locationOverviewPath, KIND_LABEL, KIND_PLURAL, type Location } from '@/lib/locations-api';
import { isDeployConfigured } from '@/lib/deploy';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

/** Only what the schema itself would accept, so a hand-edited URL can't seed junk. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const asSlug = (v: string | undefined) => (v && SLUG.test(v) ? v : '');

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; slug?: string; name?: string }>;
}) {
  const [blogOptions, prefill, inventory] = await Promise.all([
    prisma.blog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { slug: true, title: true },
    }),
    searchParams,
    fetchLocations().catch(() => ({
      cities: [] as Location[],
      states: [] as Location[],
      gates: { locationPageMinListings: 0 },
    })),
  ]);

  const kind: LocationKind = locationKindSchema.safeParse(prefill.kind?.toUpperCase()).data ?? 'CITY';

  /**
   * Seeded from the Write button on the list, which carries the slug of a
   * location the site actually builds.
   *
   * This is the one guard against the feature's silent failure mode: the slug is
   * the join key to a page, and a typo means the content renders nowhere with no
   * error to show for it. Arriving with it already correct removes the chance to
   * get it wrong.
   */
  const slug = asSlug(prefill.slug);
  const name = slug ? (prefill.name ?? '').trim().slice(0, 120) : '';
  const stats = findLocation(listFor(inventory, kind), slug) ?? null;

  const blank: EditorialFormPage = {
    name,
    seoTitle: '',
    metaDescription: '',
    h1: '',
    heroEyebrow: null,
    heroProse: '',
    heroImage: null,
    marketHeading: null,
    marketProse: null,
    marketImage: null,
    rentsHeading: null,
    rentsProse: null,
    specHeading: null,
    specProse: null,
    inventoryHeading: null,
    // The four the template was designed around. Prefilled as questions so the
    // shape is obvious; an unanswered one won't save, and removing them is one
    // click each.
    faqs: Array.from({ length: kind === 'CITY' ? 6 : 4 }, () => ({ q: '', a: '' })),
    relatedBlogs: [],
    statOverrides: NO_OVERRIDES,
    status: 'DRAFT',
  };

  const backHref = `/locations?kind=${kind}`;
  const path = stats ? locationOverviewPath(stats) : null;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <Link href={backHref} className="cms-eyebrow mb-1 block hover:text-wareongo-blue">
        ← {KIND_PLURAL[kind]}
      </Link>
      <h1 className="cms-title text-4xl">{name || `${KIND_LABEL[kind]} page`}</h1>
      <p className="mt-1 mb-6 text-sm text-wareongo-slate">
        {slug
          ? `Writing an overview at ${path ?? (kind === 'CITY' ? `/overview/{state}/${slug}` : `/overview/${slug}`)}.`
          : `The slug has to match a URL the site already builds — start from the ${KIND_PLURAL[kind]} list to have it filled in for you.`}
      </p>
      <EditorialForm
        page={blank}
        identity={
          kind === 'CITY'
            ? { scope: 'city', slug, parentLabel: stats?.parentState ?? null }
            : { scope: 'state', slug }
        }
        backHref={backHref}
        action={createLocation}
        blogOptions={blogOptions}
        deployable={isDeployConfigured()}
        locationInventory={listFor(inventory, kind)}
      />
    </main>
  );
}
