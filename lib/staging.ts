import type { Blog } from '@prisma/client';

// Whether a blog's saved state has reached the live site.
//
// Saving writes to Postgres; only a build publishes. So a row can be marked
// PUBLISHED while the site still serves older text — which is why the badge
// can't just read `status`. On each deploy the CMS snapshots every blog into
// `deployedContent`, and a blog whose current content differs from its
// snapshot is *staged*: saved, not live.
//
// Caveat worth knowing: the snapshot records a deploy being **triggered**. The
// CMS can't observe whether the build succeeded, so "Published" means "a deploy
// was started with this exact content", not "confirmed live".

/**
 * The subset of a Blog row that content is derived from. Typed as a Pick rather
 * than the whole model so callers can `select` just these columns instead of
 * dragging `deployedContent` (a full second copy of the content) across the wire
 * when they don't need it.
 */
export type ContentSource = Pick<
  Blog,
  | 'slug'
  | 'title'
  | 'seoTitle'
  | 'description'
  | 'summary'
  | 'keywords'
  | 'blocks'
  | 'faqs'
  | 'related'
  | 'author'
  | 'datePublished'
  | 'dateModified'
  | 'sortOrder'
  | 'status'
>;

/** Exactly the fields the public site renders. Order is fixed so the JSON compares stably. */
export type DeployedContent = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  summary: string;
  keywords: string[];
  blocks: unknown;
  faqs: unknown;
  related: string[];
  author: string | null;
  datePublished: string | null;
  dateModified: string;
  sortOrder: number;
  status: string;
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * `status` is included on purpose: flipping a live blog to DRAFT doesn't remove
 * it from the site until the next build, so that change is staged too.
 */
export function contentOf(g: ContentSource): DeployedContent {
  return {
    slug: g.slug,
    title: g.title,
    seoTitle: g.seoTitle,
    description: g.description,
    summary: g.summary,
    keywords: g.keywords,
    blocks: g.blocks,
    faqs: g.faqs,
    related: g.related,
    author: g.author,
    datePublished: iso(g.datePublished),
    dateModified: iso(g.dateModified) as string,
    sortOrder: g.sortOrder,
    status: g.status,
  };
}

/** Key-order-insensitive compare — Postgres JSONB does not preserve key order. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
        )
      : v;

/**
 * Exported because MicromarketPage rows go through the identical three-state
 * dance against their own `deployedContent`, and two copies of a
 * key-order-insensitive JSON compare would be two places to get it wrong.
 */
export const sameContent = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * Draft / Published / Staged applies to anything the CMS saves to Postgres and
 * publishes by build — blogs and micromarket pages both. The label, colour and
 * hint maps below are shared for the same reason.
 */
export type ContentState = 'DRAFT' | 'PUBLISHED' | 'STAGED';

/** Kept as a name for existing importers; the states are not blog-specific. */
export type BlogState = ContentState;

export function stateOf(g: ContentSource & Pick<Blog, 'deployedContent'>): BlogState {
  const snapshot = g.deployedContent as DeployedContent | null | undefined;
  // Is a version of this blog currently on the site? Only true if the last
  // deployed snapshot was itself PUBLISHED.
  const live = Boolean(snapshot) && snapshot!.status === 'PUBLISHED';

  // Nothing of this blog is on the site and it isn't marked for publication:
  // editing it can't put the site out of date, so it's just a draft.
  if (!live && g.status === 'DRAFT') return 'DRAFT';

  // Marked PUBLISHED but never deployed as such — it goes out next build.
  if (!live) return 'STAGED';

  // Live: staged exactly when the saved content differs from what went out.
  // A live blog flipped to DRAFT counts, since it stays on the site until the
  // next build removes it.
  return sameContent(contentOf(g), snapshot) ? 'PUBLISHED' : 'STAGED';
}

export const STATE_LABEL: Record<ContentState, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  STAGED: 'Staged',
};

export const STATE_CLASS: Record<ContentState, string> = {
  DRAFT: 'bg-wareongo-slate/10 text-wareongo-slate',
  PUBLISHED: 'bg-wareongo-green/10 text-wareongo-green',
  STAGED: 'bg-wareongo-sienna/10 text-wareongo-sienna',
};

export const STATE_HINT: Record<ContentState, string> = {
  DRAFT: 'Not on the site.',
  PUBLISHED: 'This exact content was included in a deploy.',
  STAGED: 'Saved but not deployed — the site still shows the previous version.',
};
