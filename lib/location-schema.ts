import { z } from 'zod';
import { editorialFields, slug, optionalProse } from './editorial-schema';

// The twin of ./micromarket-schema.ts one and two levels up, over the same
// shared content fields (./editorial-schema.ts).
export {
  statOverridesSchema,
  NO_OVERRIDES,
  hasAnyOverride,
  pruneOverrides,
  PROSE_BANDS,
  countWords,
} from './editorial-schema';
export type {
  EditorialImage,
  EditorialFaq,
  StatOverrides,
} from './editorial-schema';

export const locationKindSchema = z.enum(['CITY', 'STATE']);
export type LocationKind = z.infer<typeof locationKindSchema>;

/**
 * A city or state is addressed by (kind, slug) rather than by slug alone:
 * "delhi", "puducherry" and "goa" are each both a city and a state in this
 * catalogue, and the two are different pages over different inventory.
 *
 * The slug has to match the URL the site already builds — it is the join key,
 * and content whose slug matches no real page never renders, silently.
 */
export const locationSchema = z.object({
  kind: locationKindSchema,
  slug,
  ...editorialFields,
  corridorHeading: optionalProse.optional().default(null),
  corridorProse: optionalProse.optional().default(null),
  complianceHeading: optionalProse.optional().default(null),
  complianceProse: optionalProse.optional().default(null),
}).transform(page => page.kind === 'CITY' ? page : {
  ...page, corridorHeading: null, corridorProse: null, complianceHeading: null, complianceProse: null,
});

export type LocationInput = z.infer<typeof locationSchema>;
