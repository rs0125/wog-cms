'use client';

import InlineText from './InlineText';
import PagePreview from './PagePreview';

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
    <PagePreview>
      <main className="section-container page-content pb-6 sm:pb-10">
        <article className="max-w-3xl mx-auto">
          <nav className="mb-4 text-xs text-wareongo-slate sm:mb-6" aria-label="Breadcrumb">
            Home <span className="mx-1">/</span> Blogs <span className="mx-1">/</span>
            <span className="text-wareongo-charcoal"> {blog.title || 'Untitled blog'}</span>
          </nav>

          <header className="mb-6">
            <span className="ui-eyebrow text-ui-muted mb-3 block">Blog</span>
            <h1 className="ui-page-title text-wareongo-blue mb-3">
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
          <div className="border-l-4 border-ui-outline bg-ui-tint rounded-r-xl px-4 py-3 mb-8">
            <p className="text-sm font-semibold text-wareongo-charcoal mb-1">In short</p>
            <p className="text-base text-wareongo-slate leading-relaxed">
              {blog.summary ? <InlineText text={blog.summary} /> : <span className="italic text-wareongo-slate/60">No summary yet.</span>}
            </p>
          </div>

          {blog.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}

          {blog.faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="ui-section-title text-wareongo-blue mb-4">Frequently asked questions</h2>
              <FaqAccordion items={blog.faqs} />
            </section>
          )}

          {blog.related.length > 0 && (
            <section aria-label="Related blogs" className="mt-10">
              <h2 className="ui-section-title text-wareongo-charcoal mb-3">Related blogs</h2>
              <ul className="space-y-2">
                {blog.related.map((slug) => (
                  <li key={slug}>
                    <span className="text-wareongo-blue underline-offset-2 hover:underline">/blogs/{slug}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10 border border-ui-line rounded-xl p-6 text-center">
            <p className="text-wareongo-charcoal font-semibold mb-1">Looking for warehouse space?</p>
            <p className="text-sm text-wareongo-slate mb-4">
              Browse verified, physically inspected warehouses across India, or tell us your requirement and get a
              curated shortlist within 4 hours.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <span className="ui-button">
                Browse listings
              </span>
              <span className="ui-button ui-button--secondary">
                Request a warehouse
              </span>
            </div>
          </div>
        </article>
      </main>
    </PagePreview>
  );
}
