/**
 * City and state data, read from the backend.
 *
 * The twin of ./micromarkets-api.ts one and two levels up, and for the same
 * reason: this app derives none of it. Which cities and states exist, which have
 * enough inventory to carry an editorial page, and every figure computed from
 * their listings all come from `GET /locations` — see
 * WareOnGo-Website-Backend services/locationService.js, which imports its
 * derivation from micromarketService so a city median and a micromarket median
 * inside it are computed by the same code.
 */

import type { DerivedStats } from './derived-stats';
import type { LocationKind } from './location-schema';

const API_BASE = (process.env.WAREONGO_API_BASE ?? 'https://wareongo-website-backend.onrender.com').replace(
  /\/$/,
  '',
);

export interface Location extends DerivedStats {
  kind: LocationKind;
  /** Canonical display name, aliases resolved ("Bangalore" → "Bengaluru"). */
  name: string;
  /** The URL segment. Unique only within its kind. */
  slug: string;
  /** Canonical page path on the site. */
  path: string;
  /** Cities only: the state most of their listings sit in. */
  parentState: string | null;
  stateSlug: string | null;
  /**
   * Whether this one is worth an editorial page. Note what it does not gate:
   * every city and state page already exists and renders its listing grid
   * whatever the count, so a false here means the wireframe would be padding
   * rather than that the URL is missing.
   */
  hasPage: boolean;
}

export interface LocationGates {
  locationPageMinListings: number;
}

/**
 * Throws rather than returning empty on failure, matching fetchMicromarkets:
 * an empty list is indistinguishable from "there are no cities", which would
 * quietly tell an editor there is nothing to write. Callers that can degrade
 * catch it.
 */
export async function fetchLocations(): Promise<{
  cities: Location[];
  states: Location[];
  gates: LocationGates;
}> {
  const res = await fetch(`${API_BASE}/locations`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET ${API_BASE}/locations failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    data?: { cities?: Location[]; states?: Location[] };
    gates?: LocationGates;
  };
  if (!Array.isArray(json.data?.cities) || !Array.isArray(json.data?.states) || !json.gates) {
    throw new Error(`GET ${API_BASE}/locations returned an unexpected shape`);
  }
  return { cities: json.data.cities, states: json.data.states, gates: json.gates };
}

export const listFor = (
  all: { cities: Location[]; states: Location[] },
  kind: LocationKind,
): Location[] => (kind === 'CITY' ? all.cities : all.states);

/** Just the ones worth a page, busiest first. */
export const eligible = (list: Location[]): Location[] => list.filter((l) => l.hasPage);

export const findLocation = (
  list: Location[],
  slug: string,
): Location | undefined => list.find((l) => l.slug === slug);

export const KIND_LABEL: Record<LocationKind, string> = { CITY: 'City', STATE: 'State' };
export const KIND_PLURAL: Record<LocationKind, string> = { CITY: 'Cities', STATE: 'States' };

/** A public overview requires eligible inventory and canonical geography. */
export const locationOverviewPath = (location: Pick<Location, 'kind' | 'slug' | 'stateSlug' | 'hasPage'>): string | null => {
  if (!location.hasPage) return null;
  const segments = location.kind === 'STATE' ? [location.slug] : [location.stateSlug, location.slug];
  if (!segments.every(segment => segment && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment))) return null;
  if (location.kind === 'STATE') return `/overview/${location.slug}`;
  return location.stateSlug ? `/overview/${location.stateSlug}/${location.slug}` : null;
};
