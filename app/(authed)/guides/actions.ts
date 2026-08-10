'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { guideSchema } from '@/lib/guide-schema';
import { requireUser } from '@/lib/auth';

export type SaveResult = { ok: false; error: string } | { ok: true };

/**
 * An error whose message is written for the editor to read. Anything else is
 * treated as internal and replaced with a generic message, so raw Prisma text
 * (column names, constraint names) never reaches the browser.
 */
class EditorError extends Error {}

// Plain 'YYYY-MM-DD' → UTC midnight, matching how the seed wrote these and how
// the backend reads them back. Any time component risks a day-shift, which
// would move Article.dateModified and make Google see a bogus content update.
const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

// No revalidatePath anywhere in here: every page in this group is
// force-dynamic, so there is no cached output to invalidate. Calling it would
// only imply caching that isn't happening.

// The form posts blocks/faqs/keywords/related as JSON strings because they're
// nested structures; everything else arrives as plain fields.
function parseForm(formData: FormData) {
  const json = (key: string) => {
    const raw = String(formData.get(key) ?? '');
    try {
      return JSON.parse(raw);
    } catch {
      throw new EditorError(`${key} is not valid JSON`);
    }
  };
  const datePublished = String(formData.get('datePublished') ?? '').trim();

  return guideSchema.parse({
    slug: String(formData.get('slug') ?? ''),
    title: String(formData.get('title') ?? ''),
    seoTitle: String(formData.get('seoTitle') ?? ''),
    description: String(formData.get('description') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    keywords: json('keywords'),
    related: json('related'),
    blocks: json('blocks'),
    faqs: json('faqs'),
    datePublished: datePublished === '' ? null : datePublished,
    dateModified: String(formData.get('dateModified') ?? ''),
    sortOrder: Number(formData.get('sortOrder') ?? 0),
    status: String(formData.get('status') ?? 'DRAFT'),
  });
}

const toRow = (g: ReturnType<typeof parseForm>) => ({
  ...g,
  datePublished: g.datePublished ? asDate(g.datePublished) : null,
  dateModified: asDate(g.dateModified),
});

/**
 * `related` holds slugs of other guides. The public renderer looks each one up
 * and silently drops the ones it can't resolve, so a typo becomes an invisibly
 * missing cross-link rather than a visible error. Checking here is the only
 * place the editor finds out.
 */
async function assertRelatedExist(related: string[], ownSlug: string) {
  if (related.length === 0) return;

  const selfRef = related.find((s) => s === ownSlug);
  if (selfRef) throw new EditorError(`related: "${selfRef}" is this guide — a guide can't relate to itself.`);

  const found = await prisma.guide.findMany({
    where: { slug: { in: related } },
    select: { slug: true },
  });
  const missing = related.filter((s) => !found.some((f) => f.slug === s));
  if (missing.length > 0) {
    throw new EditorError(`related: no guide with slug ${missing.map((s) => `"${s}"`).join(', ')}`);
  }
}

function messageFor(err: unknown) {
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`).join('; ');
  }
  // Prisma's unique-constraint violation, surfaced in the terms the editor typed.
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
    return 'That slug is already taken.';
  }
  if (err instanceof EditorError) return err.message;
  console.error('[guides] unexpected error:', err);
  return 'Something went wrong saving this guide. The details are in the server logs.';
}

export async function createGuide(_prev: SaveResult | undefined, formData: FormData): Promise<SaveResult> {
  await requireUser();
  let id: number;
  try {
    const guide = parseForm(formData);
    await assertRelatedExist(guide.related, guide.slug);
    id = (await prisma.guide.create({ data: toRow(guide) })).id;
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  // Outside the try: redirect() signals by throwing, so catching it here would
  // swallow the navigation and report it as a save failure.
  redirect(`/guides/${id}?saved=1`);
}

export async function updateGuide(_prev: SaveResult | undefined, formData: FormData): Promise<SaveResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  try {
    const guide = parseForm(formData);
    await assertRelatedExist(guide.related, guide.slug);
    await prisma.guide.update({ where: { id }, data: toRow(guide) });
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  redirect(`/guides/${id}?saved=1`);
}

/**
 * Deleting is irreversible and there's no version history, so the form that
 * calls this asks for the slug to be typed back. Both checks live here rather
 * than in the browser, so a stray double-submit can't get through either.
 */
export async function deleteGuide(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));

  try {
    const guide = await prisma.guide.findUnique({ where: { id }, select: { slug: true } });
    if (!guide) return 'That guide no longer exists.';

    if (String(formData.get('confirmSlug') ?? '').trim() !== guide.slug) {
      return `Type "${guide.slug}" exactly to confirm deletion.`;
    }

    const referrers = await prisma.guide.findMany({
      where: { related: { has: guide.slug }, id: { not: id } },
      select: { slug: true },
    });
    if (referrers.length > 0) {
      return `Still linked as "related" by ${referrers.map((r) => r.slug).join(', ')}. Remove those links first.`;
    }

    await prisma.guide.delete({ where: { id } });
  } catch (err) {
    return messageFor(err);
  }
  redirect('/guides');
}
