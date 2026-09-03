'use client';

import { useState } from 'react';
import { hasAnyOverride, type StatOverrides } from '@/lib/micromarket-schema';
import { formatSqft } from '@/lib/micromarket-format';
import type { Micromarket } from '@/lib/micromarkets-api';

/**
 * Corrections to the figures the page derives from live listings.
 *
 * Every box shows what the site would publish if left alone, in grey, next to
 * the box. That reference is the difference between a usable screen and a trap:
 * asking someone to correct a median without showing them the median invites a
 * guess, and a guess typed into an override is indistinguishable from data.
 *
 * Collapsed unless something is set, because the right number of overrides is
 * usually zero — the point of computing these is that they stay true as
 * inventory moves. This is for the cases where the source data is wrong.
 */

type SpreadKey = 'rent' | 'size' | 'clearHeight';
type Bound = 'min' | 'median' | 'max';
type ScalarKey = 'docksMedian' | 'fireNoc' | 'commercialClu';

const SPREADS: { key: SpreadKey; label: string; unit: string; format?: (n: number) => string }[] = [
  { key: 'rent', label: 'Asking rent', unit: '₹ per sq ft per month' },
  { key: 'size', label: 'Unit size', unit: 'sq ft', format: formatSqft },
  { key: 'clearHeight', label: 'Clear height', unit: 'feet' },
];

const SCALARS: { key: ScalarKey; label: string; unit: string }[] = [
  { key: 'docksMedian', label: 'Docks', unit: 'median per site' },
  { key: 'fireNoc', label: 'Fire NOC on file', unit: 'listings' },
  { key: 'commercialClu', label: 'Commercial CLU', unit: 'listings' },
];

/** '' → null, so "cleared" and "never set" are the same stored value. */
const asNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function StatOverridesEditor({
  value,
  computed,
  onChange,
}: {
  value: StatOverrides;
  /** What the site would publish with no overrides. Null when unknown. */
  computed: Micromarket | null;
  onChange: (next: StatOverrides) => void;
}) {
  const [open, setOpen] = useState(() => hasAnyOverride(value));

  const set = [value.rent, value.size, value.clearHeight]
    .flatMap((s) => [s.min, s.median, s.max])
    .concat([value.docksMedian, value.fireNoc, value.commercialClu])
    .filter((v) => v !== null).length;

  const computedFor = (key: SpreadKey, bound: Bound) => computed?.[key]?.[bound] ?? null;

  const Field = ({
    name,
    current,
    reference,
    format,
    overCount,
    onInput,
  }: {
    name: string;
    current: number | null;
    reference: number | null;
    format?: (n: number) => string;
    /**
     * For the compliance counts: the built-stock total they are a share of.
     * A correction above it is arithmetically impossible — the page can only
     * clamp the percentage — so it is called out where it is typed.
     */
    overCount?: number;
    onInput: (raw: string) => void;
  }) => {
    const shown = reference !== null ? (format ? format(reference) : String(reference)) : null;
    return (
      <div>
        <div className="relative">
          <input
            aria-label={name}
            type="number"
            min={0}
            step="any"
            value={current ?? ''}
            // The placeholder *is* the computed value, so an untouched box reads
            // as what will actually be published.
            placeholder={shown ?? 'not recorded'}
            onChange={(e) => onInput(e.target.value)}
            className={`cms-input py-1.5 pr-7 text-sm ${
              current !== null ? 'border-wareongo-sienna/50 bg-wareongo-sienna/[0.04]' : ''
            }`}
          />
          {current !== null && (
            <button
              type="button"
              onClick={() => onInput('')}
              aria-label={`Clear ${name} override`}
              title="Clear this override and go back to the computed figure"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 text-sm text-wareongo-slate hover:text-wareongo-sienna"
            >
              ×
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] tabular-nums text-wareongo-slate/80">
          {current !== null ? (
            <span className="text-wareongo-sienna">overriding {shown ?? 'nothing'}</span>
          ) : (
            <>computed &mdash; {shown ?? 'not recorded'}</>
          )}
        </p>
        {overCount !== undefined && current !== null && current > overCount && (
          <p className="mt-1 text-[11px] text-wareongo-sienna">
            More than the {overCount} built {overCount === 1 ? 'unit' : 'units'} this is counted
            from — the page shows it as {Math.round((current / overCount) * 100)}% capped to 100%.
          </p>
        )}
      </div>
    );
  };

  return (
    <section>
      {/* A bordered row with a chevron and a subtitle, not a bare label with a
          "+" floated to the far right — that read as a heading and nobody
          realised the section opened. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 border border-wareongo-blue/25 bg-white p-4 text-left transition-colors hover:border-wareongo-blue/50 hover:bg-wareongo-blue/[0.03] ${
          open ? 'rounded-t-2xl border-b-0' : 'rounded-2xl'
        }`}
      >
        <span
          aria-hidden="true"
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-wareongo-blue/[0.07] text-wareongo-blue transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-wareongo-blue">
            Correct a figure the site worked out
          </span>
          <span className="mt-0.5 block text-xs text-wareongo-slate">
            {set > 0
              ? `${set} ${set === 1 ? 'figure is' : 'figures are'} overridden by hand — tap to review`
              : 'Rents, sizes, heights and compliance counts. Tap to see them.'}
          </span>
        </span>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
            set > 0
              ? 'bg-wareongo-sienna/10 text-wareongo-sienna'
              : 'bg-wareongo-green/10 text-wareongo-green'
          }`}
        >
          {set > 0 ? `${set} overridden` : 'all computed'}
        </span>
      </button>

      {open && (
        <div className="space-y-5 rounded-b-2xl border border-t-0 border-wareongo-blue/25 bg-white p-4">
          <div className="rounded-xl bg-wareongo-blue/[0.04] p-3.5">
            <p className="text-sm text-wareongo-charcoal">
              These numbers come from the warehouses tagged with this micromarket, and refresh on
              every deploy. <strong>Leave them alone unless one is wrong.</strong>
            </p>
            <p className="mt-2 text-xs text-wareongo-slate">
              Type a value only to correct bad source data — a rent recorded as a yearly figure, a
              clear height entered in metres. What you type sticks until you clear it, so it will not
              follow the listings the way the grey figure does.
            </p>
            {computed && (
              <p className="mt-2 text-xs text-wareongo-slate">
                Computed from <strong>{computed.measured}</strong> built{' '}
                {computed.measured === 1 ? 'unit' : 'units'}
                {computed.listings > computed.measured && (
                  <>
                    {' '}
                    ({computed.listings - computed.measured} land or build-to-suit listing
                    {computed.listings - computed.measured === 1 ? '' : 's'} excluded)
                  </>
                )}
                .
              </p>
            )}
            {!computed && (
              <p className="mt-2 text-xs text-wareongo-sienna">
                No live figures for this micromarket — usually because the city and micromarket slugs
                above don&apos;t match a page the site builds.
              </p>
            )}
          </div>

          {SPREADS.map(({ key, label, unit, format }) => (
            <div key={key}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="text-sm font-medium text-wareongo-charcoal">{label}</span>
                <span className="text-[11px] text-wareongo-slate">{unit}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['min', 'median', 'max'] as Bound[]).map((bound) => (
                  <label key={bound} className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-wareongo-slate">
                      {bound}
                    </span>
                    <Field
                      name={`${label} ${bound}`}
                      current={value[key][bound]}
                      reference={computedFor(key, bound)}
                      format={format}
                      onInput={(raw) =>
                        onChange({ ...value, [key]: { ...value[key], [bound]: asNumber(raw) } })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-3">
            {SCALARS.map(({ key, label, unit }) => (
              <label key={key} className="block">
                <span className="mb-1.5 block text-sm font-medium text-wareongo-charcoal">{label}</span>
                <span className="mb-1 block text-[11px] text-wareongo-slate">{unit}</span>
                <Field
                  name={label}
                  current={value[key]}
                  reference={computed?.[key] ?? null}
                  // Docks is a median per site, not a count of listings, so it
                  // has no such ceiling.
                  overCount={key === 'docksMedian' ? undefined : computed?.measured}
                  onInput={(raw) => onChange({ ...value, [key]: asNumber(raw) })}
                />
              </label>
            ))}
          </div>

          {/* Always shown, not gated on there being figures: this is the
              explanation someone needs most when the numbers are missing. */}
          <div className="border-t border-wareongo-blue/15 pt-4">
            <p className="cms-label mb-2">Not overridable</p>
            <p className="mb-2 text-xs text-wareongo-slate">
              The construction and flooring mixes are counted listing by listing from the same rows
              the grid shows, so there is no single number to replace. The listing count has to agree
              with that grid, and a neighbour&apos;s median belongs to its own page.
            </p>
            {computed && (computed.construction.length > 0 || computed.flooring.length > 0) && (
              <p className="text-xs tabular-nums text-wareongo-slate/80">
                {computed.construction.map((c) => `${c.share}% ${c.label}`).join(' · ')}
                {computed.flooring.length > 0 && (
                  <>
                    {' — flooring '}
                    {computed.flooring.map((f) => `${f.label} ${f.share}%`).join(' · ')}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
