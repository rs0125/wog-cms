import { notFound } from 'next/navigation';
import MicromarketForm from '@/components/MicromarketForm';
import DeleteForm from '@/components/DeleteForm';
import ListingToggle from '@/components/ListingToggle';
import Toast from '@/components/Toast';
import DeployButton from '@/components/DeployButton';
import { updateMicromarket, deleteMicromarket, toggleMicromarketListing } from '../actions';
import { prisma } from '@/lib/prisma';
import { micromarketSchema, type MicromarketInput } from '@/lib/micromarket-schema';
import { stateOf } from '@/lib/micromarket-staging';
import { fetchMicromarkets, findMicromarket, micromarketOverviewPath } from '@/lib/micromarkets-api';
import { isDeployConfigured } from '@/lib/deploy';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

export default async function EditMicromarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  // Issued together: these don't depend on each other, and each sequential round
  // trip to the database costs real latency.
  const [row, blogOptions, inventory] = await Promise.all([
    prisma.micromarketPage.findUnique({ where: { id: Number(id) } }),
    prisma.blog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { slug: true, title: true },
    }),
    // Derived figures for the preview and the overrides reference; never fatal.
    fetchMicromarkets()
      .then((r) => r.data)
      .catch(() => []),
  ]);
  if (!row) notFound();

  // Parsed rather than cast: faqs and the two images are Json columns, so this
  // is the point where bad data written by anything other than this form would
  // surface — better here than as a blank section on the live page.
  const parsed = micromarketSchema.safeParse(row);

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

  const page: MicromarketInput = parsed.data;
  // Avoid linking to a fabricated state when the inventory cannot locate this page.
  const market = findMicromarket(inventory, page.citySlug, page.slug);
  const path = micromarketOverviewPath(market);

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <span className="cms-eyebrow mb-2 block">Editing micromarket page</span>
          <h1 className="cms-title text-3xl leading-tight sm:text-4xl">{page.name}</h1>
          {path ? (
            <a
              href={`https://wareongo.com${path}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block break-all text-sm text-wareongo-slate transition-colors hover:text-wareongo-blue"
            >
              wareongo.com{path} ↗
            </a>
          ) : (
            <p className="mt-1 text-sm text-wareongo-sienna">
              {market && !market.hasPage
                ? 'This micromarket does not have enough listings to publish an overview yet.'
                : 'The overview URL needs a matching micromarket with a known state.'}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-start justify-end gap-2">
          {/* Reads the row, not the parsed copy: this is about what the database
              currently says, which is also what the action flips. */}
          <ListingToggle
            id={row.id}
            listed={row.status === 'PUBLISHED'}
            action={toggleMicromarketListing}
            listedHint="Remove this overview page on the next deploy"
            delistedHint="Publish this overview page on the next deploy"
          />
          <DeleteForm
            id={row.id}
            slug={page.slug}
            action={deleteMicromarket}
            consequence="The overview page is removed on the next deploy. The warehouse listing page stays available."
          />
        </div>
      </div>

      {saved && (
        <Toast
          title="Draft saved"
          detail="It's in the CMS, not on the site yet — wareongo.com keeps serving the old version until you deploy."
          dismissLabel="Do it later"
        >
          {/* No second confirmation behind this one: the card is already asking
              the question, with the alternative sitting right next to it. */}
          <DeployButton configured={isDeployConfigured()} label="Deploy now" confirm={false} />
        </Toast>
      )}

      <MicromarketForm
        page={page}
        action={updateMicromarket}
        id={row.id}
        blogOptions={blogOptions}
        staged={stateOf(row) === 'STAGED'}
        deployable={isDeployConfigured()}
        expectedUpdatedAt={row.updatedAt.toISOString()}
        inventory={inventory}
      />
    </main>
  );
}
