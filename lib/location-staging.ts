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
  | 'citiesHeading'
  | 'stateCities'
  | 'faqs'
  | 'relatedBlogs'
  | 'statOverrides'
  | 'status'
>;

/** `kind` is part of the identity, so a page moved between kinds reads as changed. */
type KindFields = { corridorHeading?: string | null; corridorProse?: string | null;
  complianceHeading?: string | null; complianceProse?: string | null; citiesHeading?: string | null;
  stateCities?: unknown };
export type DeployedContent = Flatten<{ kind: string; slug: string } & EditorialFields & KindFields>;

/** The optional sections each kind renders — see locationSchema for the table. */
const kindFields = (kind: string, l: KindFields): KindFields => ({
  ...(kind === 'CITY' ? { corridorHeading: l.corridorHeading ?? null, corridorProse: l.corridorProse ?? null } : {}),
  complianceHeading: l.complianceHeading ?? null, complianceProse: l.complianceProse ?? null,
  ...(kind === 'CITY' ? {} : { citiesHeading: l.citiesHeading ?? null, stateCities: l.stateCities ?? null }),
});

export function contentOf(l: ContentSource): DeployedContent {
  return { kind: l.kind, slug: l.slug, ...editorialContentOf(l), ...kindFields(l.kind, l) };
}

export function stateOf(
  l: ContentSource & Pick<LocationPage, 'deployedContent'>,
): ContentState {
  const snapshot = l.deployedContent as DeployedContent | null;
  // Old deployed snapshots predate the nullable section fields: a city's lack
  // the corridor and compliance keys, a state's lack compliance, the cities
  // heading and the city list. An
  // empty addition must not mark every existing page as having an unpublished edit.
  return editorialStateOf({ ...l, deployedContent: snapshot
    ? { ...snapshot, ...kindFields(snapshot.kind, snapshot) } : snapshot }, contentOf(l));
}
