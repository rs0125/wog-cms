'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { locationSchema, pruneOverrides } from '@/lib/location-schema';
import { requireUser } from '@/lib/auth';
import { fetchLocations, findLocation, listFor, locationOverviewPath } from '@/lib/locations-api';
import type { LocationKind } from '@/lib/location-schema';
import type { DeployedContent } from '@/lib/location-staging';
import type { SaveResult, ListingResult } from '@/lib/action-results';

// The twin of ../micromarkets/actions.ts one and two levels up. Same contract
// throughout — see there for why the concurrency check is folded into the write,
// why delete asks for the slug back, and why the toggle calls refresh() rather
// than redirect().
export type { SaveResult, ListingResult } from '@/lib/action-results';

class EditorError extends Error {}

async function assertPublishable(page: { kind: LocationKind; slug: string; status: string }) {
  if (page.status !== 'PUBLISHED') return;
  let inventory;
  try { inventory = await fetchLocations(); }
  catch { throw new EditorError('Location data is unavailable. Save as a draft and retry publication when it is available.'); }
  const location = findLocation(listFor(inventory, page.kind), page.slug);
  if (!location || !locationOverviewPath(location)) {
    throw new EditorError('Publication needs a matching location with enough listings and a known state. You can save this content as a draft.');
  }
}

/** '' in the form, null in the database — see optionalProse in the schema. */
const orNull = (formData: FormData, key: string) => {
  const v = String(formData.get(key) ?? '').trim();
  return v === '' ? null : v;
};

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

  return locationSchema.parse({
    kind: String(formData.get('kind') ?? ''),
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
    corridorHeading: orNull(formData, 'corridorHeading'),
    corridorProse: orNull(formData, 'corridorProse'),
    complianceHeading: orNull(formData, 'complianceHeading'),
    complianceProse: orNull(formData, 'complianceProse'),
    faqs: json('faqs') ?? [],
    relatedBlogs: json('relatedBlogs') ?? [],
    statOverrides: json('statOverrides'),
    status: String(formData.get('status') ?? 'DRAFT'),
  });
}

const toRow = (l: ReturnType<typeof parseForm>) => ({
  ...l,
  heroImage: l.heroImage ?? Prisma.DbNull,
  marketImage: l.marketImage ?? Prisma.DbNull,
  faqs: l.faqs as Prisma.InputJsonValue,
  statOverrides: (pruneOverrides(l.statOverrides) ?? Prisma.DbNull) as Prisma.InputJsonValue,
});

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
  // The (kind, slug) unique constraint, in the terms the editor typed.
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
    return 'That slug already has a page for this kind of location.';
  }
  if (err instanceof EditorError) return err.message;
  console.error('[locations] unexpected error:', err);
  return 'Something went wrong saving this page. The details are in the server logs.';
}

export async function createLocation(
  _prev: SaveResult | undefined,
  formData: FormData,
): Promise<SaveResult> {
  await requireUser();
  let id: number;
  try {
    const page = parseForm(formData);
    await assertPublishable(page);
    await assertBlogsExist(page.relatedBlogs);
    id = (await prisma.locationPage.create({ data: toRow(page) })).id;
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  redirect(`/locations/${id}?saved=1`);
}

export async function updateLocation(
  _prev: SaveResult | undefined,
  formData: FormData,
): Promise<SaveResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  try {
    const page = parseForm(formData);
    await assertPublishable(page);
    const existing = await prisma.locationPage.findUnique({ where: { id }, select: { kind: true } });
    if (!existing) throw new EditorError('That page no longer exists.');
    if (existing.kind !== page.kind) throw new EditorError('A city page cannot be changed into a state page. Create a separate page instead.');
    await assertBlogsExist(page.relatedBlogs);

    const expected = String(formData.get('expectedUpdatedAt') ?? '');
    if (expected) {
      const { count } = await prisma.locationPage.updateMany({
        where: { id, updatedAt: new Date(expected) },
        data: toRow(page),
      });
      if (count === 0) {
        const stillThere = await prisma.locationPage.findUnique({
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
      await prisma.locationPage.update({ where: { id }, data: toRow(page) });
    }
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  redirect(`/locations/${id}?saved=1`);
}

export async function deleteLocation(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));
  let slug: string;

  try {
    const page = await prisma.locationPage.findUnique({ where: { id }, select: { slug: true } });
    if (!page) return 'That page no longer exists.';
    slug = page.slug;

    if (String(formData.get('confirmSlug') ?? '').trim() !== page.slug) {
      return `Type "${page.slug}" exactly to confirm deletion.`;
    }

    await prisma.locationPage.delete({ where: { id } });
  } catch (err) {
    return messageFor(err);
  }
  redirect(`/locations?deleted=${encodeURIComponent(slug)}`);
}

export async function toggleLocationListing(
  _prev: ListingResult | undefined,
  formData: FormData,
): Promise<ListingResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  let listed: boolean;

  try {
    const page = await prisma.locationPage.findUnique({
      where: { id },
      select: { status: true, kind: true, slug: true },
    });
    if (!page) return { ok: false, error: 'That page no longer exists.' };
    listed = page.status !== 'PUBLISHED';
    if (listed) await assertPublishable({ ...page, status: 'PUBLISHED' });
    await prisma.locationPage.update({
      where: { id },
      data: { status: listed ? 'PUBLISHED' : 'DRAFT' },
    });
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }

  refresh();
  return { ok: true, listed, at: Date.now() };
}

export async function revertLocation(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));

  try {
    const page = await prisma.locationPage.findUnique({ where: { id } });
    if (!page) return 'That page no longer exists.';
    if (!page.deployedContent) {
      return 'This page has never been deployed, so there is nothing to revert to.';
    }

    const snap = page.deployedContent as DeployedContent;
    await prisma.locationPage.update({
      where: { id },
      data: {
        kind: snap.kind === 'STATE' ? 'STATE' : 'CITY',
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
        corridorHeading: snap.kind === 'CITY' ? snap.corridorHeading ?? null : null,
        corridorProse: snap.kind === 'CITY' ? snap.corridorProse ?? null : null,
        complianceHeading: snap.kind === 'CITY' ? snap.complianceHeading ?? null : null,
        complianceProse: snap.kind === 'CITY' ? snap.complianceProse ?? null : null,
        faqs: snap.faqs as Prisma.InputJsonValue,
        relatedBlogs: snap.relatedBlogs,
        statOverrides: (snap.statOverrides ?? Prisma.DbNull) as Prisma.InputJsonValue,
        status: snap.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      },
    });
  } catch (err) {
    return messageFor(err);
  }
  redirect('/locations?reverted=1');
}
