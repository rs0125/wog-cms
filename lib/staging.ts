import type { Guide } from '@prisma/client';

// Whether a guide's saved state has reached the live site.
//
// Saving writes to Postgres; only a build publishes. So a row can be marked
// PUBLISHED while the site still serves older text — which is why the badge
// can't just read `status`. On each deploy the CMS snapshots every guide into
// `deployedContent`, and a guide whose current content differs from its
// snapshot is *staged*: saved, not live.
//
// Caveat worth knowing: the snapshot records a deploy being **triggered**. The
// CMS can't observe whether the build succeeded, so "Published" means "a deploy
// was started with this exact content", not "confirmed live".

/**
 * The subset of a Guide row that content is derived from. Typed as a Pick rather
 * than the whole model so callers can `select` just these columns instead of
 * dragging `deployedContent` (a full second copy of the content) across the wire
 * when they don't need it.
 */
export type ContentSource = Pick<
  Guide,
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
 * `status` is included on purpose: flipping a live guide to DRAFT doesn't remove
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

const sameContent = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export type GuideState = 'DRAFT' | 'PUBLISHED' | 'STAGED';

export function stateOf(g: ContentSource & Pick<Guide, 'deployedContent'>): GuideState {
  const snapshot = g.deployedContent as DeployedContent | null | undefined;
  // Is a version of this guide currently on the site? Only true if the last
  // deployed snapshot was itself PUBLISHED.
  const live = Boolean(snapshot) && snapshot!.status === 'PUBLISHED';

  // Nothing of this guide is on the site and it isn't marked for publication:
  // editing it can't put the site out of date, so it's just a draft.
  if (!live && g.status === 'DRAFT') return 'DRAFT';

  // Marked PUBLISHED but never deployed as such — it goes out next build.
  if (!live) return 'STAGED';

  // Live: staged exactly when the saved content differs from what went out.
  // A live guide flipped to DRAFT counts, since it stays on the site until the
  // next build removes it.
  return sameContent(contentOf(g), snapshot) ? 'PUBLISHED' : 'STAGED';
}

export const STATE_LABEL: Record<GuideState, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  STAGED: 'Staged',
};

export const STATE_CLASS: Record<GuideState, string> = {
  DRAFT: 'bg-wareongo-slate/10 text-wareongo-slate',
  PUBLISHED: 'bg-wareongo-green/10 text-wareongo-green',
  STAGED: 'bg-wareongo-sienna/10 text-wareongo-sienna',
};

export const STATE_HINT: Record<GuideState, string> = {
  DRAFT: 'Not on the site.',
  PUBLISHED: 'This exact content was included in a deploy.',
  STAGED: 'Saved but not deployed — the site still shows the previous version.',
};
