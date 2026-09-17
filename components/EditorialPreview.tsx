'use client';

import { useState } from 'react';
import type { EditorialFaq, EditorialImage } from '@/lib/editorial-schema';
import { formatRentRange, formatSqft, formatSqftRange } from '@/lib/micromarket-format';
import type { DerivedStats } from '@/lib/derived-stats';

/**
 * How the public site lays out an editorial listing page, class-for-class from
 * wareongo-website src/pages/EditorialLocationPage.tsx and the components under
 * src/components/micromarket/.
 *
 * One wireframe serves micromarkets, cities and states, so one preview does
 * too. Everything that differs between the scopes arrives in `scope` — the same
 * shape the website's loader resolves for the real template — which is why
 * there are no scope conditionals in the markup below.
 *
 * Duplicated rather than shared, for the same reason BlogPreview is: two
 * deployments, two Tailwind setups, and a package for one page would cost more
 * than it saves. If the template's markup changes, this needs the same edit.
 *
 * ── The numbers are real ───────────────────────────────────────────────────
 * The stat tiles, the specification table and the compliance band all show the
 * figures the site would publish: derived once by the backend
 * (GET /micromarkets) and read here via lib/micromarkets-api.ts, with any
 * unsaved overrides already applied. So the preview is a fair picture of the
 * page, not just its skeleton — and it cannot disagree with the site, because
 * neither of them does the arithmetic.
 *
 * Two things still cannot be real here, and are labelled rather than faked: the
 * nearby-market chart (each bar is another micromarket's own median, computed on
 * that page) and the listing cards themselves (photos, addresses and prices come
 * from the warehouse rows at build time). Inventing either would put a number in
 * front of an editor that they could not tell from data.
 */

// Inline rather than pulling in lucide-react for two glyphs; the site uses that
// package, this app draws the handful of icons it needs (see Toast, the Google
// button) the same way.
const Chevron = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={className}>
    <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The site's chrome, in outline.
 *
 * Included because leaving it out was most of why the preview "looked very
 * different": the real page opens under a floating logo pill and closes on a
 * navy footer, and a bare column of prose between neither reads like the same
 * document. These are simplified — the real navbar has working links and a
 * mobile drawer — but they occupy the right space in the right colours, which is
 * what a layout preview is for.
 */
const Navbar = () => (
  <nav className="sticky top-0 z-50 px-4 pt-4">
    <div className="container mx-auto flex items-center justify-between gap-4">
      <span className="flex items-center justify-center gap-2.5 rounded-xl border border-wareongo-blue/15 bg-white/80 px-5 py-3 backdrop-blur">
        <span className="text-sm font-bold tracking-widest text-wareongo-blue md:text-base">WAREONGO</span>
      </span>
      <span className="hidden items-center gap-1 rounded-xl border border-wareongo-blue/15 bg-white/80 p-2 backdrop-blur md:flex">
        {['Request a Warehouse', 'Listings', 'About Us'].map((l) => (
          <span key={l} className="whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium text-wareongo-charcoal">
            {l}
          </span>
        ))}
        <span className="whitespace-nowrap rounded-lg bg-wareongo-blue px-4 py-3 text-sm font-medium text-white">
          Contact Us
        </span>
      </span>
      <span className="rounded-xl border border-wareongo-blue/15 bg-white/80 px-4 py-3 text-wareongo-blue backdrop-blur md:hidden">
        ☰
      </span>
    </div>
  </nav>
);

const FOOTER_COLUMNS: [string, string[]][] = [
  ['Quick Links', ['Home', 'How It Works', 'Listings', 'Request a Warehouse', 'About Us']],
  ['Services', ['Warehouse Search', 'Build-To-Suit', 'Lease Negotiation', 'Compliance Procurement']],
  ['Contact Us', ['+91 74001-84225', 'sales@wareongo.com']],
];

const Footer = () => (
  <footer className="mt-auto bg-wareongo-blue px-4 py-12 text-wareongo-ivory">
    <div className="container mx-auto grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-lg font-bold tracking-widest">WareOnGo</p>
        <p className="mt-1 text-sm text-wareongo-ivory/70">Find the Right Warehouse, Faster</p>
      </div>
      {FOOTER_COLUMNS.map(([heading, items]) => (
        <div key={heading}>
          <p className="mb-3 text-sm font-semibold">{heading}</p>
          <ul className="space-y-1.5 text-sm text-wareongo-ivory/70">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="container mx-auto mt-10 border-t border-wareongo-ivory/15 pt-6 text-center text-xs text-wareongo-ivory/50">
      © {new Date().getFullYear()} Neuroware Technologies Private Limited. All rights reserved.
    </div>
  </footer>
);

/**
 * Mirrors the site's Pagination component: Previous, a window of at most five
 * numbers, Next — and nothing at all when there is only one page.
 */
function PagerRow({ pages, className = '' }: { pages: number; className?: string }) {
  if (pages <= 1) return null;
  return (
    // Display comes entirely from the caller: a base `flex` here would have to
    // fight the `hidden` in the breakpoint variants, and losing that fight is
    // what stacked the mobile pager vertically.
    <nav aria-label="Pagination" className={`justify-center gap-2 ${className}`}>
      <span className="flex h-9 items-center rounded-lg border border-wareongo-blue/30 px-4 text-sm font-medium text-wareongo-blue opacity-40">
        Previous
      </span>
      <span className="flex gap-1.5">
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`grid h-9 w-9 place-items-center rounded-lg border text-sm font-medium ${
              n === 1
                ? 'border-wareongo-blue bg-wareongo-blue text-white'
                : 'border-wareongo-blue/30 text-wareongo-blue'
            }`}
          >
            {n}
          </span>
        ))}
      </span>
      <span className="flex h-9 items-center rounded-lg border border-wareongo-blue/30 px-4 text-sm font-medium text-wareongo-blue">
        Next
      </span>
    </nav>
  );
}

const EYEBROW = 'text-[10px] font-semibold uppercase tracking-[0.2em]';
const PROSE = 'text-[15px] leading-relaxed text-wareongo-slate sm:text-base';
const PANEL = 'rounded-2xl border border-wareongo-blue';

/** Stands in for the few values that genuinely cannot be known here. */
const Pending = ({ label }: { label?: string }) => (
  <span title="Assembled from individual listings when the site builds" className="text-wareongo-slate/50">
    {label ?? '—'}
  </span>
);

const SectionHeading = ({
  index,
  eyebrow,
  children,
}: {
  index: number;
  eyebrow: string;
  children: React.ReactNode;
}) => (
  <header className="mb-4">
    <div className="mb-2 flex items-baseline gap-3">
      <span className={`${EYEBROW} tabular-nums text-wareongo-slate`}>
        {String(index).padStart(2, '0')}
      </span>
      <span className={`${EYEBROW} text-wareongo-slate`}>{eyebrow}</span>
    </div>
    <h2 className="text-xl font-bold leading-tight text-wareongo-blue sm:text-2xl md:text-[1.75rem]">
      {children}
    </h2>
  </header>
);

const Figure = ({ image }: { image: EditorialImage }) => (
  <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-wareongo-blue bg-wareongo-blue/5">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.url} alt={image.alt} className="h-full w-full object-cover" />
  </div>
);

/**
 * Where the page sits and what it links to, mirroring EditorialScope in the
 * website's loader so the preview and the real page name things identically.
 */
export interface PreviewScope {
  /** Breadcrumb step between "Listings" and this page, or null when there is none. */
  parentLabel: string | null;
  ancestors: string[];
  /** "Nearby markets" for a locality or city, "Other states" for a state. */
  peersLabel: string;
  /** The "All of X" row, or null when there is nothing above this page. */
  up: { label: string; linkLabel: string } | null;
}

export interface EditorialPreviewData {
  scope: PreviewScope;
  slug: string;
  name: string;
  h1: string;
  heroEyebrow: string;
  heroProse: string;
  heroImage: EditorialImage | null;
  marketHeading: string;
  marketProse: string;
  marketImage: EditorialImage | null;
  rentsHeading: string;
  rentsProse: string;
  specHeading: string;
  specProse: string;
  inventoryHeading: string;
  faqs: EditorialFaq[];
  /** What the site would publish, or null when the slugs match no page. */
  stats: DerivedStats | null;
}

/** Mirrors specRowsFor on the site: a row with no data is dropped, not blanked. */
function specRows(stats: DerivedStats | null): [string, string][] {
  if (!stats) return [];
  const rows: [string, string][] = [];
  if (stats.clearHeight) {
    const { min, max, median } = stats.clearHeight;
    rows.push(['Clear height', min === max ? `${min} ft` : `${min}–${max} ft · median ${median}`]);
  }
  if (stats.docksMedian !== null) rows.push(['Docks', `${stats.docksMedian} per site (median)`]);
  if (stats.construction.length > 0)
    rows.push(['Construction type', stats.construction.map((c) => `${c.share}% ${c.label}`).join(' · ')]);
  if (stats.flooring.length > 0)
    rows.push(['Flooring type', stats.flooring.map((f) => `${f.label} ${f.share}%`).join(' · ')]);
  if (stats.size) rows.push(['Median unit size', `${formatSqft(stats.size.median)} sq ft`]);
  return rows;
}

/** Mirrors InventoryBand: zero-count tiles are dropped. */
function bandTiles(stats: DerivedStats | null) {
  if (!stats) return [];
  // Clamped, as the site clamps it: the counts are overridable but `measured`
  // is not, so a correction above the built total would print over 100%.
  const shareOf = (n: number) =>
    stats.measured > 0 ? Math.min(100, Math.round((n / stats.measured) * 100)) : 0;
  return [
    ...stats.construction.slice(0, 2).map((c) => ({ label: c.label, value: c.count, share: c.share })),
    { label: 'Fire NOC on file', value: stats.fireNoc, share: shareOf(stats.fireNoc) },
    { label: 'Commercial CLU', value: stats.commercialClu, share: shareOf(stats.commercialClu) },
  ].filter((t) => t.value > 0);
}

export default function EditorialPreview({ data }: { data: EditorialPreviewData }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const stats = data.stats;
  const peers = stats?.peers ?? [];
  const siblings = peers.filter((p) => !p.isSelf);
  const peerMax = peers.length > 0 ? Math.max(...peers.map((p) => p.medianRent)) : 1;
  const rows = specRows(stats);
  const tiles = bandTiles(stats);

  /**
   * The site pages the grid at six rows per breakpoint — 6 cards at one column,
   * 12 at two, 18 at three. Reproduced in CSS rather than JS so the preview
   * shows the same number of cards the real page would at the frame's width.
   */
  const total = stats?.listings ?? 0;
  const cards = Math.min(total || 6, 18);
  const pageCounts = {
    sm: Math.max(1, Math.ceil(total / 6)),
    md: Math.max(1, Math.ceil(total / 12)),
    lg: Math.max(1, Math.ceil(total / 18)),
  };
  /** Matches the site's own line, per breakpoint. */
  const showing = (perPage: number, pages: number) =>
    `Showing 1–${Math.min(total, perPage)} of ${total}${pages > 1 ? ` · page 1 of ${pages}` : ''}`;

  const place = data.name || 'this page';
  const faqs = data.faqs.filter((f) => f.q.trim() || f.a.trim());

  /**
   * Exactly the site's own conditions, and two of these were wrong before: the
   * preview required prose before it would show the Pricing and Specification
   * sections, while the page shows them whenever there is something computed to
   * put in them. So a page with no spec paragraph hid its construction and
   * flooring mix here and published it there — the preview under-reporting the
   * very page it was previewing.
   */
  const hasMarket = Boolean(data.marketProse);
  const hasRents = Boolean(data.rentsProse) || peers.length > 0;
  const hasSpec = Boolean(data.specProse) || rows.length > 0;

  // Numbered as rendered, exactly as the page does it.
  const numbered = [
    'listings',
    ...(hasMarket ? ['market'] : []),
    ...(hasRents ? ['rents'] : []),
    ...(hasSpec ? ['specification'] : []),
    ...(faqs.length > 0 ? ['faq'] : []),
  ];
  const indexOf = (id: string) => numbered.indexOf(id) + 1;

  return (
    <div className="flex flex-col bg-wareongo-ivory">
      <Navbar />
      <main>
        <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 sm:mb-6">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-wareongo-slate sm:text-sm">
            <li>Home</li>
            <li className="flex items-center gap-1">
              <Chevron className="h-3.5 w-3.5 text-wareongo-slate/50" />
              Listings
            </li>
            {data.scope.ancestors.map((label, index) => (
              <li key={index} className="flex items-center gap-1">
                <Chevron className="h-3.5 w-3.5 text-wareongo-slate/50" />
                {label}
              </li>
            ))}
            <li className="flex items-center gap-1">
              <Chevron className="h-3.5 w-3.5 text-wareongo-slate/50" />
              <span className="font-medium text-wareongo-blue">{place}</span>
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <header id="overview" className="grid items-start gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
          <div>
            <span className={`mb-3 block ${EYEBROW} text-wareongo-slate`}>
              {data.heroEyebrow || `Warehouses and godowns · ${place}`}
            </span>
            <h1 className="mb-4 text-3xl font-bold leading-tight text-wareongo-blue sm:text-4xl md:text-5xl">
              {data.h1 || 'Your H1 goes here'}
            </h1>
            <p className={`max-w-2xl text-base leading-relaxed text-wareongo-slate sm:text-lg`}>
              {data.heroProse || 'The lead paragraph goes here.'}
            </p>

            <dl className="mt-7 grid grid-cols-1 border-t border-wareongo-blue/15 sm:grid-cols-3 sm:gap-3 sm:border-t-0">
              {[
                { label: 'Verified spaces', value: stats ? String(stats.listings) : null },
                { label: 'Sq ft range', value: stats?.size ? formatSqftRange(stats.size) : null },
                {
                  label: 'Per sq ft / mo',
                  value: stats?.rent ? formatRentRange(stats.rent) : null,
                  accent: true,
                },
              ].map((t) => (
                <div
                  key={t.label}
                  className="flex flex-row-reverse items-baseline justify-between gap-3 border-b border-wareongo-blue/15 py-2.5 sm:block sm:gap-0 sm:rounded-xl sm:border sm:border-wareongo-blue/20 sm:px-3.5 sm:py-2.5"
                >
                  <dd
                    className={`text-[17px] font-semibold tabular-nums leading-none ${
                      t.accent ? 'text-wareongo-green' : 'text-wareongo-blue'
                    }`}
                  >
                    {t.value ?? <Pending />}
                  </dd>
                  <dt className={`${EYEBROW} text-wareongo-slate sm:mt-1.5`}>{t.label}</dt>
                </div>
              ))}
            </dl>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <span className="inline-flex h-11 items-center justify-center rounded-xl bg-wareongo-blue px-5 text-sm font-semibold text-white">
                Get a shortlist in 4 hours →
              </span>
              <span className="inline-flex h-11 items-center justify-center rounded-xl border border-wareongo-blue/30 px-5 text-sm font-medium text-wareongo-blue">
                Browse the listings ↓
              </span>
            </div>
          </div>
          {data.heroImage && <Figure image={data.heroImage} />}
        </header>

        <div>
          {/* Inventory leads, as on the site */}
          <section id="listings" className="mt-10 border-t border-wareongo-blue/15 pt-10 sm:mt-14 sm:pt-14">
            <SectionHeading index={indexOf('listings')} eyebrow="Inventory">
              {data.inventoryHeading || `Warehouses for rent in ${place}`}
            </SectionHeading>
            <p className="mb-5 text-sm text-wareongo-slate">
              {stats ? (
                <>
                  <span className="md:hidden">{showing(6, pageCounts.sm)}</span>
                  <span className="hidden md:inline lg:hidden">{showing(12, pageCounts.md)}</span>
                  <span className="hidden lg:inline">{showing(18, pageCounts.lg)}</span>
                </>
              ) : (
                <Pending label="Listing count computed at build" />
              )}
            </p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: cards }).map((_, i) => (
                <div
                  key={i}
                  className={`overflow-hidden rounded-2xl border border-wareongo-blue ${
                    i >= 12 ? 'hidden lg:block' : i >= 6 ? 'hidden md:block' : ''
                  }`}
                >
                  <div className="flex h-40 items-center justify-center border-b border-wareongo-blue bg-wareongo-blue/5">
                    <span className={`${EYEBROW} text-wareongo-slate`}>Listing card</span>
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="h-3.5 w-3/4 rounded bg-wareongo-blue/10" />
                    <div className="h-3 w-1/2 rounded bg-wareongo-blue/[0.07]" />
                    <div className="h-3 w-2/3 rounded bg-wareongo-blue/[0.07]" />
                  </div>
                </div>
              ))}
            </div>

            {/* The site's own pager, and nothing else: it renders Previous, up to
                five numbers and Next, and returns null at a single page. An
                earlier version of this added a caption explaining the page size,
                which the real page has no equivalent of — a preview that
                explains itself is no longer a preview. */}
            {stats && (
              <>
                <PagerRow pages={pageCounts.sm} className="mt-8 flex md:hidden" />
                <PagerRow pages={pageCounts.md} className="mt-8 hidden md:flex lg:hidden" />
                <PagerRow pages={pageCounts.lg} className="mt-8 hidden lg:flex" />
              </>
            )}
          </section>

          {hasMarket && (
            <section id="market" className="mt-10 border-t border-wareongo-blue/15 pt-10 sm:mt-14 sm:pt-14">
              <SectionHeading index={indexOf('market')} eyebrow="Market">
                {data.marketHeading || `Warehouse space in ${place}: where the stock sits`}
              </SectionHeading>
              <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem] lg:gap-10">
                <p className={`max-w-2xl ${PROSE}`}>{data.marketProse}</p>
                {data.marketImage && <Figure image={data.marketImage} />}
              </div>
            </section>
          )}

          {hasRents && (
            <section id="rents" className="mt-10 border-t border-wareongo-blue/15 pt-10 sm:mt-14 sm:pt-14">
              <SectionHeading index={indexOf('rents')} eyebrow="Pricing">
                {data.rentsHeading || `Warehouse rent in ${place}`}
              </SectionHeading>
              <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
                <figure className={`m-0 ${PANEL} p-4 sm:p-5`}>
                  <figcaption className="mb-4">
                    <span className={`block ${EYEBROW} text-wareongo-slate`}>
                      Median asking rent · ₹ per sq ft / month
                    </span>
                  </figcaption>
                  {peers.length > 0 ? (
                    <div className="flex items-end gap-2 border-b border-wareongo-blue/15 sm:gap-3">
                      {peers.map((p) => {
                        const height = Math.max(12, Math.round((p.medianRent / peerMax) * 100));
                        return (
                          <div key={p.path} className="min-w-0 flex-1">
                            <span className="flex h-32 w-full items-end sm:h-40">
                              <span
                                style={{ height: `${height}%` }}
                                className={`mx-auto flex w-full max-w-[4.5rem] items-start justify-center rounded-t-md pt-1 text-[11px] font-semibold tabular-nums text-white ${
                                  p.isSelf ? 'bg-wareongo-green' : 'bg-wareongo-blue'
                                }`}
                              >
                                {p.medianRent}
                              </span>
                            </span>
                            <span
                              className={`mt-2 block text-center text-[10px] leading-tight ${
                                p.isSelf ? 'font-semibold text-wareongo-blue' : 'text-wareongo-slate'
                              }`}
                            >
                              {p.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-[11px] text-wareongo-slate/60">
                      No priced neighbours to compare against, so the page hides this chart.
                    </p>
                  )}
                </figure>
                <p className={`max-w-2xl ${PROSE}`}>{data.rentsProse}</p>
              </div>
            </section>
          )}

          {/* The navy band always renders on the site when any count is non-zero */}
          <section aria-labelledby="inventory-band" className="mt-10 rounded-2xl bg-wareongo-blue px-5 py-6 text-wareongo-ivory sm:mt-14 sm:px-7 sm:py-7">
            <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-wareongo-ivory/15 pb-4">
              <h2 className={`${EYEBROW} text-wareongo-ivory/70`}>What you&apos;ll find here</h2>
              <p className="text-xs text-wareongo-ivory/70 sm:ml-auto">
                {stats
                  ? `of ${stats.measured} built units${
                      stats.listings > stats.measured
                        ? ` · ${stats.listings - stats.measured} land or build-to-suit excluded`
                        : ''
                    }`
                  : 'computed at build'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(tiles.length > 0
                ? tiles
                : [
                    { label: 'PEB', value: null, share: 0 },
                    { label: 'RCC', value: null, share: 0 },
                    { label: 'Fire NOC on file', value: null, share: 0 },
                    { label: 'Commercial CLU', value: null, share: 0 },
                  ]
              ).map((t) => (
                <div
                  key={t.label}
                  className="rounded-xl border border-wareongo-ivory/10 bg-wareongo-ivory/[0.06] px-4 py-3.5"
                >
                  <div className="flex items-baseline gap-1.5">
                    <dd className="text-2xl font-bold leading-none sm:text-[1.75rem]">
                      {t.value ?? <span className="text-wareongo-ivory/40">—</span>}
                    </dd>
                    {t.value !== null && (
                      <span className="text-xs font-semibold tabular-nums text-wareongo-ivory/70">
                        {t.share}%
                      </span>
                    )}
                  </div>
                  <dt className="mt-1.5 text-xs leading-snug text-wareongo-ivory/80">{t.label}</dt>
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-wareongo-ivory/15">
                    <div
                      className="h-full rounded-full bg-wareongo-ivory/60"
                      style={{ width: `${Math.max(t.share, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          </section>

          {hasSpec && (
            <section id="specification" className="mt-10 border-t border-wareongo-blue/15 pt-10 sm:mt-14 sm:pt-14">
              <SectionHeading index={indexOf('specification')} eyebrow="Specification">
                {data.specHeading || `Typical specification in ${place}`}
              </SectionHeading>
              <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
                <div className={`overflow-hidden ${PANEL}`}>
                  <table className="w-full text-left text-[13px] sm:text-sm">
                    <tbody>
                      {(rows.length > 0
                        ? rows
                        : ([
                            ['Clear height', ''],
                            ['Docks', ''],
                            ['Construction type', ''],
                            ['Flooring type', ''],
                            ['Median unit size', ''],
                          ] as [string, string][])
                      ).map(([label, val], i) => (
                        <tr key={label} className={i > 0 ? 'border-t border-wareongo-blue/20' : ''}>
                          <th scope="row" className="px-4 py-3 text-left font-medium text-wareongo-slate">
                            {label}
                          </th>
                          <td className="px-4 py-3 text-right tabular-nums text-wareongo-charcoal">
                            {val || <Pending />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`max-w-2xl ${PROSE}`}>{data.specProse}</p>
              </div>
            </section>
          )}

          {faqs.length > 0 && (
            <section id="faq" className="mt-10 border-t border-wareongo-blue/15 pt-10 sm:mt-14 sm:pt-14">
              <SectionHeading index={indexOf('faq')} eyebrow="FAQ">
                Frequently asked questions
              </SectionHeading>
              <div className="overflow-hidden rounded-2xl border border-wareongo-blue bg-transparent">
                {faqs.map((f, i) => {
                  const open = openFaq === i;
                  return (
                    <div key={i} className="border-t border-wareongo-blue first:border-t-0">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : i)}
                        className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
                      >
                        <h3 className="text-base font-semibold text-wareongo-blue sm:text-lg">
                          {f.q || 'Question'}
                        </h3>
                        <Chevron
                          // The glyph points right, so down is +90 and up is -90.
                          className={`h-5 w-5 shrink-0 text-wareongo-blue transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}
                        />
                      </button>
                      {open && (
                        <p className="px-5 pb-5 text-sm leading-relaxed text-wareongo-slate sm:px-6 sm:pb-6 sm:text-base">
                          {f.a || 'Answer'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-label="Related pages" className="mt-10 border-t border-wareongo-blue/15 pt-10 sm:mt-14 sm:pt-14">
            <dl className="space-y-5 text-sm">
              <div className="sm:flex sm:gap-6">
                <dt className={`mb-2 min-w-[9rem] ${EYEBROW} text-wareongo-slate sm:mb-0`}>All listings</dt>
                <dd className="text-wareongo-blue">Browse all warehouses in {data.name || 'this micromarket'} →</dd>
              </div>
              {siblings.length > 0 && (
                <div className="sm:flex sm:gap-6">
                  <dt className={`mb-2 min-w-[9rem] ${EYEBROW} text-wareongo-slate sm:mb-0`}>
                    {data.scope.peersLabel}
                  </dt>
                  <dd className="flex flex-wrap gap-2">
                    {siblings.map((p) => (
                      <span
                        key={p.path}
                        className="inline-flex items-center gap-1.5 rounded-full border border-wareongo-blue/30 px-3 py-1.5 text-wareongo-blue"
                      >
                        {p.name}
                        <span className="text-xs tabular-nums text-wareongo-slate">₹{p.medianRent}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {/* A state has nothing above it, so the row is absent there
                  exactly as it is on the real page. */}
              {data.scope.up && (
                <div className="sm:flex sm:gap-6">
                  <dt className={`mb-2 min-w-[9rem] ${EYEBROW} text-wareongo-slate sm:mb-0`}>
                    {data.scope.up.label}
                  </dt>
                  <dd className="text-wareongo-blue">{data.scope.up.linkLabel}</dd>
                </div>
              )}
            </dl>
          </section>

          <div className={`mt-10 ${PANEL} p-6 text-center sm:mt-14`}>
            <p className="mb-1 font-semibold text-wareongo-charcoal">Looking for space in {place}?</p>
            <p className="mb-4 text-sm text-wareongo-slate">
              Tell us the size, the compliance you need and when you want to move in.
            </p>
            <span className="inline-flex h-10 items-center rounded-xl bg-wareongo-blue px-5 text-sm font-medium text-white">
              Request a warehouse
            </span>
          </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
