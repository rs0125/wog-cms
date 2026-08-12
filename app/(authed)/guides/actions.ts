'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { guideSchema } from '@/lib/guide-schema';
import { requireUser } from '@/lib/auth';
import { deployHookUrl } from '@/lib/deploy';
import { contentOf, type DeployedContent } from '@/lib/staging';

export type SaveResult = { ok: false; error: string } | { ok: true };

/** `listed` is the state the guide ended up in; `at` distinguishes one toggle from the next. */
export type ListingResult = { ok: true; listed: boolean; at: number } | { ok: false; error: string };

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
// only imply caching that isn't happening. `refresh()` in toggleGuideListing is
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

    // Optimistic concurrency, folded into the write itself: `updatedAt` is part
    // of the WHERE, so the update only lands if the row is still the version
    // this form was rendered from. Doing it as a separate read first would cost
    // an extra round trip *and* leave a window for another save to slip in
    // between the check and the write.
    const expected = String(formData.get('expectedUpdatedAt') ?? '');
    if (expected) {
      const { count } = await prisma.guide.updateMany({
        where: { id, updatedAt: new Date(expected) },
        data: toRow(guide),
      });
      if (count === 0) {
        // Only now pay for a second query, to say which of the two happened.
        const stillThere = await prisma.guide.findUnique({ where: { id }, select: { id: true } });
        throw new EditorError(
          stillThere
            ? 'This guide was changed somewhere else after you opened it. Reload to see the current version — saving now would overwrite that change.'
            : 'That guide no longer exists.',
        );
      }
    } else {
      await prisma.guide.update({ where: { id }, data: toRow(guide) });
    }
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
  // Held outside the try so the redirect below — which has to sit outside it,
  // since redirect() signals by throwing — can still name what was deleted.
  let slug: string;

  try {
    const guide = await prisma.guide.findUnique({ where: { id }, select: { slug: true } });
    if (!guide) return 'That guide no longer exists.';
    slug = guide.slug;

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
  // The slug rides along so the list page can name what went — this is the last
  // moment it exists anywhere.
  redirect(`/guides?deleted=${encodeURIComponent(slug)}`);
}

/**
 * Delist / list in one click — flips the guide between PUBLISHED and DRAFT.
 *
 * Delisting destroys nothing: it drops the guide out of the backend's PUBLISHED
 * query, so the next build stops emitting the page. Until that build runs the
 * old page is still live, which is exactly why the guide reads as Staged
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
export async function toggleGuideListing(
  _prev: ListingResult | undefined,
  formData: FormData,
): Promise<ListingResult> {
  await requireUser();
  const id = Number(formData.get('id'));
  let listed: boolean;

  try {
    const guide = await prisma.guide.findUnique({ where: { id }, select: { status: true } });
    if (!guide) return { ok: false, error: 'That guide no longer exists.' };
    listed = guide.status !== 'PUBLISHED';
    await prisma.guide.update({ where: { id }, data: { status: listed ? 'PUBLISHED' : 'DRAFT' } });
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
export async function reorderGuides(
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
    const existing = await prisma.guide.findMany({ select: { id: true } });
    // Reject a stale submission rather than silently dropping a guide that was
    // created or deleted in another tab while this list was open.
    if (existing.length !== ids.length || existing.some((g) => !ids.includes(g.id))) {
      return 'The guide list changed since this page loaded. Reload and try again.';
    }

    await prisma.$transaction(
      ids.map((id, i) => prisma.guide.update({ where: { id }, data: { sortOrder: i } })),
    );
  } catch (err) {
    return messageFor(err);
  }
  redirect('/guides?reordered=1');
}

/**
 * Triggers a production build of the *website* (not this app) via a Vercel
 * Deploy Hook, which is how CMS changes actually reach wareongo.com.
 *
 * A Deploy Hook URL needs no auth header — the unique id in the URL *is* the
 * credential, so anyone holding it can deploy. It's read from the environment
 * and never sent to the browser.
 *
 * Vercel allows 60 triggers per hour per project, and re-triggering cancels an
 * in-flight build for the same hook, so a double-click is harmless.
 */
// Takes no arguments: useActionState passes (prevState, formData), but this
// action reads neither, and a zero-arg function is assignable to that shape.
export async function triggerSiteBuild(): Promise<string | undefined> {
  await requireUser();

  const hook = deployHookUrl();
  if (!hook.ok) return hook.error;

  // Step 1 — trigger the build.
  let jobId: string | undefined;
  try {
    const res = await fetch(hook.url, { method: 'POST', cache: 'no-store' });
    if (!res.ok) {
      console.error('[deploy-hook] failed:', res.status, await res.text().catch(() => ''));
      return res.status === 429
        ? 'Vercel is rate-limiting builds (60/hour). Try again shortly.'
        : `Vercel refused the request (${res.status}).`;
    }
    // Shape per Vercel's docs: { job: { id, state, createdAt } }
    const body = (await res.json().catch(() => null)) as { job?: { id?: string } } | null;
    jobId = body?.job?.id;
  } catch (err) {
    console.error('[deploy-hook] error:', err);
    return 'Could not reach Vercel. Check the server logs.';
  }

  const started = `Build started${jobId ? ` (job ${jobId})` : ''}.`;

  // Step 2 — record what went out, in its own try. The build is already running
  // by this point, so a failure here must not be reported as a failed deploy:
  // that would be a lie, and it would hide the real problem (badges stuck on
  // Staged because the snapshot never advanced).
  try {
    // Selects only what contentOf() reads. A bare findMany() would also pull
    // every row's existing deployedContent — a second full copy of the content —
    // purely to throw it away.
    const all = await prisma.guide.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        seoTitle: true,
        description: true,
        summary: true,
        keywords: true,
        blocks: true,
        faqs: true,
        related: true,
        datePublished: true,
        dateModified: true,
        sortOrder: true,
        status: true,
      },
    });
    const now = new Date();
    await prisma.$transaction(
      all.map((g) =>
        prisma.guide.update({
          where: { id: g.id },
          // Cast: contentOf() returns JSON-serialisable data by construction,
          // but `blocks`/`faqs` are typed `unknown` so Prisma can't prove it.
          data: { deployedContent: contentOf(g) as Prisma.InputJsonValue, deployedAt: now },
        }),
      ),
    );
  } catch (err) {
    console.error('[deploy-hook] snapshot failed after a successful trigger:', err);
    return `${started} But the CMS could not record it, so guides may still show as Staged.`;
  }

  return `ok:${started} The site updates in a few minutes.`;
}


/**
 * Discards staged edits by writing the last deployed snapshot back over the live
 * row. Only meaningful for a guide that has been deployed at least once — with
 * no snapshot there is nothing to go back to.
 */
export async function revertGuide(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireUser();
  const id = Number(formData.get('id'));

  try {
    const guide = await prisma.guide.findUnique({ where: { id } });
    if (!guide) return 'That guide no longer exists.';
    if (!guide.deployedContent) return 'This guide has never been deployed, so there is nothing to revert to.';

    const snap = guide.deployedContent as DeployedContent;
    await prisma.guide.update({
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
        datePublished: snap.datePublished ? new Date(`${snap.datePublished}T00:00:00.000Z`) : null,
        dateModified: new Date(`${snap.dateModified}T00:00:00.000Z`),
        sortOrder: snap.sortOrder,
        status: snap.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      },
    });
  } catch (err) {
    return messageFor(err);
  }
  redirect('/guides?reverted=1');
}
