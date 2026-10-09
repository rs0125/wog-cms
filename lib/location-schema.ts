import { z } from 'zod';
import { editorialFields, imageSchema, slug, optionalProse } from './editorial-schema';

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

export const MAX_STATE_CITIES = 8;

/**
 * One city on a state page's cities list. `slug` is one of the state's
 * /locations cities, or null for a city we have no listings in (it shows no
 * figures and no link). `image` overrides the photo the build picks.
 */
// A reference to a /locations city, picked from the state's candidates rather
// than typed. Looser than a page slug: "Chhatrapati Sambhajinagar / Aurangabad"
// is "chhatrapati-sambhajinagar--aurangabad" there.
const citySlug = z.string().trim().max(160).regex(/^[a-z0-9]+(?:-+[a-z0-9]+)*$/, 'not a city slug');

export const stateCitySchema = z.object({
  name: z.string().trim().min(1, 'required').max(60, 'at most 60 characters'),
  slug: citySlug.nullable().default(null),
  image: imageSchema.nullable().default(null),
});
export type StateCityEntry = z.infer<typeof stateCitySchema>;

/**
 * The state page's city list in display order. Empty reads as null, the
 * default four, so "no list" is one value and cannot mark a page Staged.
 */
export const stateCitiesSchema = z.array(stateCitySchema)
  .max(MAX_STATE_CITIES, `at most ${MAX_STATE_CITIES} cities`)
  .superRefine((list, ctx) => {
    const slugs = new Set<string>();
    const names = new Set<string>();
    list.forEach((city, i) => {
      if (city.slug && slugs.has(city.slug)) ctx.addIssue({ code: 'custom', path: [i, 'slug'], message: `${city.name} is listed twice` });
      if (names.has(city.name.toLowerCase())) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: `${city.name} is listed twice` });
      if (city.slug) slugs.add(city.slug);
      names.add(city.name.toLowerCase());
    });
  })
  .nullable()
  .transform(list => list?.length ? list : null);

/**
 * A city or state is addressed by (kind, slug) rather than by slug alone:
 * "delhi", "puducherry" and "goa" are each both a city and a state in this
 * catalogue, and the two are different pages over different inventory.
 *
 * The slug has to match the URL the site already builds — it is the join key,
 * and content whose slug matches no real page never renders, silently.
 *
 * Some optional sections belong to one kind: corridors are city-only, cities
 * are state-only and compliance is both. The other kind's fields are nulled
 * here, and staging, revert and the import schemas follow the same table.
 */
export const locationSchema = z.object({
  kind: locationKindSchema,
  slug,
  ...editorialFields,
  corridorHeading: optionalProse.optional().default(null),
  corridorProse: optionalProse.optional().default(null),
  complianceHeading: optionalProse.optional().default(null),
  complianceProse: optionalProse.optional().default(null),
  citiesHeading: optionalProse.optional().default(null),
  stateCities: stateCitiesSchema.optional().default(null),
}).transform(page => page.kind === 'CITY'
  ? { ...page, citiesHeading: null, stateCities: null }
  : { ...page, corridorHeading: null, corridorProse: null });

export type LocationInput = z.infer<typeof locationSchema>;
