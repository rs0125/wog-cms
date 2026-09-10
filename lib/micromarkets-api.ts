/**
 * Micromarket data, read from the backend.
 *
 * This app derives none of it. Which micromarkets exist, which earn a page, and
 * every figure computed from their inventory all come from
 * `GET /micromarkets` — see WareOnGo-Website-Backend services/micromarketService.js.
 *
 * It used to be computed here, and separately in two places in the website. The
 * numbers agreed at the time, which is exactly what makes three copies
 * dangerous: nothing tells you when they stop agreeing, and the failure looks
 * like the CMS showing an editor one median while the site publishes another.
 * One derivation, three readers.
 */

const API_BASE = (process.env.WAREONGO_API_BASE ?? 'https://wareongo-website-backend.onrender.com').replace(
  /\/$/,
  '',
);

// The figure types are shared with cities and states — see ./derived-stats.ts —
// because one wireframe renders all three. Re-exported for existing importers.
export type { Spread, MixEntry, Peer, DerivedStats } from './derived-stats';
import type { DerivedStats } from './derived-stats';

export interface Micromarket extends DerivedStats {
  /** Display name, as the tagging data spells it. */
  name: string;
  /** The {micromarket} URL segment. */
  slug: string;
  /** Parent city's display name, or null when no city can host it. */
  parentCity: string | null;
  /** The {city} URL segment, or null when it has no page. */
  citySlug: string | null;
  parentState: string | null;
  stateSlug: string | null;
  /**
   * Whether the site builds a page for this at all. False means writing content
   * for it would render nowhere.
   */
  hasPage: boolean;
}

export interface MicromarketGates {
  micromarketMinListings: number;
  parentCityMinListings: number;
}

/**
 * Throws rather than returning [] on failure. Callers decide what to do: the
 * screens that can degrade catch it, and an empty list would otherwise be
 * indistinguishable from "there are no micromarkets", which would quietly tell
 * an editor there is nothing to write.
 */
export async function fetchMicromarkets(): Promise<{ data: Micromarket[]; gates: MicromarketGates }> {
  const res = await fetch(`${API_BASE}/micromarkets`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET ${API_BASE}/micromarkets failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: Micromarket[]; gates?: MicromarketGates };
  if (!Array.isArray(json.data) || !json.gates) {
    throw new Error(`GET ${API_BASE}/micromarkets returned an unexpected shape`);
  }
  return { data: json.data, gates: json.gates };
}

/** Just the ones the site builds a page for, busiest first. */
export const buildablePages = (all: Micromarket[]): Micromarket[] => all.filter((m) => m.hasPage);

export const findMicromarket = (
  all: Micromarket[],
  citySlug: string,
  slug: string,
): Micromarket | undefined => all.find((m) => m.citySlug === citySlug && m.slug === slug);

/** Public editorial URL; the content record keeps its existing city/slug key. */
export const micromarketOverviewPath = (
  market: Pick<Micromarket, 'stateSlug' | 'citySlug' | 'slug' | 'hasPage' | 'parentState'> | null | undefined,
): string | null => {
  if (!market?.hasPage || !market.parentState) return null;
  const segments = [market.stateSlug, market.citySlug, market.slug];
  return segments.every((segment) => segment && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment))
    ? `/overview/${segments.join('/')}`
    : null;
};
