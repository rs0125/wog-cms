/**
 * State overview additions: the state's city list and its neighbours.
 *
 * Mirrors the website loader, which resolves the same list from the generated
 * (published-only) content at build. Here "published" is the row's status, so
 * the preview shows what the next build would link.
 */
import type { LocationPage } from '@prisma/client';
import {
  statOverridesSchema,
  NO_OVERRIDES,
  type EditorialImage,
  type StatOverrides,
} from './editorial-schema';
import { applyOverrides } from './micromarket-format';
import { findLocation, locationOverviewPath, type Location } from './locations-api';
import type { DerivedStats } from './derived-stats';
import { MAX_STATE_CITIES, type StateCityEntry } from './location-schema';

export interface StateOverviewContent {
  citiesHeading?: string | null;
  /** The editor's city list; null or empty means the default four. */
  stateCities?: StateCityEntry[] | null;
}

/** What a state preview needs from every location page. */
export interface LocationPageSummary {
  kind: LocationPage['kind'];
  slug: string;
  status: LocationPage['status'];
  statOverrides: StatOverrides;
}

/** Json columns are parsed, not cast: a malformed value reads as absent. */
export const summarisePages = (
  rows: Pick<LocationPage, 'kind' | 'slug' | 'status' | 'statOverrides'>[],
): LocationPageSummary[] => rows.map((row) => ({
  kind: row.kind,
  slug: row.slug,
  status: row.status,
  statOverrides: statOverridesSchema.safeParse(row.statOverrides).data ?? NO_OVERRIDES,
}));

/** How many cities the page lists when the editor has not chosen them. */
export const DEFAULT_STATE_CITIES = 4;

const byListings = (a: Location, b: Location) => b.listings - a.listings || a.name.localeCompare(b.name);

/** The state's /locations cities, busiest first: the ones the editor can pick. */
export const stateCandidates = (stateSlug: string, cities: Location[]): Location[] =>
  cities.filter((c) => c.stateSlug === stateSlug).sort(byListings);

/** The list a state shows without one of its own: its four busiest cities. */
export const defaultStateCities = (candidates: Location[]): StateCityEntry[] =>
  candidates.slice(0, DEFAULT_STATE_CITIES).map(({ name, slug }) => ({ name, slug, image: null }));

export interface StateCityRow {
  /** Unique within the list, for React keys. */
  key: string;
  name: string;
  /** One of our cities; null for a city not in our listings. */
  slug: string | null;
  /** The figures that city's own hero shows; null (dashes) for a city not in our listings. */
  stats: DerivedStats | null;
  /** Where the site links it: the published overview, else its listing page. */
  link: 'overview' | 'listings' | null;
  /** The editor's photo. Without one, the build picks our city's best listing photo. */
  image: EditorialImage | null;
}

export interface StateCities {
  rows: StateCityRow[];
  /** The state's other cities with listing pages. Plain text, never links. */
  others: { slug: string; name: string }[];
}

const published = (pages: LocationPageSummary[], kind: LocationPage['kind'], slug: string) =>
  pages.find((p) => p.kind === kind && p.slug === slug && p.status === 'PUBLISHED');

export function stateCities(
  stateSlug: string,
  cities: Location[],
  pages: LocationPageSummary[],
  entries?: StateCityEntry[] | null,
): StateCities {
  const candidates = stateCandidates(stateSlug, cities);
  // The site skips unnamed entries, so a city still being typed is not a row yet.
  const chosen = entries?.filter((entry) => entry.name.trim()).slice(0, MAX_STATE_CITIES);
  const list = chosen?.length ? chosen : defaultStateCities(candidates);
  const rows = list.map((entry, i): StateCityRow => {
    // A slug that is no longer one of the state's cities reads as a city we
    // have no listings in, rather than a broken row.
    const city = entry.slug ? candidates.find((c) => c.slug === entry.slug) : undefined;
    // Indexed: an unsaved list can repeat a name until validation rejects it.
    if (!city) return { key: `${i}:other`, name: entry.name, slug: null, stats: null, link: null, image: entry.image };
    const page = published(pages, 'CITY', city.slug);
    const overview = page && locationOverviewPath(city) ? page : undefined;
    // The merge the city page's own loader makes before applying its overrides.
    const merged = city.cityOverview ? { ...city, ...city.cityOverview.summary } : city;
    return {
      key: `${i}:${city.slug}`, name: entry.name, slug: city.slug, image: entry.image,
      link: overview ? 'overview' : 'listings',
      stats: overview ? applyOverrides(merged, overview.statOverrides) : merged,
    };
  });
  const listed = new Set(rows.map((r) => r.slug));
  const others = candidates
    .filter((c) => c.hasPage && !listed.has(c.slug))
    .map(({ slug, name }) => ({ slug, name }));
  return { rows, others };
}

/**
 * Bordering states with a published overview, in the backend's order. Null when
 * the backend predates `nearbyStates`, so the page keeps its "Other states" row.
 */
export function nearbyStates(
  state: Location | null,
  states: Location[],
  pages: LocationPageSummary[],
): { name: string; slug: string; path: string }[] | null {
  if (!state?.nearbyStates) return null;
  return state.nearbyStates.flatMap(({ name, slug }) => {
    const match = findLocation(states, slug);
    const path = match && published(pages, 'STATE', slug) ? locationOverviewPath(match) : null;
    return path ? [{ name, slug, path }] : [];
  });
}

/** "A, B and C" */
export const listText = (names: string[]): string =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('');
