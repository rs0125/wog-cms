'use client';

import InlineText from './InlineText';
import PagePreview from './PagePreview';

import type { ServiceContent } from '@/lib/service-schema';
import { ContentBlock, ContentFaqAccordion } from './ContentPreview';

export default function ServicePreview({ content }: { content: ServiceContent }) {
  return <PagePreview><main aria-label="Service page preview" className="section-container page-content pb-6 sm:pb-10">
    <div className="mx-auto max-w-3xl break-words">
      <nav className="mb-6 text-xs text-wareongo-slate" aria-label="Breadcrumb">Home / {content.title}</nav>
      <header className="mb-8">
        <span className="ui-eyebrow text-ui-muted mb-3 block">Our services</span>
        <h1 className="mb-4 ui-page-title text-wareongo-blue">{content.title}</h1>
        <p className="text-base leading-relaxed text-wareongo-slate"><InlineText text={content.summary} /></p>
      </header>
      {content.blocks.map((block, i) => <ContentBlock key={i} block={block} />)}
      {content.faqs.length > 0 && <section className="mt-10">
        <h2 className="mb-4 ui-section-title text-wareongo-blue">Frequently asked questions</h2>
        <ContentFaqAccordion items={content.faqs} />
      </section>}
      <div className="mt-10 rounded-xl border border-ui-line p-6 text-center">
        <p className="mb-4 font-semibold text-wareongo-charcoal">Tell us what you need</p>
        <div className="flex flex-wrap justify-center gap-3">
          <span className="ui-button">Discuss your requirement</span>
          <span className="ui-button ui-button--secondary">Contact us</span>
        </div>
      </div>
    </div>
  </main></PagePreview>;
}
