'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { blogSchema } from '@/lib/blog-schema';
import { requireUser } from '@/lib/auth';
import type { DeployedContent } from '@/lib/staging';
import type { SaveResult, ListingResult } from '@/lib/action-results';

// Re-exported so existing importers keep their path; the shapes are shared with
// the other content sections (see lib/action-results.ts).
export type { SaveResult, ListingResult } from '@/lib/action-results';

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
// only imply caching that isn't happening. `refresh()` in toggleBlogListing is
// a different thing — it re-renders the open page's server components, which is
// about getting fresh props into a form that's still on screen, not about cache.

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
  const author = String(formData.get('author') ?? '').trim();

  return blogSchema.parse({
    slug: String(formData.get('slug') ?? ''),
    title: String(formData.get('title') ?? ''),
    seoTitle: String(formData.get('seoTitle') ?? ''),
    description: String(formData.get('description') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    keywords: json('keywords'),
    related: json('related'),
    blocks: json('blocks'),
    faqs: json('faqs'),
    author: author === '' ? null : author,
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
 * `related` holds slugs of other blogs. The public renderer looks each one up
 * and silently drops the ones it can't resolve, so a typo becomes an invisibly
 * missing cross-link rather than a visible error. Checking here is the only
 * place the editor finds out.
 */
async function assertRelatedExist(related: string[], ownSlug: string) {
  if (related.length === 0) return;

  const selfRef = related.find((s) => s === ownSlug);
  if (selfRef) throw new EditorError(`related: "${selfRef}" is this blog — a blog can't relate to itself.`);

  const found = await prisma.blog.findMany({
    where: { slug: { in: related } },
    select: { slug: true },
  });
  const missing = related.filter((s) => !found.some((f) => f.slug === s));
  if (missing.length > 0) {
    throw new EditorError(`related: no blog with slug ${missing.map((s) => `"${s}"`).join(', ')}`);
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
  console.error('[blogs] unexpected error:', err);
  return 'Something went wrong saving this blog. The details are in the server logs.';
}

export async function createBlog(_prev: SaveResult | undefined, formData: FormData): Promise<SaveResult> {
  await requireUser();
  let id: number;
  try {
    const blog = parseForm(formData);
    await assertRelatedExist(blog.related, blog.slug);
    id = (await prisma.blog.create({ data: toRow(blog) })).id;
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  // Outside the try: redirect() signals by throwing, so catching it here would
  // swallow the navigation and report it as a save failure.
  redirect(`/blogs/${id}?saved=1`);
}

export async function updateBlog(_prev: SaveResult | undefined, formData: FormData): Promise<SaveResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  try {
    const blog = parseForm(formData);
    await assertRelatedExist(blog.related, blog.slug);

    // Optimistic concurrency, folded into the write itself: `updatedAt` is part
    // of the WHERE, so the update only lands if the row is still the version
    // this form was rendered from. Doing it as a separate read first would cost
    // an extra round trip *and* leave a window for another save to slip in
    // between the check and the write.
    const expected = String(formData.get('expectedUpdatedAt') ?? '');
    if (expected) {
      const { count } = await prisma.blog.updateMany({
        where: { id, updatedAt: new Date(expected) },
        data: toRow(blog),
      });
      if (count === 0) {
        // Only now pay for a second query, to say which of the two happened.
        const stillThere = await prisma.blog.findUnique({ where: { id }, select: { id: true } });
        throw new EditorError(
          stillThere
            ? 'This blog was changed somewhere else after you opened it. Reload to see the current version — saving now would overwrite that change.'
            : 'That blog no longer exists.',
        );
      }
    } else {
      await prisma.blog.update({ where: { id }, data: toRow(blog) });
    }
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
  redirect(`/blogs/${id}?saved=1`);
}

/**
 * Deleting is irreversible and there's no version history, so the form that
 * calls this asks for the slug to be typed back. Both checks live here rather
 * than in the browser, so a stray double-submit can't get through either.
 */
export async function deleteBlog(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));
  // Held outside the try so the redirect below — which has to sit outside it,
  // since redirect() signals by throwing — can still name what was deleted.
  let slug: string;

  try {
    const blog = await prisma.blog.findUnique({ where: { id }, select: { slug: true } });
    if (!blog) return 'That blog no longer exists.';
    slug = blog.slug;

    if (String(formData.get('confirmSlug') ?? '').trim() !== blog.slug) {
      return `Type "${blog.slug}" exactly to confirm deletion.`;
    }

    const referrers = await prisma.blog.findMany({
      where: { related: { has: blog.slug }, id: { not: id } },
      select: { slug: true },
    });
    if (referrers.length > 0) {
      return `Still linked as "related" by ${referrers.map((r) => r.slug).join(', ')}. Remove those links first.`;
    }

    await prisma.blog.delete({ where: { id } });
  } catch (err) {
    return messageFor(err);
  }
  // The slug rides along so the list page can name what went — this is the last
  // moment it exists anywhere.
  redirect(`/blogs?deleted=${encodeURIComponent(slug)}`);
}

/**
 * Delist / list in one click — flips the blog between PUBLISHED and DRAFT.
 *
 * Delisting destroys nothing: it drops the blog out of the backend's PUBLISHED
 * query, so the next build stops emitting the page. Until that build runs the
 * old page is still live, which is exactly why the blog reads as Staged
 * immediately afterwards.
 *
 * The new status is computed from the row as it stands, not taken from the
 * client. A button rendered against a status that has since changed elsewhere
 * therefore can't publish something the editor meant to pull.
 *
 * refresh() rather than redirect(): the editor may well be open with unsaved
 * text in it. A refresh re-renders this page's server components in place —
 * client state is preserved, so the typing survives, while the props derived
 * from the row (status, the Staged badge, the lost-update stamp the form saves
 * against) all come back current. A redirect would discard that work silently.
 */
export async function toggleBlogListing(
  _prev: ListingResult | undefined,
  formData: FormData,
): Promise<ListingResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  let listed: boolean;

  try {
    const blog = await prisma.blog.findUnique({ where: { id }, select: { status: true } });
    if (!blog) return { ok: false, error: 'That blog no longer exists.' };
    listed = blog.status !== 'PUBLISHED';
    await prisma.blog.update({ where: { id }, data: { status: listed ? 'PUBLISHED' : 'DRAFT' } });
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
 * Persists a new order from the drag-and-drop list. Rewrites sortOrder to the
 * array position, so the result is always 0..n-1 with no ties — which is also
 * why the duplicate-order warning only ever applies to older rows.
 *
 * One transaction: a partial reorder would leave the list in a state nobody
 * chose.
 */
export async function reorderBlogs(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();

  let ids: number[];
  try {
    ids = JSON.parse(String(formData.get('ids') ?? '[]'));
    if (!Array.isArray(ids) || ids.some((n) => !Number.isInteger(n))) throw new Error('bad ids');
  } catch {
    return 'Could not read the new order.';
  }

  try {
    const existing = await prisma.blog.findMany({ select: { id: true } });
    // Reject a stale submission rather than silently dropping a blog that was
    // created or deleted in another tab while this list was open.
    if (existing.length !== ids.length || existing.some((g) => !ids.includes(g.id))) {
      return 'The blog list changed since this page loaded. Reload and try again.';
    }

    await prisma.$transaction(
      ids.map((id, i) => prisma.blog.update({ where: { id }, data: { sortOrder: i } })),
    );
  } catch (err) {
    return messageFor(err);
  }
  redirect('/blogs?reordered=1');
}

/**
 * Discards staged edits by writing the last deployed snapshot back over the live
 * row. Only meaningful for a blog that has been deployed at least once — with
 * no snapshot there is nothing to go back to.
 */
export async function revertBlog(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));

  try {
    const blog = await prisma.blog.findUnique({ where: { id } });
    if (!blog) return 'That blog no longer exists.';
    if (!blog.deployedContent) return 'This blog has never been deployed, so there is nothing to revert to.';

    const snap = blog.deployedContent as DeployedContent;
    await prisma.blog.update({
      where: { id },
      data: {
        slug: snap.slug,
        title: snap.title,
        seoTitle: snap.seoTitle,
        description: snap.description,
        summary: snap.summary,
        keywords: snap.keywords,
        blocks: snap.blocks as object,
        faqs: snap.faqs as object,
        related: snap.related,
        author: snap.author,
        datePublished: snap.datePublished ? new Date(`${snap.datePublished}T00:00:00.000Z`) : null,
        dateModified: new Date(`${snap.dateModified}T00:00:00.000Z`),
        sortOrder: snap.sortOrder,
        status: snap.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      },
    });
  } catch (err) {
    return messageFor(err);
  }
  redirect('/blogs?reverted=1');
}
