/**
 * The figures an editorial listing page renders, whatever its scope.
 *
 * Derived by the backend from live inventory — one derivation, read by the site
 * and by this app, so an editor cannot be shown a median the site would not
 * publish. Mirrors the website's src/services/derivedStats.ts.
 */

export interface Spread {
  min: number;
  median: number;
  max: number;
}

export interface MixEntry {
  label: string;
  count: number;
  /** Percentage of the measured set, rounded. */
  share: number;
}

/** One bar of the peer rent chart. */
export interface Peer {
  name: string;
  slug: string;
  /**
   * Where the bar links. Supplied by the backend so nothing downstream has to
   * know which scope it is drawing.
   */
  path: string;
  /** Micromarket bars only. */
  citySlug?: string | null;
  medianRent: number;
  /** The location whose page this chart is on, highlighted in it. */
  isSelf: boolean;
}

/** Everything the shared form, preview and overrides editor read. */
export interface DerivedStats {
  /** Everything in scope, land and build-to-suit included. */
  listings: number;
  /** Built stock only — what every figure below is computed from. */
  measured: number;
  rent: Spread | null;
  size: Spread | null;
  clearHeight: Spread | null;
  docksMedian: number | null;
  construction: MixEntry[];
  flooring: MixEntry[];
  fireNoc: number;
  commercialClu: number;
  /** Which warehouses are in scope. */
  listingIds: number[];
  /**
   * Bars for the peer chart: the busiest priced comparables plus this location.
   * Empty when there is nothing to compare against, and the section hides
   * itself.
   */
  peers: Peer[];
}
