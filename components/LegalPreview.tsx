'use client';

import type { LegalContent } from '@/lib/legal-schema';
import { LegalBody, LegalDates } from './LegalContent';
import PagePreview from './PagePreview';

export default function LegalPreview({ content }: { content: LegalContent }) {
  const privacy = content.slug === 'privacy-policy';
  return <PagePreview>
    <main aria-label="Legal page preview" className={privacy ? 'section-container page-content pb-8' : 'page-content container mx-auto pb-12'}>
      {privacy && <div className="mb-6"><span className="ui-button ui-button--secondary">← Back to Home</span></div>}
      <div className={privacy ? 'max-w-4xl mx-auto bg-ui-surface rounded-lg p-6 sm:p-8 lg:p-12' : ''}>
        <h1 className={`ui-page-title text-ui-ink break-words ${privacy ? 'mb-4' : 'mb-6'}`}>{content.title}</h1>
        <LegalDates content={content} /><LegalBody content={content} />
      </div>
    </main>
  </PagePreview>;
}
