import { EYEBROW, PANEL } from './tokens';
import { formatRentRange, formatSqft } from '@/lib/micromarket-format';
import type { CityOverviewStats, CityStockStats } from '@/lib/city-overview';

// Mirrored in the CMS preview. Values arrive computed by the backend; these
// components only format them. Each table keeps real headings on a phone.
const CELL = 'px-4 py-3 align-top';
const HEAD = `${CELL} text-[10px] font-semibold uppercase tracking-[0.14em] text-wareongo-slate`;
const money = (value: number | undefined) => value === undefined ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const mixText = (entries: CityStockStats['construction']) => entries.map(e => `${e.label} ${e.share}%`).join(' · ') || '—';

export function CorridorPanel({ data }: { data: CityOverviewStats }) {
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2">
      {([
        ['20,000 sq ft and up', data.segments.large],
        ['Under 20,000 sq ft', data.segments.small],
      ] as const).filter(([, stats]) => stats.listings > 0).map(([label, stats]) => <div key={label} className={`${PANEL} p-5`}>
        <p className={`${EYEBROW} text-wareongo-slate`}>{label}</p>
        <p className="my-3 text-3xl font-bold tabular-nums text-wareongo-blue">{money(stats.rent?.median)}<span className="ml-2 text-xs font-normal text-wareongo-slate">/ sq ft / month</span></p>
        <p className="text-sm text-wareongo-slate">{stats.rent ? formatRentRange(stats.rent) : 'Rent not recorded'} · {stats.listings} listings</p>
        <p className="mt-1 text-xs text-wareongo-slate">{mixText(stats.construction)}</p>
      </div>)}
    </div>
    <div className={`overflow-hidden ${PANEL}`}>
      <div className="overflow-x-auto" role="region" aria-label="Warehouse locations comparison" tabIndex={0}>
        <table className="w-full min-w-[700px] text-left text-sm">
          <caption className="sr-only">{data.corridorMode === 'corridors' ? 'Corridors' : 'Localities'} compared by listing count, asking rent, unit size and construction</caption>
          <thead className="bg-wareongo-blue/5"><tr>{[data.corridorMode === 'corridors' ? 'Corridor' : 'Locality', 'Listings', 'Median rent', 'Rent range', 'Median size', 'Main build'].map(label => <th key={label} scope="col" className={HEAD}>{label}</th>)}</tr></thead>
          <tbody>{data.corridors.map(c => <tr key={c.slug} className="border-t border-wareongo-blue/15">
            <th scope="row" className={`${CELL} font-medium text-wareongo-blue`}>{c.name}{c.direction && <span className="mt-1 block text-xs font-normal text-wareongo-slate">{c.direction}</span>}</th>
            <td className={`${CELL} tabular-nums`}>{c.listings}</td><td className={`${CELL} whitespace-nowrap tabular-nums`}>{money(c.rent?.median)}</td>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{c.rent ? formatRentRange(c.rent) : '—'}</td>
            <td className={`${CELL} whitespace-nowrap tabular-nums`}>{c.size ? formatSqft(c.size.median) : '—'}</td><td className={CELL}>{c.construction[0]?.label ?? '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-wareongo-slate">Rents are asking rates per sq ft per month; sizes are in sq ft. Each listing is counted once in this table. Unmapped or overlapping locations appear in the unassigned row. Construction shares use listings with a recorded construction type.</p>
  </div>;
}

export function RentBySize({ bands }: { bands: CityOverviewStats['rentBySize'] }) {
  return <div className={`overflow-hidden ${PANEL}`}>
    <table className="w-full text-left text-sm">
      <caption className="px-4 py-4 text-left font-semibold text-wareongo-blue">Median asking rent by unit size</caption>
      <thead className="bg-wareongo-blue/5"><tr><th scope="col" className={HEAD}>Unit size</th><th scope="col" className={HEAD}>₹ / sq ft / mo</th><th scope="col" className={`${HEAD} hidden sm:table-cell`}>Priced listings</th></tr></thead>
      <tbody>{bands.map(b => <tr key={b.slug} className="border-t border-wareongo-blue/15">
        <th scope="row" className={`${CELL} font-medium`}>{b.label}</th><td className={`${CELL} whitespace-nowrap tabular-nums`}>{money(b.rent?.median)}<span className="mt-1 block text-[11px] text-wareongo-slate sm:hidden">{b.samples.rent} priced listings</span></td><td className={`${CELL} hidden tabular-nums sm:table-cell`}>{b.samples.rent}</td>
      </tr>)}</tbody>
    </table>
    <p className="border-t border-wareongo-blue/15 px-4 py-3 text-xs text-wareongo-slate">Each band includes its lower bound and excludes its upper bound. A dash means no recorded rent.</p>
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
  return <div className={`mt-6 overflow-hidden ${PANEL}`}>
      <div className="overflow-x-auto" role="region" aria-label="Specification by unit size" tabIndex={0}><table className="w-full min-w-[480px] text-left text-sm">
        <caption className="px-4 py-4 text-left font-semibold text-wareongo-blue">Specification by unit size</caption>
        <thead className="bg-wareongo-blue/5"><tr><th scope="col" className={HEAD}>Specification</th>{(['large', 'small'] as const).map(key => <th key={key} scope="col" className={HEAD}>{key === 'large' ? '50,000 sq ft and up' : 'Under 20,000 sq ft'}<span className="mt-1 block normal-case tracking-normal">{cohorts[key].listings} listings</span></th>)}</tr></thead>
        <tbody>{comparison.map(([label, value]) => <tr key={label} className="border-t border-wareongo-blue/15"><th scope="row" className={`${CELL} font-medium`}>{label}</th><td className={CELL}>{value(cohorts.large)}</td><td className={CELL}>{value(cohorts.small)}</td></tr>)}</tbody>
      </table></div>
    </div>;
}
