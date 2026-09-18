'use client';

import InlineText from './InlineText';

import type { ServiceContent } from '@/lib/service-schema';
import { ContentBlock, ContentFaqAccordion } from './ContentPreview';

export default function ServicePreview({ content }: { content: ServiceContent }) {
  return <section aria-label="Service page preview" className="rounded-2xl border border-wareongo-blue/20 bg-wareongo-ivory px-4 py-6 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-3xl break-words">
      <nav className="mb-6 text-xs text-wareongo-slate" aria-label="Breadcrumb">Home / {content.title}</nav>
      <header className="mb-8">
        <span className="cms-eyebrow mb-3 block">Our services</span>
        <h1 className="mb-4 text-2xl font-bold leading-tight text-wareongo-blue sm:text-3xl md:text-4xl">{content.title}</h1>
        <p className="text-base leading-relaxed text-wareongo-slate sm:text-lg"><InlineText text={content.summary} /></p>
      </header>
      {content.blocks.map((block, i) => <ContentBlock key={i} block={block} />)}
      {content.faqs.length > 0 && <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-wareongo-blue sm:text-2xl">Frequently asked questions</h2>
        <ContentFaqAccordion items={content.faqs} />
      </section>}
      <div className="mt-10 rounded-2xl border border-wareongo-blue/20 p-6 text-center">
        <p className="mb-4 font-semibold text-wareongo-charcoal">Tell us what you need</p>
        <div className="flex flex-wrap justify-center gap-3">
          <span className="inline-flex h-10 items-center rounded-xl bg-wareongo-blue px-5 text-sm font-medium text-white">Discuss your requirement</span>
          <span className="inline-flex h-10 items-center rounded-xl border border-wareongo-blue/30 px-5 text-sm font-medium text-wareongo-blue">Contact us</span>
        </div>
      </div>
    </div>
  </section>;
}
