import { notFound } from 'next/navigation';
import EditorialForm, { type EditorialFormPage } from '@/components/EditorialForm';
import DeleteForm from '@/components/DeleteForm';
import ListingToggle from '@/components/ListingToggle';
import Toast from '@/components/Toast';
import DeployButton from '@/components/DeployButton';
import { updateLocation, deleteLocation, toggleLocationListing } from '../actions';
import { prisma } from '@/lib/prisma';
import { locationSchema } from '@/lib/location-schema';
import { stateOf } from '@/lib/location-staging';
import { fetchLocations, findLocation, listFor, locationOverviewPath, KIND_LABEL, KIND_PLURAL, type Location } from '@/lib/locations-api';
import { isDeployConfigured } from '@/lib/deploy';
import Link from 'next/link';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

export default async function EditLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  // Issued together: these don't depend on each other, and each sequential
  // round trip to the database costs real latency.
  const [row, blogOptions, inventory] = await Promise.all([
    prisma.locationPage.findUnique({ where: { id: Number(id) } }),
    prisma.blog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { slug: true, title: true },
    }),
    // Derived figures for the preview and the overrides reference; never fatal.
    fetchLocations().catch(() => ({
      cities: [] as Location[],
      states: [] as Location[],
      gates: { locationPageMinListings: 0 },
    })),
  ]);
  if (!row) notFound();

  // Parsed rather than cast: faqs and the two images are Json columns, so this
  // is the point where bad data written by anything other than this form would
  // surface — better here than as a blank section on the live page.
  const parsed = locationSchema.safeParse(row);

  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-2 text-2xl font-semibold">{row.name}</h1>
        <p className="mb-4 text-sm text-red-600">
          This page&apos;s stored content doesn&apos;t match the expected shape, so the editor
          can&apos;t open it safely.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-neutral-100 p-4 text-xs">
          {parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}
        </pre>
      </main>
    );
  }

  const page = parsed.data;
  const kind = page.kind;
  const backHref = `/locations?kind=${kind}`;
  // Null when the slug matches nothing the site builds — which the list screen
  // flags separately, and which the editor shows as "not recorded" rather than
  // pretending to a number.
  const stats = findLocation(listFor(inventory, kind), page.slug) ?? null;

  const path = stats ? locationOverviewPath(stats) : null;
  const formPage: EditorialFormPage = page;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <Link href={backHref} className="cms-eyebrow mb-2 block hover:text-wareongo-blue">
            ← {KIND_PLURAL[kind]}
          </Link>
          <span className="cms-eyebrow mb-2 block">Editing {KIND_LABEL[kind].toLowerCase()} page</span>
          <h1 className="cms-title text-3xl leading-tight sm:text-4xl">{page.name}</h1>
          {path && <a
            href={`https://wareongo.com${path}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-wareongo-slate transition-colors hover:text-wareongo-blue"
          >
            wareongo.com{path} ↗
          </a>}
        </div>
        <div className="ml-auto flex flex-wrap items-start justify-end gap-2">
          {/* Reads the row, not the parsed copy: this is about what the database
              currently says, which is also what the action flips. */}
          <ListingToggle
            id={row.id}
            listed={row.status === 'PUBLISHED'}
            action={toggleLocationListing}
            listedHint="Remove this overview on the next deploy; its listing page stays available"
            delistedHint="Publish this overview from the next deploy"
          />
          <DeleteForm
            id={row.id}
            slug={page.slug}
            action={deleteLocation}
            consequence="The next build removes this overview. Its warehouse listing page stays available."
          />
        </div>
      </div>

      {saved && (
        <Toast
          title="Draft saved"
          detail="It's in the CMS, not on the site yet — wareongo.com keeps serving the old version until you deploy."
          dismissLabel="Do it later"
        >
          <DeployButton configured={isDeployConfigured()} label="Deploy now" confirm={false} />
        </Toast>
      )}

      <EditorialForm
        page={formPage}
        identity={
          kind === 'CITY'
            ? { scope: 'city', slug: page.slug, parentLabel: stats?.parentState ?? null }
            : { scope: 'state', slug: page.slug }
        }
        backHref={backHref}
        action={updateLocation}
        id={row.id}
        blogOptions={blogOptions}
        staged={stateOf(row) === 'STAGED'}
        deployable={isDeployConfigured()}
        expectedUpdatedAt={row.updatedAt.toISOString()}
        locationInventory={listFor(inventory, kind)}
      />
    </main>
  );
}
