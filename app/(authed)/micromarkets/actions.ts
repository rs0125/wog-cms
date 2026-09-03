'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { micromarketSchema, pruneOverrides } from '@/lib/micromarket-schema';
import { requireUser } from '@/lib/auth';
import type { DeployedContent } from '@/lib/micromarket-staging';
import type { SaveResult, ListingResult } from '@/lib/action-results';

// Re-exported so importers of this section's actions get the shapes from one
// place, the way blogs/actions.ts does.
export type { SaveResult, ListingResult } from '@/lib/action-results';

/**
 * An error whose message is written for the editor to read. Anything else is
 * treated as internal and replaced with a generic message, so raw Prisma text
 * (column names, constraint names) never reaches the browser.
 */
class EditorError extends Error {}

// No revalidatePath anywhere in here: every page in this group is
// force-dynamic, so there is no cached output to invalidate. `refresh()` in
// toggleMicromarketListing is a different thing — it re-renders the open page's
// server components, which is about getting fresh props into a form that's still
// on screen, not about cache.

/** '' in the form, null in the database — see optionalProse in the schema. */
const orNull = (formData: FormData, key: string) => {
  const v = String(formData.get(key) ?? '').trim();
  return v === '' ? null : v;
};

// faqs / relatedBlogs / the two images post as JSON strings because they're
// nested structures; everything else arrives as plain fields.
function parseForm(formData: FormData) {
  const json = (key: string) => {
    const raw = String(formData.get(key) ?? '');
    if (raw === '') return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new EditorError(`${key} is not valid JSON`);
    }
  };

  return micromarketSchema.parse({
    citySlug: String(formData.get('citySlug') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    name: String(formData.get('name') ?? ''),
    seoTitle: String(formData.get('seoTitle') ?? ''),
    metaDescription: String(formData.get('metaDescription') ?? ''),
    h1: String(formData.get('h1') ?? ''),
    heroEyebrow: orNull(formData, 'heroEyebrow'),
    heroProse: String(formData.get('heroProse') ?? ''),
    heroImage: json('heroImage'),
    marketHeading: orNull(formData, 'marketHeading'),
    marketProse: orNull(formData, 'marketProse'),
    marketImage: json('marketImage'),
    rentsHeading: orNull(formData, 'rentsHeading'),
    rentsProse: orNull(formData, 'rentsProse'),
    specHeading: orNull(formData, 'specHeading'),
    specProse: orNull(formData, 'specProse'),
    inventoryHeading: orNull(formData, 'inventoryHeading'),
    faqs: json('faqs') ?? [],
    relatedBlogs: json('relatedBlogs') ?? [],
    statOverrides: json('statOverrides'),
    status: String(formData.get('status') ?? 'DRAFT'),
  });
}

const toRow = (m: ReturnType<typeof parseForm>) => ({
  ...m,
  // Prisma's Json columns won't take `null` as a value — that's reserved for
  // JsonNull/DbNull — so an absent image is written as SQL NULL explicitly.
  heroImage: m.heroImage ?? Prisma.DbNull,
  marketImage: m.marketImage ?? Prisma.DbNull,
  faqs: m.faqs as Prisma.InputJsonValue,
  // Only the keys actually set, and SQL NULL when none are: Prisma rejects a
  // nested null in a Json write, and a stored object full of nulls would reach
  // the generated website module for every page that overrides nothing.
  statOverrides: (pruneOverrides(m.statOverrides) ?? Prisma.DbNull) as Prisma.InputJsonValue,
});

/**
 * `relatedBlogs` holds blog slugs. The public renderer looks each one up and
 * silently drops the ones it can't resolve, so a typo becomes an invisibly
 * missing cross-link rather than a visible error. Checking here is the only
 * place the editor finds out.
 */
async function assertBlogsExist(slugs: string[]) {
  if (slugs.length === 0) return;
  const found = await prisma.blog.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true },
  });
  const missing = slugs.filter((s) => !found.some((f) => f.slug === s));
  if (missing.length > 0) {
    throw new EditorError(`related blogs: no blog with slug ${missing.map((s) => `"${s}"`).join(', ')}`);
  }
}

function messageFor(err: unknown) {
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`).join('; ');
  }
  // The (citySlug, slug) unique constraint, surfaced in the terms the editor typed.
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
    return 'That city and micromarket slug pair already has a page.';
  }
  if (err instanceof EditorError) return err.message;
  console.error('[micromarkets] unexpected error:', err);
  return 'Something went wrong saving this page. The details are in the server logs.';
}

export async function createMicromarket(
  _prev: SaveResult | undefined,
  formData: FormData,
): Promise<SaveResult> {
  await requireUser();
  let id: number;
  try {
    const page = parseForm(formData);
    await assertBlogsExist(page.relatedBlogs);
    id = (await prisma.micromarketPage.create({ data: toRow(page) })).id;
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  // Outside the try: redirect() signals by throwing, so catching it here would
  // swallow the navigation and report it as a save failure.
  redirect(`/micromarkets/${id}?saved=1`);
}

export async function updateMicromarket(
  _prev: SaveResult | undefined,
  formData: FormData,
): Promise<SaveResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  try {
    const page = parseForm(formData);
    await assertBlogsExist(page.relatedBlogs);

    // Optimistic concurrency, folded into the write itself: `updatedAt` is part
    // of the WHERE, so the update only lands if the row is still the version
    // this form was rendered from. Doing it as a separate read first would cost
    // an extra round trip *and* leave a window for another save to slip in
    // between the check and the write.
    const expected = String(formData.get('expectedUpdatedAt') ?? '');
    if (expected) {
      const { count } = await prisma.micromarketPage.updateMany({
        where: { id, updatedAt: new Date(expected) },
        data: toRow(page),
      });
      if (count === 0) {
        // Only now pay for a second query, to say which of the two happened.
        const stillThere = await prisma.micromarketPage.findUnique({
          where: { id },
          select: { id: true },
        });
        throw new EditorError(
          stillThere
            ? 'This page was changed somewhere else after you opened it. Reload to see the current version — saving now would overwrite that change.'
            : 'That page no longer exists.',
        );
      }
    } else {
      await prisma.micromarketPage.update({ where: { id }, data: toRow(page) });
    }
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  redirect(`/micromarkets/${id}?saved=1`);
}

/**
 * Deleting is irreversible and there's no version history, so the form that
 * calls this asks for the slug to be typed back. Both checks live here rather
 * than in the browser, so a stray double-submit can't get through either.
 *
 * Nothing 404s as a result: the URL goes back to serving the plain listing grid
 * on the next deploy, which is what it served before this row existed.
 */
export async function deleteMicromarket(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));
  // Held outside the try so the redirect below — which has to sit outside it,
  // since redirect() signals by throwing — can still name what was deleted.
  let slug: string;

  try {
    const page = await prisma.micromarketPage.findUnique({ where: { id }, select: { slug: true } });
    if (!page) return 'That page no longer exists.';
    slug = page.slug;

    if (String(formData.get('confirmSlug') ?? '').trim() !== page.slug) {
      return `Type "${page.slug}" exactly to confirm deletion.`;
    }

    await prisma.micromarketPage.delete({ where: { id } });
  } catch (err) {
    return messageFor(err);
  }
  redirect(`/micromarkets?deleted=${encodeURIComponent(slug)}`);
}

/**
 * Delist / list in one click — flips the page between PUBLISHED and DRAFT.
 *
 * Delisting destroys nothing and takes no URL down: it drops the row out of the
 * backend's PUBLISHED query, so the next build stops emitting the editorial
 * layout and the same URL goes back to the plain listing grid. Until that build
 * runs the editorial page is still live, which is exactly why the page reads as
 * Staged immediately afterwards.
 *
 * The new status is computed from the row as it stands, not taken from the
 * client, so a button rendered against a status that has since changed elsewhere
 * can't publish something the editor meant to pull.
 *
 * refresh() rather than redirect(): the editor may well be open with unsaved
 * text in it. A refresh re-renders this page's server components in place —
 * client state is preserved, so the typing survives, while the props derived
 * from the row (status, the Staged badge, the lost-update stamp the form saves
 * against) all come back current. A redirect would discard that work silently.
 */
export async function toggleMicromarketListing(
  _prev: ListingResult | undefined,
  formData: FormData,
): Promise<ListingResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  let listed: boolean;

  try {
    const page = await prisma.micromarketPage.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!page) return { ok: false, error: 'That page no longer exists.' };
    listed = page.status !== 'PUBLISHED';
    await prisma.micromarketPage.update({
      where: { id },
      data: { status: listed ? 'PUBLISHED' : 'DRAFT' },
    });
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }

  refresh();
  // `at` exists to make each result distinct. The confirmation card keys off it,
  // and without it a second toggle back to a state already reported would
  // reconcile onto the dismissed card and never show.
  return { ok: true, listed, at: Date.now() };
}

/**
 * Discards staged edits by writing the last deployed snapshot back over the live
 * row. Only meaningful for a page that has been deployed at least once — with no
 * snapshot there is nothing to go back to.
 */
export async function revertMicromarket(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));

  try {
    const page = await prisma.micromarketPage.findUnique({ where: { id } });
    if (!page) return 'That page no longer exists.';
    if (!page.deployedContent) {
      return 'This page has never been deployed, so there is nothing to revert to.';
    }

    const snap = page.deployedContent as DeployedContent;
    await prisma.micromarketPage.update({
      where: { id },
      data: {
        citySlug: snap.citySlug,
        slug: snap.slug,
        name: snap.name,
        seoTitle: snap.seoTitle,
        metaDescription: snap.metaDescription,
        h1: snap.h1,
        heroEyebrow: snap.heroEyebrow,
        heroProse: snap.heroProse,
        heroImage: (snap.heroImage ?? Prisma.DbNull) as Prisma.InputJsonValue,
        marketHeading: snap.marketHeading,
        marketProse: snap.marketProse,
        marketImage: (snap.marketImage ?? Prisma.DbNull) as Prisma.InputJsonValue,
        rentsHeading: snap.rentsHeading,
        rentsProse: snap.rentsProse,
        specHeading: snap.specHeading,
        specProse: snap.specProse,
        inventoryHeading: snap.inventoryHeading,
        faqs: snap.faqs as Prisma.InputJsonValue,
        relatedBlogs: snap.relatedBlogs,
        statOverrides: (snap.statOverrides ?? Prisma.DbNull) as Prisma.InputJsonValue,
        status: snap.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      },
    });
  } catch (err) {
    return messageFor(err);
  }
  redirect('/micromarkets?reverted=1');
}
