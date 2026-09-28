'use client';

import InlineText from './InlineText';

import { useState } from 'react';
import type { BlogBlock, BlogFaq } from '@/lib/blog-schema';
import { COLLAGE_GRID, collageSpan } from '@/lib/collage';

export const ContentBlock = ({ block }: { block: BlogBlock }) => {
  switch (block.kind) {
    case 'h2':
      return <h2 className="ui-panel-title text-wareongo-blue mt-10 mb-3"><InlineText text={block.text} /></h2>;
    case 'h3':
      return <h3 className="ui-card-title text-wareongo-charcoal mt-6 mb-2"><InlineText text={block.text} /></h3>;
    case 'p':
      return <p className="text-base text-wareongo-slate leading-relaxed mb-4"><InlineText text={block.text} /></p>;
    case 'ul':
      return (
        <ul className="list-disc pl-5 mb-4 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="text-base text-wareongo-slate leading-relaxed">
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal pl-5 mb-4 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="text-base text-wareongo-slate leading-relaxed">
              <InlineText text={item} />
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto mb-6">
          <div className="border border-ui-outline rounded-xl overflow-hidden min-w-fit">
            <table className="ui-table text-left">
              <thead>
                <tr className="border-b border-ui-line">
                  {block.table.headers.map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 font-medium text-ui-muted text-xs"
                    >
                      <InlineText text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`transition-colors hover:bg-ui-tint ${
                      ri < block.table.rows.length - 1 ? 'border-b border-ui-line' : ''
                    }`}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-3 align-top ${
                          ci === 0 ? 'font-medium text-wareongo-charcoal' : 'text-wareongo-slate'
                        }`}
                      >
                        <InlineText text={cell} />
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
          <p className="mb-6 rounded-xl border border-dashed border-ui-outline px-4 py-6 text-center text-xs text-wareongo-slate">
            No images in this block yet.
          </p>
        );
      }
      return (
        <figure className="mb-6">
          {count === 1 ? (
            // Its own aspect ratio, capped in height so a portrait shot doesn't
            // push the rest of the blog off the screen. w-auto with max-w-full
            // keeps it undistorted when the cap bites.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.images[0].url}
              alt={block.images[0].alt}
              width={block.images[0].width}
              height={block.images[0].height}
              className="mx-auto block h-auto w-auto max-h-[32rem] max-w-full rounded-xl border border-ui-line bg-ui-tint"
            />
          ) : (
            <div className={`grid gap-2 sm:gap-3 ${COLLAGE_GRID[count]}`}>
              {block.images.map((img, i) => (
                // Tiles are cropped to a common 4:3 so rows line up whatever the
                // source photos are.
                <div
                  key={img.url}
                  className={`aspect-[4/3] overflow-hidden rounded-xl border border-ui-line bg-ui-tint sm:rounded-xl ${collageSpan(count, i)}`}
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
            <figcaption className="mt-2 text-center text-xs text-wareongo-slate sm:text-sm"><InlineText text={block.caption} /></figcaption>
          )}
        </figure>
      );
    }
  }
};

export function ContentFaqAccordion({ items }: { items: BlogFaq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="bg-transparent border border-ui-outline rounded-xl shadow-none overflow-hidden">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            className="bg-transparent border-t border-ui-outline first:border-t-0 transition-colors duration-300 hover:bg-ui-tint"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left p-5 sm:p-6"
            >
              <h3 className="ui-card-title text-wareongo-blue">{item.q || 'Untitled question'}</h3>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
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
                  <InlineText text={item.a} />
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
