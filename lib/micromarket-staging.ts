import type { MicromarketPage } from '@prisma/client';
import { sameContent, type ContentState } from './staging';

// Whether a micromarket page's saved state has reached the live site. Identical
// contract to blogs (see ./staging.ts for the reasoning, including why the
// snapshot records a deploy being *triggered* rather than confirmed live) — this
// module just names the columns that make up a micromarket page's content.

/**
 * The subset of the row that content is derived from, as a Pick so callers can
 * `select` exactly these columns instead of dragging `deployedContent` — a full
 * second copy of the content — across the wire when they don't need it.
 */
export type ContentSource = Pick<
  MicromarketPage,
  | 'citySlug'
  | 'slug'
  | 'name'
  | 'seoTitle'
  | 'metaDescription'
  | 'h1'
  | 'heroEyebrow'
  | 'heroProse'
  | 'heroImage'
  | 'marketHeading'
  | 'marketProse'
  | 'marketImage'
  | 'rentsHeading'
  | 'rentsProse'
  | 'specHeading'
  | 'specProse'
  | 'inventoryHeading'
  | 'faqs'
  | 'relatedBlogs'
  | 'statOverrides'
  | 'status'
>;

/** Exactly the fields that reach the site. Order is fixed so the JSON compares stably. */
export type DeployedContent = {
  citySlug: string;
  slug: string;
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
};

/**
 * `name` is in here even though the public page never renders it: it is the
 * label this CMS lists the page under, and a rename the editor made but hasn't
 * deployed is still an unsaved-to-production difference worth showing.
 *
 * `status` is included for the reason blogs include it: flipping a live page to
 * DRAFT doesn't take it off the site until the next build, so that change is
 * staged too.
 */
export function contentOf(m: ContentSource): DeployedContent {
  return {
    citySlug: m.citySlug,
    slug: m.slug,
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

export function stateOf(
  m: ContentSource & Pick<MicromarketPage, 'deployedContent'>,
): ContentState {
  const snapshot = m.deployedContent as DeployedContent | null | undefined;
  const live = Boolean(snapshot) && snapshot!.status === 'PUBLISHED';

  if (!live && m.status === 'DRAFT') return 'DRAFT';
  if (!live) return 'STAGED';
  return sameContent(contentOf(m), snapshot) ? 'PUBLISHED' : 'STAGED';
}

/**
 * What the *website* does with this page today, which is the thing that isn't
 * obvious from Draft/Published alone: a micromarket with no deployed content
 * still has a working URL serving the plain listing grid. Delisting one doesn't
 * 404 it — it reverts it.
 */
export const LIVE_LAYOUT_HINT: Record<ContentState, string> = {
  DRAFT: 'The URL currently serves the plain listing grid.',
  PUBLISHED: 'The URL serves this editorial page.',
  STAGED: 'The URL serves the previously deployed version until the next build.',
};

/**
 * A micromarket's state from the listing screen's point of view, which has one
 * more case than the editor does: `STUB` is a micromarket the site builds a page
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
  STUB: 'Nothing written. The URL serves the plain grid of warehouses.',
  DRAFT: 'Written but not marked for publication. The URL still serves the plain grid.',
  PUBLISHED: 'This exact content was included in a deploy.',
  STAGED: 'Saved but not deployed — the site still shows the previous version.',
};
