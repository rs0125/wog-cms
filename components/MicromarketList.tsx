'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { revertMicromarket } from '@/app/(authed)/micromarkets/actions';
import {
  PAGE_STATE_CLASS,
  PAGE_STATE_HINT,
  PAGE_STATE_LABEL,
  type PageState,
} from '@/lib/micromarket-staging';

export type MicromarketRow = {
  /** Null until someone writes content for it. */
  id: number | null;
  citySlug: string;
  slug: string;
  name: string;
  /** Parent city's display name, for the group heading. */
  city: string;
  /** Visible warehouses carrying this tag — how the team picks what to write next. */
  listings: number;
  state: PageState;
  /** False when the page has never been deployed, so there's nothing to revert to. */
  revertable: boolean;
};

/**
 * Every micromarket the site builds a page for, grouped by city.
 *
 * Deliberately not "the rows this app holds". Listing only what has been written
 * makes the work invisible: nobody can see what is left, and an editor typing a
 * slug by hand has no way to know it matches a real page. So the rows come from
 * live inventory, the written ones are matched onto them, and the listing count
 * rides along because that is what decides which belt is worth writing next.
 */
export default function MicromarketList({
  pages,
  orphans,
  belowThreshold,
}: {
  pages: MicromarketRow[];
  /** Written content whose slug pair matches no page the site builds. */
  orphans: MicromarketRow[];
  /** Micromarkets with too little inventory to earn a page yet. */
  belowThreshold: { name: string; city: string | null; listings: number }[];
}) {
  const [showThin, setShowThin] = useState(false);

  if (pages.length === 0 && orphans.length === 0) {
    return (
      <p className="rounded-2xl border border-wareongo-blue/20 bg-white p-6 text-sm text-wareongo-slate">
        No micromarkets found in the live inventory. That usually means the warehouse query failed
        rather than that there are none — check the server logs.
      </p>
    );
  }

  const cities = [...new Set(pages.map((p) => p.city))].sort();

  return (
    <div className="space-y-8">
      {orphans.length > 0 && (
        <section className="rounded-2xl border border-wareongo-sienna/40 bg-wareongo-sienna/5 p-4">
          <h2 className="mb-1 text-sm font-semibold text-wareongo-sienna">
            {orphans.length} page{orphans.length === 1 ? '' : 's'} match no live micromarket
          </h2>
          <p className="mb-3 text-xs text-wareongo-slate">
            The city and micromarket slugs have to match a URL the site actually builds. These
            don&apos;t, so whatever is written in them renders nowhere — the URL falls back to the
            plain grid, with no error anywhere. Usually a typo in one of the two slugs.
          </p>
          <ul className="space-y-1.5">
            {orphans.map((o) => (
              <li key={o.id}>
                <Link href={`/micromarkets/${o.id}`} className="text-sm text-wareongo-blue hover:underline">
                  {o.name} — /listings/city/{o.citySlug}/{o.slug} ↗
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cities.map((city) => {
        const rows = pages.filter((p) => p.city === city);
        const written = rows.filter((r) => r.state !== 'STUB').length;
        return (
          <section key={city}>
            <div className="mb-2.5 flex items-baseline gap-2">
              <h2 className="cms-eyebrow">{city}</h2>
              <span className="text-[11px] text-wareongo-slate">
                {rows.length} micromarket{rows.length === 1 ? '' : 's'} · {written} written
              </span>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={`${r.citySlug}/${r.slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-wareongo-blue/20 bg-white p-3.5 hover:bg-wareongo-blue/5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-wareongo-blue">{r.name}</span>
                    <span className="block truncate text-xs text-wareongo-slate">
                      /listings/city/{r.citySlug}/{r.slug}
                    </span>
                  </div>

                  <span
                    title={`${r.listings} visible warehouses tagged ${r.name}`}
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
                    // Slugs carried through, so the pair can't be mistyped into
                    // content that renders nowhere.
                    <Link
                      href={`/micromarkets/new?citySlug=${encodeURIComponent(r.citySlug)}&slug=${encodeURIComponent(r.slug)}&name=${encodeURIComponent(r.name)}`}
                      className="cms-btn shrink-0"
                    >
                      Write
                    </Link>
                  ) : (
                    <Link href={`/micromarkets/${r.id}`} className="cms-btn shrink-0">
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
                {belowThreshold.length} micromarkets the site doesn&apos;t build a page for yet
              </span>
            </span>
          </button>
          {showThin && (
            <div className="mt-2.5 rounded-2xl border border-wareongo-blue/20 bg-white p-4">
              <p className="mb-3 text-xs text-wareongo-slate">
                The site only builds a micromarket page once the belt carries five or more listings
                and sits under a city with six or more. Below that the page would be thinner than the
                city page it competes with, so there is no URL to write for yet.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-wareongo-slate">
                {belowThreshold.map((m) => (
                  <li key={`${m.city}-${m.name}`} className="tabular-nums">
                    {m.name} <span className="opacity-60">{m.listings}</span>
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
  const [error, action, pending] = useActionState(revertMicromarket, undefined);

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
