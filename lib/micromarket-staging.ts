import type { MicromarketPage } from '@prisma/client';
import type { ContentState } from './staging';
import {
  editorialContentOf,
  editorialStateOf,
  type EditorialFields,
  type Flatten,
} from './editorial-staging';

// The content contract is shared with city and state pages — see
// ./editorial-staging.ts. This module names the columns that address a
// micromarket page, and re-exports the shared labels its importers use.
export {
  LIVE_LAYOUT_HINT,
  PAGE_STATE_LABEL,
  PAGE_STATE_CLASS,
  PAGE_STATE_HINT,
  type PageState,
} from './editorial-staging';

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

/** Exactly the fields that reach the site. Identity first, then the shared set. */
export type DeployedContent = Flatten<{ citySlug: string; slug: string } & EditorialFields>;

export function contentOf(m: ContentSource): DeployedContent {
  return { citySlug: m.citySlug, slug: m.slug, ...editorialContentOf(m) };
}

export function stateOf(
  m: ContentSource & Pick<MicromarketPage, 'deployedContent'>,
): ContentState {
  return editorialStateOf(m, contentOf(m));
}
