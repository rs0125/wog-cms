'use client';

import InlineText from './InlineText';

import type { BlogBlock, BlogFaq } from '@/lib/blog-schema';
import { ContentBlock as Block, ContentFaqAccordion as FaqAccordion } from './ContentPreview';

export interface PreviewBlog {
  title: string;
  summary: string;
  /** Empty string means no byline — the page credits WareOnGo instead. */
  author: string;
  dateModified: string;
  blocks: BlogBlock[];
  faqs: BlogFaq[];
  related: string[];
}

export default function BlogPreview({ blog }: { blog: PreviewBlog }) {
  return (
    // The ivory ground and max-w-3xl column are the live page's, so line lengths
    // and heading rhythm read exactly as they will once published.
    <div className="rounded-2xl border border-wareongo-blue/20 bg-wareongo-ivory">
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <article className="max-w-3xl mx-auto">
          <nav className="mb-4 text-xs text-wareongo-slate sm:mb-6" aria-label="Breadcrumb">
            Home <span className="mx-1">/</span> Blogs <span className="mx-1">/</span>
            <span className="text-wareongo-charcoal"> {blog.title || 'Untitled blog'}</span>
          </nav>

          <header className="mb-6">
            <span className="cms-eyebrow mb-3 block">Blog</span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-wareongo-blue leading-tight mb-3">
              {blog.title || 'Untitled blog'}
            </h1>
            <p className="text-xs text-wareongo-slate">
              {blog.author ? (
                <>
                  By {blog.author.replace(/^\s*by\s+/i, '').trim()} · Updated <time dateTime={blog.dateModified}>{blog.dateModified}</time>
                </>
              ) : (
                <>
                  Updated <time dateTime={blog.dateModified}>{blog.dateModified}</time> · WareOnGo
                </>
              )}
            </p>
          </header>

          {/* #blog-summary on the live page — the speakable target answer
              engines extract, which is why it gets its own visual treatment. */}
          <div className="border-l-4 border-wareongo-blue/40 bg-wareongo-blue/5 rounded-r-xl px-4 py-3 mb-8">
            <p className="text-sm font-semibold text-wareongo-charcoal mb-1">In short</p>
            <p className="text-[15px] sm:text-base text-wareongo-slate leading-relaxed">
              {blog.summary ? <InlineText text={blog.summary} /> : <span className="italic text-wareongo-slate/60">No summary yet.</span>}
            </p>
          </div>

          {blog.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}

          {blog.faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl sm:text-2xl font-bold text-wareongo-blue mb-4">Frequently asked questions</h2>
              <FaqAccordion items={blog.faqs} />
            </section>
          )}

          {blog.related.length > 0 && (
            <section aria-label="Related blogs" className="mt-10">
              <h2 className="text-base font-semibold text-wareongo-charcoal mb-3">Related blogs</h2>
              <ul className="space-y-2">
                {blog.related.map((slug) => (
                  <li key={slug}>
                    <span className="text-wareongo-blue underline-offset-2 hover:underline">/blogs/{slug}</span>
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
