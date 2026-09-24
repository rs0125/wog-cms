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
  | 'corridorHeading'
  | 'corridorProse'
  | 'complianceHeading'
  | 'complianceProse'
  | 'faqs'
  | 'relatedBlogs'
  | 'statOverrides'
  | 'status'
>;

/** `kind` is part of the identity, so a page moved between kinds reads as changed. */
type CityFields = { corridorHeading?: string | null; corridorProse?: string | null;
  complianceHeading?: string | null; complianceProse?: string | null };
export type DeployedContent = Flatten<{ kind: string; slug: string } & EditorialFields & CityFields>;

const cityFields = (l: CityFields) => ({
  corridorHeading: l.corridorHeading ?? null, corridorProse: l.corridorProse ?? null,
  complianceHeading: l.complianceHeading ?? null, complianceProse: l.complianceProse ?? null,
});

export function contentOf(l: ContentSource): DeployedContent {
  return { kind: l.kind, slug: l.slug, ...editorialContentOf(l), ...(l.kind === 'CITY' ? cityFields(l) : {}) };
}

export function stateOf(
  l: ContentSource & Pick<LocationPage, 'deployedContent'>,
): ContentState {
  const snapshot = l.deployedContent as DeployedContent | null;
  // Old deployed snapshots predate the nullable city fields. An empty addition
  // must not mark every existing city as having an unpublished edit.
  return editorialStateOf({ ...l, deployedContent: snapshot?.kind === 'CITY'
    ? { ...snapshot, ...cityFields(snapshot) } : snapshot }, contentOf(l));
}
