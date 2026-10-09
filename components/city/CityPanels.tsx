import { EYEBROW, PANEL } from './tokens';
import { formatRentRange, formatSqft } from '@/lib/micromarket-format';
import type { CityOverviewStats, CityStockStats } from '@/lib/city-overview';
import type { StateCityRow } from '@/lib/state-overview';

// Mirrored in the CMS preview. Values arrive computed by the backend; these
// components only format them. Each table keeps real headings on a phone.
const CELL = 'px-4 py-3 align-top';
const HEAD = `${CELL} text-xs font-medium text-wareongo-slate`;
const money = (value: number | undefined) => value === undefined ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const mixText = (entries: CityStockStats['construction']) => entries.map(e => `${e.label} ${e.share}%`).join(' · ') || '—';

export function CorridorPanel({ data }: { data: CityOverviewStats }) {
  return <div className="city-corridor-panel space-y-6">
    <div className="city-corridor-segments grid gap-4 sm:grid-cols-2">
      {([
        ['20,000 sq ft and up', data.segments.large],
        ['Under 20,000 sq ft', data.segments.small],
      ] as const).filter(([, stats]) => stats.listings > 0).map(([label, stats]) => <div key={label} className={`city-corridor-segment ${PANEL} p-5`}>
        <p className={`${EYEBROW} text-wareongo-slate`}>{label}</p>
        <p className="my-3 ui-metric text-wareongo-blue">{money(stats.rent?.median)}<span className="ml-2 text-xs font-normal text-wareongo-slate">/ sq ft / month</span></p>
        <p className="text-sm text-wareongo-slate">{stats.rent ? formatRentRange(stats.rent) : 'Rent not recorded'} · {stats.listings} listings</p>
        <p className="mt-1 text-xs text-wareongo-slate">{mixText(stats.construction)}</p>
      </div>)}
    </div>
    <div className={`city-corridor-table overflow-hidden ${PANEL}`}>
      <div className="overflow-x-auto" role="region" aria-label="Warehouse locations comparison" tabIndex={0}>
        <table className="ui-table min-w-[700px] text-left">
          <caption className="sr-only">{data.corridorMode === 'corridors' ? 'Corridors' : 'Localities'} compared by listing count, asking rent, unit size and construction</caption>
          <thead><tr>{[data.corridorMode === 'corridors' ? 'Corridor' : 'Locality', 'Listings', 'Median rent', 'Rent range', 'Median size', 'Main build'].map(label => <th key={label} scope="col" className={HEAD}>{label}</th>)}</tr></thead>
          <tbody>{data.corridors.map(c => <tr key={c.slug} className="border-t border-ui-line">
            <th scope="row" className={`${CELL} font-medium text-wareongo-blue`}>{c.name}{c.direction && <span className="mt-1 block text-xs font-normal text-wareongo-slate">{c.direction}</span>}</th>
            <td className={`${CELL} tabular-nums`}>{c.listings}</td><td className={`${CELL} whitespace-nowrap tabular-nums`}>{money(c.rent?.median)}</td>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{c.rent ? formatRentRange(c.rent) : '—'}</td>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{c.size ? formatSqft(c.size.median) : '—'}</td><td className={CELL}><span className="city-corridor-build">{c.construction[0]?.label ?? '—'}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-wareongo-slate">Rents are asking rates per sq ft per month; sizes are in sq ft. Each listing is counted once in this table. Unmapped or overlapping locations appear in the unassigned row. Construction shares use listings with a recorded construction type.</p>
  </div>;
}

// The preview's links do not navigate, so city names and cards are plain
// elements here where the site renders router links. A city not in our
// listings is plain text on the site too: no figures, no link.
export function StateCitiesTable({ rows, place }: { rows: StateCityRow[]; place: string }) {
  return <>
    {/* The panel is the scroll region itself: a clipping wrapper around it
        would hide the region's keyboard focus ring. */}
    <div className={`overflow-x-auto ${PANEL}`} role="region" aria-label={`Warehouse cities in ${place}`} tabIndex={0}>
        <table className="ui-table min-w-[560px] text-left">
          <caption className="sr-only">Cities in {place} compared by spaces, asking rent, median unit size and main build</caption>
          <thead><tr>{['City', 'Spaces', 'Rent Range', 'Median Unit', 'Main Build'].map(label => <th key={label} scope="col" className={HEAD}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(({ key, name, stats, link }) => <tr key={key} className="border-t border-ui-line">
            <th scope="row" className={`${CELL} font-medium`}>{link ? <span className="text-wareongo-blue">{name}</span> : name}</th>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{stats ? stats.listings : '—'}</td>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{stats?.rent ? formatRentRange(stats.rent) : '—'}</td>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{stats?.size ? `${formatSqft(stats.size.median)} sq ft` : '—'}</td>
            <td className={CELL}>{stats?.construction[0]?.label ?? '—'}</td>
          </tr>)}</tbody>
        </table>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-wareongo-slate">Rents are asking rates per sq ft per month; sizes are in sq ft. Figures match each city page.</p>
  </>;
}

const cardMeta = ({ name, link }: StateCityRow) =>
  link === 'overview' ? `${name} warehousing overview →` : link === 'listings' ? `Warehouses in ${name} →` : 'No listings yet';

/**
 * Without an uploaded photo the site uses our city's best T1 listing photo,
 * which only the build knows, so the card says so on its ink surface. A city
 * not in our listings has no such photo and keeps the plain surface; it is not
 * a link on the site, so it has no hover state here either.
 */
export function StateCityCards({ rows }: { rows: StateCityRow[] }) {
  return <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
    {rows.map((row) => <li key={row.key} className="min-w-0">
      <div className={row.link ? 'ui-photo-card' : 'ui-photo-card ui-photo-card--static'}>
        {row.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={row.image.url} alt={row.image.alt} loading="lazy" decoding="async" className="ui-photo-card__img" />
          : row.link && <span className="absolute left-4 top-4 z-[1] text-xs text-ui-line">Listing photo chosen at build</span>}
        <div className="ui-photo-card__body">
          <h3 className="ui-photo-card__title">{row.name}</h3>
          <p className="ui-photo-card__meta">{cardMeta(row)}</p>
        </div>
      </div>
    </li>)}
  </ul>;
}

export function RentBySize({ bands }: { bands: CityOverviewStats['rentBySize'] }) {
  return <div className={`city-rent-table overflow-hidden ${PANEL}`}>
    <table className="ui-table text-left">
      <caption className="px-4 py-4 text-left font-semibold text-wareongo-blue">Median asking rent by unit size</caption>
      <thead><tr><th scope="col" className={HEAD}>Unit size</th><th scope="col" className={HEAD}>₹ / sq ft / mo</th><th scope="col" className={`${HEAD} hidden sm:table-cell`}>Priced listings</th></tr></thead>
      <tbody>{bands.map(b => <tr key={b.slug} className="border-t border-ui-line">
        <th scope="row" className={`${CELL} font-medium`}>{b.label}</th><td className={`${CELL} whitespace-nowrap tabular-nums`}>{money(b.rent?.median)}<span className="mt-1 block text-xs text-wareongo-slate sm:hidden">{b.samples.rent} priced listings</span></td><td className={`${CELL} hidden tabular-nums sm:table-cell`}>{b.samples.rent}</td>
      </tr>)}</tbody>
    </table>
    <p className="border-t border-ui-line px-4 py-3 text-xs text-wareongo-slate">Each band includes its lower bound and excludes its upper bound. A dash means no recorded rent.</p>
  </div>;
}

export function SpecSizeComparison({ cohorts }: { cohorts: CityOverviewStats['specsBySize'] }) {
  if (cohorts.large.listings === 0 && cohorts.small.listings === 0) return null;
  const comparison: [string, (s: CityStockStats) => string][] = [
    ['Clear height, median', s => s.clearHeight ? `${s.clearHeight.median} ft` : '—'],
    ['Docks, median per site', s => s.docksMedian === null ? '—' : String(s.docksMedian)],
    ['Construction type', s => mixText(s.construction)],
    ['VDF or FM2 flooring', s => s.engineeredFloorShare === null ? '—' : `${s.engineeredFloorShare}%`],
  ];
  return <div className={`city-spec-comparison mt-6 overflow-hidden ${PANEL}`}>
      <div className="overflow-x-auto" role="region" aria-label="Specification by unit size" tabIndex={0}><table className="ui-table min-w-[480px] text-left">
        <caption className="px-4 py-4 text-left font-semibold text-wareongo-blue">Specification by unit size</caption>
        <thead><tr><th scope="col" className={HEAD}>Specification</th>{(['large', 'small'] as const).map(key => <th key={key} scope="col" className={HEAD}>{key === 'large' ? '50,000 sq ft and up' : 'Under 20,000 sq ft'}<span className="mt-1 block normal-case tracking-normal">{cohorts[key].listings} listings</span></th>)}</tr></thead>
        <tbody>{comparison.map(([label, value]) => <tr key={label} className="border-t border-ui-line"><th scope="row" className={`${CELL} font-medium`}>{label}</th><td className={CELL}>{value(cohorts.large)}</td><td className={CELL}>{value(cohorts.small)}</td></tr>)}</tbody>
      </table></div>
    </div>;
}
