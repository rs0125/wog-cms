import React from 'react';
import { createRoot } from 'react-dom/client';
import BlogForm from '../../components/BlogForm';
import EditorialForm from '../../components/EditorialForm';
import ServiceForm from '../../components/ServiceForm';
import LegalForm from '../../components/LegalForm';
import AdPageForm from '../../components/AdPageForm';
import adContent from '../../content/ad-pages/bangalore.json';
import { NO_OVERRIDES } from '../../lib/editorial-schema';
import { emptyService } from '../../lib/service-schema';
import { writingTemplate } from '../../lib/ai-writing';

const blank = { slug: 'warehouse-guide', title: '', seoTitle: '', description: '', summary: '', author: null,
  blocks: [{ kind: 'p' as const, text: '' }], faqs: [], keywords: [], related: [], thumbnail: null,
  datePublished: null, dateModified: '2026-10-08', sortOrder: 0, status: 'DRAFT' as const };
const complete = { ...blank, title: 'Saved heading', seoTitle: 'Saved SEO', description: 'Saved description', summary: 'Saved summary', blocks: [{ kind: 'p' as const, text: 'Saved body' }] };
const sample = { title: 'AI heading', seoTitle: 'AI SEO title', description: 'AI description', summary: 'AI summary', author: null, keywords: [], blocks: [{ kind: 'p', text: 'AI body' }], faqs: [{ q: 'Question?', a: 'Answer.' }] };
const params = new URLSearchParams(location.search);
const kind = params.get('kind') || 'blog';
const target = kind === 'blog' ? { type: 'blog' as const, slug: blank.slug }
  : kind === 'service' ? { type: 'service' as const, slug: 'warehouse-search' }
    : kind === 'legal' ? { type: 'legal' as const, slug: 'privacy-policy' }
      : kind === 'ad' ? { type: 'ad' as const, slug: 'bangalore' }
    : { type: kind as 'city' | 'state' | 'micromarket', slug: 'sample', ...(kind === 'micromarket' ? { citySlug: 'bengaluru' } : {}) };
Object.assign(window, { writingTemplate, target, sample, checkResult: { ok: true }, checkDelay: 0, checks: 0, saves: 0 });
const action = async () => { Object.assign(window, { saves: (window as unknown as { saves: number }).saves + 1 }); return { ok: false as const, error: 'Simulated save failure; your edits are kept.' }; };
const page = { name: 'Sample', seoTitle: '', metaDescription: '', h1: '', heroEyebrow: null, heroProse: '', heroImage: null,
  marketHeading: null, marketProse: null, marketImage: null, rentsHeading: null, rentsProse: null, specHeading: null, specProse: null,
  inventoryHeading: null, faqs: [{ q: '', a: '' }], relatedBlogs: [], statOverrides: NO_OVERRIDES, status: 'DRAFT' as const };
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-4xl p-4 sm:p-8">
  <h1 className="cms-title mb-5">{kind} editor</h1>
  {kind === 'blog' ? <BlogForm blog={params.has('complete') ? complete : { ...blank, slug: params.has('blank-slug') ? '' : blank.slug, title: params.has('partial') ? 'Human heading' : '' }} action={action} relatedOptions={[]} />
    : kind === 'service' ? <ServiceForm content={emptyService('warehouse-search')} action={action} expectedUpdatedAt="new" state={{ hasDraft: false, staged: false, published: false }} deployable={false} />
      : kind === 'legal' ? <LegalForm content={{ slug: 'privacy-policy', title: 'Privacy policy', seoTitle: 'Privacy policy', description: 'Policy description', effectiveDate: '2026-01-01', updated: '2026-10-08', blocks: [{ kind: 'p', text: 'Policy copy' }], notice: '' }} action={action} expectedUpdatedAt="2026-10-08T00:00:00.000Z" state={{ hasDraft: false, staged: false }} deployable={false} />
        : kind === 'ad' ? <AdPageForm content={adContent} action={action} expectedUpdatedAt="2026-10-08T00:00:00.000Z" state={{ hasDraft: false, staged: false }} deployable={false} previewUrl="/preview" />
      : <EditorialForm page={page} identity={kind === 'micromarket' ? { scope: 'micromarket', slug: 'sample', citySlug: 'bengaluru', parentLabel: null } : kind === 'state' ? { scope: 'state', slug: 'sample' } : { scope: 'city', slug: 'sample', parentLabel: null }} action={action} backHref="/" blogOptions={[]} />}
</main>);
