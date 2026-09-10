import type { DerivedStats, Spread } from './derived-stats';

/**
 * Presentation helpers, and the one piece of arithmetic this app still does:
 * laying an editor's overrides over the figures the backend derived, so the
 * preview shows what will publish rather than the raw derivation.
 *
 * Mirrors applyStatOverrides in the website's micromarketStats.ts. That pairing
 * is unavoidable — the overrides are this app's own data and the website applies
 * them at build — so the two have to agree on the merge, clamp included.
 */

export const formatSqft = (n: number): string =>
  n >= 100000 ? `${(n / 100000).toFixed(2).replace(/\.?0+$/, '')} lakh` : n.toLocaleString('en-IN');

export const formatSqftRange = (s: Spread): string =>
  s.min === s.max ? formatSqft(s.min) : `${formatSqft(s.min)}–${formatSqft(s.max)}`;

export const formatRentRange = (s: Spread): string =>
  s.min === s.max ? `₹${s.min}` : `₹${s.min}–${s.max}`;

type SpreadOverride = { min?: number | null; median?: number | null; max?: number | null };

/**
 * A spread needs all three of min, median and max to exist. Where nothing was
 * computable an override can supply the whole set; a partial one is dropped
 * rather than rendered with holes. Reversed bounds are clamped, so a typo gives
 * a slightly wrong range rather than "₹30 to ₹12".
 */
const mergeSpread = (computed: Spread | null, override: SpreadOverride | undefined): Spread | null => {
  if (!override) return computed;
  const min = override.min ?? computed?.min;
  const median = override.median ?? computed?.median;
  const max = override.max ?? computed?.max;
  if (min === undefined || median === undefined || max === undefined) return computed;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return { min: low, median: Math.min(Math.max(median, low), high), max: high };
};

/**
 * Generic over the stats type rather than typed to one scope: a city's figures
 * carry `parentState` where a micromarket's carry `citySlug`, and the caller
 * gets its own type back instead of losing those fields to a widened return.
 */
export function applyOverrides<T extends DerivedStats>(
  stats: T,
  o: {
    rent: SpreadOverride;
    size: SpreadOverride;
    clearHeight: SpreadOverride;
    docksMedian: number | null;
    fireNoc: number | null;
    commercialClu: number | null;
  },
): T {
  const rent = mergeSpread(stats.rent, o.rent);

  /**
   * This belt's own bar follows a corrected median; its siblings' do not, since
   * a sibling's median belongs to that sibling's page. Matches what the site
   * does in applyStatOverrides — the preview would otherwise show a chart the
   * published page disagrees with.
   */
  const peers =
    rent && stats.peers.length > 0
      ? stats.peers.map((p) => (p.isSelf ? { ...p, medianRent: rent.median } : p))
      : stats.peers;

  return {
    ...stats,
    rent,
    peers,
    size: mergeSpread(stats.size, o.size),
    clearHeight: mergeSpread(stats.clearHeight, o.clearHeight),
    docksMedian: o.docksMedian ?? stats.docksMedian,
    fireNoc: o.fireNoc ?? stats.fireNoc,
    commercialClu: o.commercialClu ?? stats.commercialClu,
  };
}
