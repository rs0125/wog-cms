import type { LocationPage } from '@prisma/client';
import type { ContentState } from './staging';
import {
  editorialContentOf,
  editorialStateOf,
  type EditorialFields,
  type Flatten,
} from './editorial-staging';

// The twin of ./micromarket-staging.ts over the same shared contract
// (./editorial-staging.ts).
export {
  LIVE_LAYOUT_HINT,
  PAGE_STATE_LABEL,
  PAGE_STATE_CLASS,
  PAGE_STATE_HINT,
  type PageState,
} from './editorial-staging';

export type ContentSource = Pick<
  LocationPage,
  | 'kind'
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

/** `kind` is part of the identity, so a page moved between kinds reads as changed. */
export type DeployedContent = Flatten<{ kind: string; slug: string } & EditorialFields>;

export function contentOf(l: ContentSource): DeployedContent {
  return { kind: l.kind, slug: l.slug, ...editorialContentOf(l) };
}

export function stateOf(
  l: ContentSource & Pick<LocationPage, 'deployedContent'>,
): ContentState {
  return editorialStateOf(l, contentOf(l));
}
