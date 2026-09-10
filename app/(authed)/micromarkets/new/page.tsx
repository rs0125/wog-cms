import Link from 'next/link';
import EditorialForm from '@/components/EditorialForm';
import { createMicromarket } from '../actions';
import { prisma } from '@/lib/prisma';
import { NO_OVERRIDES, type MicromarketInput } from '@/lib/micromarket-schema';
import { fetchMicromarkets, findMicromarket, micromarketOverviewPath } from '@/lib/micromarkets-api';
import { isDeployConfigured } from '@/lib/deploy';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

/** Only what the schema itself would accept, so a hand-edited URL can't seed junk. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const asSlug = (v: string | undefined) => (v && SLUG.test(v) ? v : '');

export default async function NewMicromarketPage({
  searchParams,
}: {
  searchParams: Promise<{ citySlug?: string; slug?: string; name?: string }>;
}) {
  const [blogOptions, prefill, inventory] = await Promise.all([
    prisma.blog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { slug: true, title: true },
    }),
    searchParams,
    fetchMicromarkets()
      .then((r) => r.data)
      .catch(() => []),
  ]);

  /**
   * Seeded from the Write button on the list, which carries the slugs of a
   * micromarket the site actually builds.
   *
   * This is the one guard against the feature's silent failure mode: the
   * (citySlug, slug) pair is the join key to a page, and a typo in either means
   * the content renders nowhere with no error to show for it. Arriving with the
   * pair already correct removes the chance to get it wrong.
   */
  const citySlug = asSlug(prefill.citySlug);
  const slug = asSlug(prefill.slug);
  const name = slug ? (prefill.name ?? '').trim().slice(0, 120) : '';
  const path = micromarketOverviewPath(findMicromarket(inventory, citySlug, slug));

  const blank: MicromarketInput = {
    citySlug,
    slug,
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
    faqs: [
      { q: '', a: '' },
      { q: '', a: '' },
      { q: '', a: '' },
      { q: '', a: '' },
    ],
    relatedBlogs: [],
    statOverrides: NO_OVERRIDES,
    status: 'DRAFT',
  };

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <Link href="/micromarkets" className="cms-eyebrow mb-1 block hover:text-wareongo-blue">
        ← Micromarkets
      </Link>
      <h1 className="cms-title text-4xl">{name || 'Micromarket page'}</h1>
      <p className="mt-1 mb-6 text-sm text-wareongo-slate">
        {path
          ? `Writing the overview at ${path}.`
          : 'Start from the Micromarkets list to fill the city and micromarket slugs. State comes from the location data.'}
      </p>
      <EditorialForm
        page={blank}
        identity={{
          scope: 'micromarket',
          citySlug,
          slug,
          parentLabel: null,
        }}
        backHref="/micromarkets"
        action={createMicromarket}
        blogOptions={blogOptions}
        deployable={isDeployConfigured()}
        inventory={inventory}
      />
    </main>
  );
}
