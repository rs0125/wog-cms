import { z } from 'zod';

// Mirrors the MicromarketContent / MicromarketFaq / MicromarketImage types in
// the website repo (src/data/micromarkets.ts).
//
// What this table holds is prose and nothing else. Every figure on a micromarket
// page — listing count, rent and size ranges, construction mix, compliance
// counts, the peer rent chart — is computed from live inventory at build time
// (website src/lib/micromarketStats.ts), which is what stops copy written today
// from contradicting the grid on the same page a year from now.

const nonEmpty = z.string().trim().min(1, 'required');

/**
 * Both URL segments are validated the way the website's own slug helpers
 * produce them, because the pair is the join key: content whose slug doesn't
 * match a real page simply never renders, silently.
 *
 * `slugifyMicromarket` collapses '/' to '-' ("Alipur/Budhpur" →
 * "alipur-budhpur"), so a slug here is plain lowercase kebab either way.
 */
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and single hyphens only');

const imageSchema = z.object({
  // Written by the upload route, never typed by hand: an absolute URL on the R2
  // public host. Anything else would also have to be added to the website's
  // vercel.json `images.remotePatterns` before it could be optimized.
  url: z.string().url().startsWith('https://', 'must be an https URL'),
  // Required, not optional. These images carry information about the belt (an
  // estate, a dock detail), so an empty alt would be wrong for readers and
  // crawlers alike.
  alt: nonEmpty,
  // Intrinsic size of the stored file, measured at upload, so the page reserves
  // the right box and the prose below it doesn't jump when the image loads.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const faqSchema = z.object({ q: nonEmpty, a: nonEmpty });

/**
 * A number an editor typed to correct a derived figure, or nothing.
 *
 * Accepts absent as well as null on input because the two sources disagree: the
 * form always posts every key (null for "leave it computed"), while the stored
 * row holds only the keys actually set. Prisma rejects a nested null in a Json
 * write, and storing a full object of nulls for every page would be a block of
 * dead keys in the database and in the generated module besides.
 */
const overrideNumber = z.union([z.number().finite().nonnegative(), z.null()]).optional();

const spreadOverride = z
  .object({ min: overrideNumber, median: overrideNumber, max: overrideNumber })
  .partial()
  .optional();

/**
 * Manual corrections to the figures the website derives from live listings.
 *
 * Partial by design: set the one number that is wrong and the rest stay
 * computed, so a page does not go stale the moment inventory changes.
 *
 * What is *not* overridable is as deliberate as what is. The listing count has
 * to agree with the grid rendered beneath it on the same page. The construction
 * and flooring mixes are derived label-by-label from those same rows. And a
 * peer's median rent belongs to that peer's own page, where it is computed the
 * same way — letting this page assert a different one would put two numbers for
 * the same belt on two URLs.
 *
 * Parsing normalises whatever it is given into the full shape, with null where
 * nothing is set, so the form has a stable object to bind to; `pruneOverrides`
 * does the reverse before writing.
 */
export const statOverridesSchema = z
  .object({
    /** ₹ per sq ft per month. */
    rent: spreadOverride,
    /** Sq ft. */
    size: spreadOverride,
    /** Feet. */
    clearHeight: spreadOverride,
    docksMedian: overrideNumber,
    fireNoc: overrideNumber,
    commercialClu: overrideNumber,
  })
  .partial()
  .nullable()
  .optional()
  .transform((o) => ({
    rent: {
      min: o?.rent?.min ?? null,
      median: o?.rent?.median ?? null,
      max: o?.rent?.max ?? null,
    },
    size: {
      min: o?.size?.min ?? null,
      median: o?.size?.median ?? null,
      max: o?.size?.max ?? null,
    },
    clearHeight: {
      min: o?.clearHeight?.min ?? null,
      median: o?.clearHeight?.median ?? null,
      max: o?.clearHeight?.max ?? null,
    },
    docksMedian: o?.docksMedian ?? null,
    fireNoc: o?.fireNoc ?? null,
    commercialClu: o?.commercialClu ?? null,
  }));

/**
 * An optional prose slot. Empty string in the form, null in the database, so
 * "nothing written yet" is one value rather than two — the empty string would
 * otherwise register as a difference against the deployed snapshot and mark the
 * page Staged for nothing.
 */
const optionalProse = nonEmpty.nullable();

export const micromarketSchema = z.object({
  citySlug: slug,
  slug,
  name: nonEmpty,
  seoTitle: nonEmpty,
  metaDescription: nonEmpty,
  h1: nonEmpty,
  heroEyebrow: optionalProse,
  // The one required slot. A page with no lead paragraph has nothing the plain
  // listing grid doesn't already do better, so publishing it would be a
  // downgrade — the website's fallback is the better page in that case.
  heroProse: nonEmpty,
  heroImage: imageSchema.nullable(),
  marketHeading: optionalProse,
  marketProse: optionalProse,
  marketImage: imageSchema.nullable(),
  rentsHeading: optionalProse,
  rentsProse: optionalProse,
  specHeading: optionalProse,
  specProse: optionalProse,
  inventoryHeading: optionalProse,
  faqs: z.array(faqSchema),
  relatedBlogs: z.array(nonEmpty),
  statOverrides: statOverridesSchema,
  status: z.enum(['DRAFT', 'PUBLISHED']),
});

export type MicromarketImage = z.infer<typeof imageSchema>;
export type StatOverrides = z.infer<typeof statOverridesSchema>;

/** Every override cleared — what a page starts with and what the form posts. */
export const NO_OVERRIDES: StatOverrides = {
  rent: { min: null, median: null, max: null },
  size: { min: null, median: null, max: null },
  clearHeight: { min: null, median: null, max: null },
  docksMedian: null,
  fireNoc: null,
  commercialClu: null,
};

/** True when nothing is set — used to collapse the form section by default. */
export const hasAnyOverride = (o: StatOverrides): boolean =>
  [o.rent, o.size, o.clearHeight].some((s) => s.min !== null || s.median !== null || s.max !== null) ||
  [o.docksMedian, o.fireNoc, o.commercialClu].some((v) => v !== null);

/**
 * The canonical shape back down to only what is set, for storage.
 *
 * Returns undefined when nothing is overridden, which the caller writes as SQL
 * NULL. Two reasons this is not just cosmetic: Prisma refuses a nested null in
 * a Json write, and the read API decides whether to send the key at all by
 * asking whether anything is in it.
 */
export function pruneOverrides(o: StatOverrides): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  for (const key of ['rent', 'size', 'clearHeight'] as const) {
    const spread = Object.fromEntries(
      Object.entries(o[key]).filter(([, v]) => v !== null),
    );
    if (Object.keys(spread).length > 0) out[key] = spread;
  }
  for (const key of ['docksMedian', 'fireNoc', 'commercialClu'] as const) {
    if (o[key] !== null) out[key] = o[key];
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
export type MicromarketFaq = z.infer<typeof faqSchema>;
export type MicromarketInput = z.infer<typeof micromarketSchema>;

/**
 * Word-count bands from the content spec, shown as live guidance in the editor
 * rather than enforced. They are editorial targets, not correctness: a belt with
 * genuinely little to say should be allowed to say less rather than be padded to
 * hit a floor.
 */
export const PROSE_BANDS: Record<string, { min: number; max: number }> = {
  heroProse: { min: 55, max: 80 },
  marketProse: { min: 66, max: 112 },
  rentsProse: { min: 84, max: 118 },
  specProse: { min: 45, max: 70 },
};

export const countWords = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
