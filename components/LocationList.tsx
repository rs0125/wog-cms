'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { revertLocation } from '@/app/(authed)/locations/actions';
import {
  PAGE_STATE_CLASS,
  PAGE_STATE_HINT,
  PAGE_STATE_LABEL,
  type PageState,
} from '@/lib/editorial-staging';
import type { LocationKind } from '@/lib/location-schema';

export type LocationRow = {
  /** Null until someone writes content for it. */
  id: number | null;
  kind: LocationKind;
  slug: string;
  name: string;
  /** The site path this content renders at. */
  path: string | null;
  /** Cities group under their state; states have no group. */
  group: string | null;
  /** Visible warehouses in scope — how the team picks what to write next. */
  listings: number;
  state: PageState;
  /** False when the page has never been deployed, so there's nothing to revert to. */
  revertable: boolean;
};

/**
 * Every city or state the site would carry an editorial page for, with any
 * written content matched onto it.
 *
 * Deliberately not "the rows this app holds" — the same reasoning as
 * MicromarketList. Listing only what has been written makes the remaining work
 * invisible, and an editor typing a slug by hand has no way to know whether it
 * matches a real page. So the rows come from live inventory, the written ones
 * are matched on, and the listing count rides along because that is what decides
 * which page is worth writing next.
 */
export default function LocationList({
  kind,
  pages,
  orphans,
  belowThreshold,
}: {
  kind: LocationKind;
  pages: LocationRow[];
  /** Written content whose slug matches no location the site builds. */
  orphans: LocationRow[];
  /** Locations with too little inventory to be worth a page yet. */
  belowThreshold: { name: string; listings: number }[];
}) {
  const [showThin, setShowThin] = useState(false);
  const noun = kind === 'CITY' ? 'city' : 'state';
  const plural = kind === 'CITY' ? 'cities' : 'states';

  if (pages.length === 0 && orphans.length === 0) {
    return (
      <p className="rounded-2xl border border-wareongo-blue/20 bg-white p-6 text-sm text-wareongo-slate">
        No {plural} found in the live inventory. That usually means the warehouse query failed rather
        than that there are none — check the server logs.
      </p>
    );
  }

  // Cities read best grouped by state, the way micromarkets group by city.
  // States have nothing above them, so they stay one list.
  const groups =
    kind === 'CITY'
      ? [...new Set(pages.map((p) => p.group ?? 'Unknown state'))].sort()
      : [null];

  return (
    <div className="space-y-8">
      {orphans.length > 0 && (
        <section className="rounded-2xl border border-wareongo-sienna/40 bg-wareongo-sienna/5 p-4">
          <h2 className="mb-1 text-sm font-semibold text-wareongo-sienna">
            {orphans.length} saved overview{orphans.length === 1 ? '' : 's'} need attention
          </h2>
          <p className="mb-3 text-xs text-wareongo-slate">
            These locations have too few listings or their slugs no longer match the inventory.
            Their saved content remains available to edit.
          </p>
          <ul className="space-y-1.5">
            {orphans.map((o) => (
              <li key={o.id}>
                <Link href={`/locations/${o.id}`} className="text-sm text-wareongo-blue hover:underline">
                  {o.name} — edit overview ↗
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((group) => {
        const rows = group === null ? pages : pages.filter((p) => (p.group ?? 'Unknown state') === group);
        const written = rows.filter((r) => r.state !== 'STUB').length;
        return (
          <section key={group ?? 'all'}>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h2 className="cms-eyebrow">{group ?? `All ${plural}`}</h2>
              <span className="text-[11px] text-wareongo-slate">
                {rows.length} {rows.length === 1 ? noun : plural} · {written} written
              </span>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.slug}
                  className="flex items-center gap-3 rounded-2xl border border-wareongo-blue/20 bg-white p-3.5 hover:bg-wareongo-blue/5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-wareongo-blue">{r.name}</span>
                    <span className="block truncate text-xs text-wareongo-slate">{r.path ?? "Overview URL unavailable"}</span>
                  </div>

                  <span
                    title={`${r.listings} visible warehouses in ${r.name}`}
                    className="shrink-0 text-xs tabular-nums text-wareongo-slate"
                  >
                    {r.listings} listing{r.listings === 1 ? '' : 's'}
                  </span>

                  <span
                    title={PAGE_STATE_HINT[r.state]}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${PAGE_STATE_CLASS[r.state]}`}
                  >
                    {PAGE_STATE_LABEL[r.state]}
                  </span>

                  {r.state === 'STAGED' && r.revertable && r.id !== null && <ResetPage id={r.id} />}

                  {r.id === null ? (
                    // Slug carried through, so it can't be mistyped into content
                    // that renders nowhere.
                    <Link
                      href={`/locations/new?kind=${r.kind}&slug=${encodeURIComponent(r.slug)}&name=${encodeURIComponent(r.name)}`}
                      className="cms-btn shrink-0"
                    >
                      Write
                    </Link>
                  ) : (
                    <Link href={`/locations/${r.id}`} className="cms-btn shrink-0">
                      Edit
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {belowThreshold.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowThin((v) => !v)}
            aria-expanded={showThin}
            className="flex w-full items-center gap-3 rounded-2xl border border-wareongo-blue/25 bg-white p-3.5 text-left transition-colors hover:border-wareongo-blue/50 hover:bg-wareongo-blue/[0.03]"
          >
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-wareongo-blue/[0.07] text-wareongo-blue transition-transform ${
                showThin ? 'rotate-90' : ''
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
                <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-wareongo-blue">Too thin for a page</span>
              <span className="mt-0.5 block text-xs text-wareongo-slate">
                {belowThreshold.length} {plural} with too little inventory to write about yet
              </span>
            </span>
          </button>
          {showThin && (
            <div className="mt-2.5 rounded-2xl border border-wareongo-blue/20 bg-white p-4">
              <p className="mb-3 text-xs text-wareongo-slate">
                These URLs all work — they serve the plain listing grid. What they don&apos;t have is
                enough inventory for the computed figures to mean anything: a median over three
                listings describes those three listings, not a market. Write them once they fill up.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-wareongo-slate">
                {belowThreshold.map((l) => (
                  <li key={l.name} className="tabular-nums">
                    {l.name} <span className="opacity-60">{l.listings}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Discards a page's staged edits, restoring the last deployed version. */
function ResetPage({ id }: { id: number }) {
  const [armed, setArmed] = useState(false);
  const [error, action, pending] = useActionState(revertLocation, undefined);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title="Discard the unpublished edits and restore the version that is live"
        className="cms-btn shrink-0"
      >
        Reset
      </button>
    );
  }

  return (
    <form action={action} className="flex shrink-0 items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <span className="text-[11px] text-wareongo-slate">Discard edits?</span>
      <button type="submit" disabled={pending} className="cms-btn-danger">
        {pending ? '…' : 'Reset'}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="cms-btn">
        No
      </button>
      {error && <span className="text-[11px] text-wareongo-sienna">{error}</span>}
    </form>
  );
}
