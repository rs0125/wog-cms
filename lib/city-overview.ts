/** City overview analytics, computed once by the backend. */
import type { DerivedStats, Spread, Peer } from './derived-stats';

export interface CityStockStats extends Omit<DerivedStats, 'listingIds' | 'peers'> {
  docks: Spread | null;
  engineeredFloorShare: number | null;
  samples: { rent: number; size: number; clearHeight: number; docks: number; construction: number; flooring: number };
}
export interface CityCorridor extends CityStockStats { slug: string; name: string; direction: string }
export interface CityOverviewStats {
  version: 1;
  summary: CityStockStats;
  excluded: { unbuilt: number; underConstruction: number };
  corridorMode: 'corridors' | 'localities';
  corridors: CityCorridor[];
  segments: { large: CityStockStats; small: CityStockStats };
  rentBySize: (CityStockStats & { slug: string; label: string; min: number; max: number | null })[];
  specsBySize: { large: CityStockStats; small: CityStockStats };
  micromarkets: { slug: string; name: string; listings: number; path: string | null }[];
  comparisonCities: Peer[];
  nearbyLabel: string;
  nearbyCities: { name: string; slug: string; path: string }[];
}
export interface CityOverviewContent {
  corridorHeading?: string | null;
  corridorProse?: string | null;
  complianceHeading?: string | null;
  complianceProse?: string | null;
}
