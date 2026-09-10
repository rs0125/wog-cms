import { sameContent, type ContentState } from './staging';

// Whether an editorial page's saved state has reached the live site. Identical
// contract to blogs (see ./staging.ts for the reasoning, including why the
// snapshot records a deploy being *triggered* rather than confirmed live).
//
// The content fields are the same for every scope — one wireframe renders
// micromarkets, cities and states — so the comparison, the state machine and
// the labels live here. ./micromarket-staging.ts and ./location-staging.ts add
// only the columns that address a page.

/**
 * Flattens an intersection into a single object type.
 *
 * Needed, not cosmetic: TypeScript gives an implicit index signature to an
 * object-literal type alias but not to an intersection, and without one a
 * snapshot cannot be assigned to Prisma.InputJsonValue. Writing the identity
 * fields and the shared fields as one flattened alias keeps the Json casts
 * honest instead of pushing them through `unknown`.
 */
export type Flatten<T> = { [K in keyof T]: T[K] };

/** The content columns every scope shares. */
export interface EditorialFields {
  name: string;
  seoTitle: string;
  metaDescription: string;
  h1: string;
  heroEyebrow: string | null;
  heroProse: string;
  heroImage: unknown;
  marketHeading: string | null;
  marketProse: string | null;
  marketImage: unknown;
  rentsHeading: string | null;
  rentsProse: string | null;
  specHeading: string | null;
  specProse: string | null;
  inventoryHeading: string | null;
  faqs: unknown;
  relatedBlogs: string[];
  statOverrides: unknown;
  status: string;
}

/**
 * The shared half of a deployed snapshot. Order is fixed so the JSON compares
 * stably.
 *
 * `name` is in here even though the public page never renders it: it is the
 * label this CMS lists the page under, and a rename the editor made but hasn't
 * deployed is still an unsaved-to-production difference worth showing.
 *
 * `status` is included for the reason blogs include it: flipping a live page to
 * DRAFT doesn't take it off the site until the next build, so that change is
 * staged too.
 */
export function editorialContentOf(m: EditorialFields): EditorialFields {
  return {
    name: m.name,
    seoTitle: m.seoTitle,
    metaDescription: m.metaDescription,
    h1: m.h1,
    heroEyebrow: m.heroEyebrow,
    heroProse: m.heroProse,
    heroImage: m.heroImage,
    marketHeading: m.marketHeading,
    marketProse: m.marketProse,
    marketImage: m.marketImage,
    rentsHeading: m.rentsHeading,
    rentsProse: m.rentsProse,
    specHeading: m.specHeading,
    specProse: m.specProse,
    inventoryHeading: m.inventoryHeading,
    faqs: m.faqs,
    relatedBlogs: m.relatedBlogs,
    statOverrides: m.statOverrides,
    status: m.status,
  };
}

/**
 * Draft / Staged / Published from a row and its deployed snapshot. Generic over
 * the snapshot shape so each scope can include its own identity columns in the
 * comparison.
 */
export function editorialStateOf<T extends { status: string }>(
  row: { status: string; deployedContent: unknown },
  current: T,
): ContentState {
  const snapshot = row.deployedContent as T | null | undefined;
  const live = Boolean(snapshot) && snapshot!.status === 'PUBLISHED';

  if (!live && row.status === 'DRAFT') return 'DRAFT';
  if (!live) return 'STAGED';
  return sameContent(current, snapshot) ? 'PUBLISHED' : 'STAGED';
}

/**
 * What the *website* does with this page today, which is the thing that isn't
 * obvious from Draft/Published alone: only deployed, published content produces
 * an overview. Listing URLs stay available independently of that content.
 */
export const LIVE_LAYOUT_HINT: Record<ContentState, string> = {
  DRAFT: 'No overview is published. The warehouse listing page is available.',
  PUBLISHED: 'The overview URL serves this editorial page.',
  STAGED: 'Overview publication changes take effect on the next build.',
};

/**
 * A page's state from the listing screen's point of view, which has one more
 * case than the editor does: `STUB` is a location the site already builds a page
 * for that nobody has written yet. It is not an error — that URL works and
 * serves the warehouse grid — so it reads as a state, not a warning.
 */
export type PageState = 'STUB' | ContentState;

export const PAGE_STATE_LABEL: Record<PageState, string> = {
  // Not "Stub": in Montserrat uppercase the T/U pair renders with a gap wide
  // enough to read as two words ("ST UB"), and no tracking value fixes it. This
  // also says the thing plainly to a team writing copy rather than in jargon.
  STUB: 'No content',
  DRAFT: 'Draft',
  PUBLISHED: 'Live',
  STAGED: 'Staged',
};

export const PAGE_STATE_CLASS: Record<PageState, string> = {
  STUB: 'bg-wareongo-slate/10 text-wareongo-slate',
  DRAFT: 'bg-wareongo-purple/10 text-wareongo-purple',
  PUBLISHED: 'bg-wareongo-green/10 text-wareongo-green',
  STAGED: 'bg-wareongo-sienna/10 text-wareongo-sienna',
};

export const PAGE_STATE_HINT: Record<PageState, string> = {
  STUB: 'No overview written. The warehouse listing page is available.',
  DRAFT: 'Overview written but not marked for publication.',
  PUBLISHED: 'This exact content was included in a deploy.',
  STAGED: 'Saved but not deployed — the site still shows the previous version.',
};
