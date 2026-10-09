'use client';

import { useEffect, useRef } from 'react';
import SingleImagePicker from './SingleImagePicker';
import { keyAll, keyed, removeAt, replaceAt, swap, type Keyed } from '@/lib/keyed';
import { MAX_STATE_CITIES, type StateCityEntry } from '@/lib/location-schema';
import { DEFAULT_STATE_CITIES, defaultStateCities } from '@/lib/state-overview';
import type { Location } from '@/lib/locations-api';

/**
 * Which cities a state page lists, in order.
 *
 * Null is the default: the state's four busiest cities, recomputed from live
 * listings on every build, so most states never need a list of their own. A
 * custom list is saved as written and no longer follows the inventory.
 *
 * Every control is state-backed for the same reason the rest of the form is:
 * React 19 resets an uncontrolled form after an action, failed saves included.
 */
export default function StateCitiesEditor({
  value,
  onChange,
  candidates,
}: {
  value: Keyed<StateCityEntry>[] | null;
  onChange: (next: Keyed<StateCityEntry>[] | null) => void;
  /** The state's cities in our listings, busiest first. */
  candidates: Location[];
}) {
  // Photo uploads finish asynchronously. Apply them to the list as it is then,
  // so a reorder, removal or edit made during the upload is not reverted.
  const latest = useRef({ value, onChange });
  useEffect(() => { latest.current = { value, onChange }; }, [value, onChange]);
  const setImage = (key: string, image: StateCityEntry['image']) => {
    const { value: current, onChange: change } = latest.current;
    const index = current?.findIndex((item) => item.key === key) ?? -1;
    // Switched to the default list, or the city was removed, meanwhile.
    if (!current || index === -1) return;
    change(replaceAt(current, index, { ...current[index].value, image }));
  };

  if (!value) {
    const defaults = candidates.slice(0, DEFAULT_STATE_CITIES);
    return (
      <div className="cms-card space-y-3">
        <div>
          <p className="cms-label">Cities on the page</p>
          <p className="cms-hint mt-0">The default: this state&apos;s {DEFAULT_STATE_CITIES} cities with the most listings, updated on every build.</p>
        </div>
        {defaults.length > 0 ? (
          <ol className="text-sm text-wareongo-charcoal">
            {defaults.map((city, i) => (
              <li key={city.slug} className="flex items-baseline justify-between gap-3 border-t border-ui-line py-2 first:border-t-0">
                <span>{i + 1}. {city.name}</span>
                <span className="text-xs tabular-nums text-wareongo-slate">{city.listings} listings</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-wareongo-slate">No cities in this state&apos;s listings yet, so the page has no cities section unless you add cities by hand.</p>
        )}
        <button type="button" className="cms-btn" onClick={() => onChange(keyAll(defaultStateCities(candidates)))}>
          Customise cities
        </button>
      </div>
    );
  }

  const used = new Set(value.map(({ value: entry }) => entry.slug));
  const next = candidates.find((c) => !used.has(c.slug));
  const set = (i: number, entry: StateCityEntry) => onChange(replaceAt(value, i, entry));

  return (
    <div className="space-y-3">
      <p className="cms-hint mt-0">
        A custom list, in page order. It is saved as written and no longer follows listing counts; use the default list to go back to the {DEFAULT_STATE_CITIES} busiest cities.
      </p>
      {value.map(({ key, value: entry }, i) => {
        const known = candidates.some((c) => c.slug === entry.slug);
        return (
          <div key={key} className="cms-card">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-wareongo-slate">#{i + 1}</span>
              <div className="ml-auto flex max-w-full flex-wrap gap-1">
                <button type="button" className="cms-btn" aria-label={`Move ${entry.name || 'city'} up`} onClick={() => onChange(swap(value, i, i - 1))} disabled={i === 0}>↑</button>
                <button type="button" className="cms-btn" aria-label={`Move ${entry.name || 'city'} down`} onClick={() => onChange(swap(value, i, i + 1))} disabled={i === value.length - 1}>↓</button>
                <button type="button" className="cms-btn-danger" onClick={() => onChange(removeAt(value, i))}>Remove</button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="cms-label" htmlFor={`${key}-city`}>City</label>
                <select
                  id={`${key}-city`}
                  value={entry.slug ?? ''}
                  onChange={(e) => {
                    const city = candidates.find((c) => c.slug === e.target.value);
                    set(i, city ? { ...entry, slug: city.slug, name: city.name } : { ...entry, slug: null, name: '' });
                  }}
                  className="cms-input"
                >
                  {candidates.map((city) => (
                    <option key={city.slug} value={city.slug} disabled={used.has(city.slug) && city.slug !== entry.slug}>
                      {city.name} · {city.listings} listings
                    </option>
                  ))}
                  {/* Kept rather than dropped, so a city that has left the
                      listings (or an inventory outage) never rewrites the list. */}
                  {entry.slug && !known && <option value={entry.slug}>{entry.name} (not in current listings)</option>}
                  <option value="">Other city (not in our listings)</option>
                </select>
              </div>
              {entry.slug === null && (
                <div>
                  <label className="cms-label" htmlFor={`${key}-name`}>City name</label>
                  <input
                    id={`${key}-name`}
                    value={entry.name}
                    maxLength={60}
                    placeholder="As it should read on the page"
                    onChange={(e) => set(i, { ...entry, name: e.target.value })}
                    className="cms-input"
                  />
                </div>
              )}
            </div>
            {entry.slug === null
              ? <p className="cms-hint">Not in our listings: the row shows dashes, the card shows &ldquo;No listings yet&rdquo;, and neither links.</p>
              : !known && <p className="cms-hint text-wareongo-sienna">This city is not in the state&apos;s current listings, so the page shows it without figures or a link.</p>}

            <div className="mt-3">
              <span className="cms-label">Card photo <span className="ml-1 normal-case tracking-normal opacity-70">optional</span></span>
              <SingleImagePicker value={entry.image} onChange={(image) => setImage(key, image)} ratio="16:9" />
              <p className="cms-hint">
                {entry.slug === null
                  ? 'Without a photo the card keeps its plain dark surface.'
                  : 'Without a photo the card uses this city’s best T1 listing photo, chosen at build.'}
              </p>
            </div>
          </div>
        );
      })}

      {value.length === 0 && <p className="text-sm text-wareongo-slate">An empty list saves as the default.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="cms-btn"
          disabled={value.length >= MAX_STATE_CITIES}
          onClick={() => onChange([...value, keyed<StateCityEntry>(next ? { name: next.name, slug: next.slug, image: null } : { name: '', slug: null, image: null })])}
        >
          + City
        </button>
        <button type="button" className="cms-btn" onClick={() => onChange(null)}>Use default list</button>
        <span className="text-xs text-wareongo-slate">Up to {MAX_STATE_CITIES} cities.</span>
      </div>
    </div>
  );
}
