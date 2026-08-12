'use client';

import { useState } from 'react';
import type { GuideBlock, GuideFaq } from '@/lib/guide-schema';
import { COLLAGE_GRID, collageSpan } from '@/lib/collage';

// A faithful copy of how the public site renders a guide — the Block switch in
// wareongo-website/src/pages/GuideDetail.tsx and the accordion in
// components/FAQAccordion.tsx, class-for-class, on the same palette.
//
// Deliberately duplicated rather than shared: the two apps are separate
// deployments with separate Tailwind setups, and a published npm package for
// five guides would cost more than it saves. If GuideDetail's markup changes,
// this needs the same edit — that's the tradeoff.

const Block = ({ block }: { block: GuideBlock }) => {
  switch (block.kind) {
    case 'h2':
      return <h2 className="text-xl sm:text-2xl font-bold text-wareongo-blue mt-10 mb-3">{block.text}</h2>;
    case 'h3':
      return <h3 className="text-lg sm:text-xl font-semibold text-wareongo-charcoal mt-6 mb-2">{block.text}</h3>;
    case 'p':
      return <p className="text-[15px] sm:text-base text-wareongo-slate leading-relaxed mb-4">{block.text}</p>;
    case 'ul':
      return (
        <ul className="list-disc pl-5 mb-4 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="text-[15px] sm:text-base text-wareongo-slate leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal pl-5 mb-4 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="text-[15px] sm:text-base text-wareongo-slate leading-relaxed">
              {item}
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto mb-6">
          <div className="border border-wareongo-blue rounded-2xl overflow-hidden min-w-fit">
            <table className="w-full text-left text-[13px] sm:text-sm bg-transparent">
              <thead>
                <tr className="border-b border-wareongo-blue bg-wareongo-blue/5">
                  {block.table.headers.map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 font-semibold text-wareongo-blue text-[11px] sm:text-xs uppercase tracking-[0.12em]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`transition-colors hover:bg-wareongo-blue/5 ${
                      ri < block.table.rows.length - 1 ? 'border-b border-wareongo-blue/30' : ''
                    }`}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-3 align-top ${
                          ci === 0 ? 'font-medium text-wareongo-charcoal' : 'text-wareongo-slate'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case 'images': {
      const count = block.images.length;
      // The saved page can't have this (the schema requires an image), but the
      // preview renders whatever is on screen — including a block whose upload
      // hasn't happened yet.
      if (count === 0) {
        return (
          <p className="mb-6 rounded-2xl border border-dashed border-wareongo-blue/25 px-4 py-6 text-center text-xs text-wareongo-slate">
            No images in this block yet.
          </p>
        );
      }
      return (
        <figure className="mb-6">
          {count === 1 ? (
            // Its own aspect ratio, capped in height so a portrait shot doesn't
            // push the rest of the guide off the screen. w-auto with max-w-full
            // keeps it undistorted when the cap bites.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.images[0].url}
              alt={block.images[0].alt}
              width={block.images[0].width}
              height={block.images[0].height}
              className="mx-auto block h-auto w-auto max-h-[32rem] max-w-full rounded-2xl border border-wareongo-blue/20 bg-wareongo-blue/5"
            />
          ) : (
            <div className={`grid gap-2 sm:gap-3 ${COLLAGE_GRID[count]}`}>
              {block.images.map((img, i) => (
                // Tiles are cropped to a common 4:3 so rows line up whatever the
                // source photos are.
                <div
                  key={img.url}
                  className={`aspect-[4/3] overflow-hidden rounded-xl border border-wareongo-blue/20 bg-wareongo-blue/5 sm:rounded-2xl ${collageSpan(count, i)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt}
                    width={img.width}
                    height={img.height}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
          {block.caption && (
            <figcaption className="mt-2 text-center text-xs text-wareongo-slate sm:text-sm">{block.caption}</figcaption>
          )}
        </figure>
      );
    }
  }
};

function FaqAccordion({ items }: { items: GuideFaq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="bg-transparent border border-wareongo-blue rounded-2xl shadow-none overflow-hidden">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            className="bg-transparent border-t border-wareongo-blue first:border-t-0 transition-colors duration-300 hover:bg-wareongo-blue/5"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left p-5 sm:p-6"
            >
              <h3 className="text-base sm:text-lg font-semibold text-wareongo-blue">{item.q || 'Untitled question'}</h3>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`w-5 h-5 shrink-0 text-wareongo-blue transition-transform duration-300 ${
                  isOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm sm:text-base text-wareongo-slate leading-relaxed">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface PreviewGuide {
  title: string;
  summary: string;
  dateModified: string;
  blocks: GuideBlock[];
  faqs: GuideFaq[];
  related: string[];
}

export default function GuidePreview({ guide }: { guide: PreviewGuide }) {
  return (
    // The ivory ground and max-w-3xl column are the live page's, so line lengths
    // and heading rhythm read exactly as they will once published.
    <div className="rounded-2xl border border-wareongo-blue/20 bg-wareongo-ivory">
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <article className="max-w-3xl mx-auto">
          <nav className="mb-4 text-xs text-wareongo-slate sm:mb-6" aria-label="Breadcrumb">
            Home <span className="mx-1">/</span> Guides <span className="mx-1">/</span>
            <span className="text-wareongo-charcoal"> {guide.title || 'Untitled guide'}</span>
          </nav>

          <header className="mb-6">
            <span className="cms-eyebrow mb-3 block">Guide</span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-wareongo-blue leading-tight mb-3">
              {guide.title || 'Untitled guide'}
            </h1>
            <p className="text-xs text-wareongo-slate">
              Updated <time dateTime={guide.dateModified}>{guide.dateModified}</time> · WareOnGo
            </p>
          </header>

          {/* #guide-summary on the live page — the speakable target answer
              engines extract, which is why it gets its own visual treatment. */}
          <div className="border-l-4 border-wareongo-blue/40 bg-wareongo-blue/5 rounded-r-xl px-4 py-3 mb-8">
            <p className="text-sm font-semibold text-wareongo-charcoal mb-1">In short</p>
            <p className="text-[15px] sm:text-base text-wareongo-slate leading-relaxed">
              {guide.summary || <span className="italic text-wareongo-slate/60">No summary yet.</span>}
            </p>
          </div>

          {guide.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}

          {guide.faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl sm:text-2xl font-bold text-wareongo-blue mb-4">Frequently asked questions</h2>
              <FaqAccordion items={guide.faqs} />
            </section>
          )}

          {guide.related.length > 0 && (
            <section aria-label="Related guides" className="mt-10">
              <h2 className="text-base font-semibold text-wareongo-charcoal mb-3">Related guides</h2>
              <ul className="space-y-2">
                {guide.related.map((slug) => (
                  <li key={slug}>
                    <span className="text-wareongo-blue underline-offset-2 hover:underline">/guides/{slug}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10 border border-wareongo-blue/20 rounded-2xl p-6 text-center">
            <p className="text-wareongo-charcoal font-semibold mb-1">Looking for warehouse space?</p>
            <p className="text-sm text-wareongo-slate mb-4">
              Browse verified, physically inspected warehouses across India, or tell us your requirement and get a
              curated shortlist within 4 hours.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <span className="inline-flex items-center px-5 h-10 rounded-xl bg-wareongo-blue text-white text-sm font-medium">
                Browse listings
              </span>
              <span className="inline-flex items-center px-5 h-10 rounded-xl border border-wareongo-blue/30 text-wareongo-blue text-sm font-medium">
                Request a warehouse
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
