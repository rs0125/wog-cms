import { z } from 'zod';
import { editorialFields, slug } from './editorial-schema';

// The content shape is shared with city and state pages — see
// ./editorial-schema.ts — because one wireframe renders all three. This module
// adds only what addresses a micromarket page, and re-exports the shared names
// its existing importers use.
export {
  statOverridesSchema,
  NO_OVERRIDES,
  hasAnyOverride,
  pruneOverrides,
  PROSE_BANDS,
  countWords,
} from './editorial-schema';
export type {
  EditorialImage as MicromarketImage,
  EditorialFaq as MicromarketFaq,
  StatOverrides,
} from './editorial-schema';

/**
 * A micromarket is addressed by the pair, not the slug: the same locality tag
 * can exist under two cities, and only the parent city's URL resolves. Both
 * segments have to match the URL the site already builds, because the pair is
 * the join key — content whose slugs don't match a real page never renders, and
 * nothing anywhere reports it.
 */
export const micromarketSchema = z.object({
  citySlug: slug,
  slug,
  ...editorialFields,
});

export type MicromarketInput = z.infer<typeof micromarketSchema>;
