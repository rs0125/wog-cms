'use client';

import { useActionState, useState } from 'react';
import BlockEditor from './BlockEditor';
import ServicePreview from './ServicePreview';
import DeployButton from './DeployButton';
import type { ServiceContent } from '@/lib/service-schema';
import type { BlogBlock, BlogFaq } from '@/lib/blog-schema';
import { keyAll, keyed, removeAt, replaceAt, unkey, type Keyed } from '@/lib/keyed';
import type { SaveResult } from '@/lib/action-results';

export default function ServiceForm({ content, expectedUpdatedAt, state, action, deployable }: {
  content: ServiceContent; expectedUpdatedAt: string; deployable: boolean;
  state: { hasDraft: boolean; staged: boolean; published: boolean };
  action: (prev: SaveResult | undefined, form: FormData) => Promise<SaveResult>;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [edited, setEdited] = useState(false);
  const [fields, setFields] = useState(content);
  const [keywords, setKeywords] = useState(content.keywords.join(', '));
  const [blocks, setBlocks] = useState<Keyed<BlogBlock>[]>(() => keyAll(content.blocks));
  const [faqs, setFaqs] = useState<Keyed<BlogFaq>[]>(() => keyAll(content.faqs));
  const preview = { ...fields, blocks: unkey(blocks), faqs: unkey(faqs), keywords: keywords.split(',').map(s => s.trim()).filter(Boolean) };
  const bind = (key: 'title' | 'seoTitle' | 'description' | 'summary') => ({
    id: key, name: key, value: fields[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(f => ({ ...f, [key]: e.target.value })),
  });
  return <form action={formAction} onInput={() => setEdited(true)} className="mt-6 pb-48">
    <input type="hidden" name="slug" value={content.slug} />
    <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <input type="hidden" name="content" value={JSON.stringify(preview)} />
    <p className="mb-5 text-sm text-wareongo-slate">Drafts can be unfinished. Add an introduction and page content, then save for the next build to publish the page and its footer link.</p>
    <div className="mb-6 flex gap-2" role="tablist" aria-label="Service page editor">
      {(['edit', 'preview'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t}
        className={tab === t ? 'cms-btn-primary' : 'cms-btn'} onClick={() => setTab(t)}>{t === 'edit' ? 'Edit' : 'Preview'}</button>)}
    </div>
    <div className={tab === 'edit' ? 'space-y-6' : 'hidden'}>
      <div><label htmlFor="title" className="cms-label">Page heading</label><input {...bind('title')} maxLength={300} className="cms-input" /></div>
      <div><label htmlFor="summary" className="cms-label">Introduction</label><textarea {...bind('summary')} rows={4} maxLength={20000} className="cms-input" /></div>
      <div><label htmlFor="seoTitle" className="cms-label">SEO title</label><input {...bind('seoTitle')} maxLength={300} className="cms-input" /></div>
      <div><label htmlFor="description" className="cms-label">Meta description</label><textarea {...bind('description')} maxLength={1000} rows={3} className="cms-input" /></div>
      <div><label htmlFor="keywords" className="cms-label">Keywords (optional, comma separated)</label><input id="keywords" value={keywords} onChange={e => setKeywords(e.target.value)} className="cms-input" /></div>
      <section aria-labelledby="service-content-heading">
        <h2 id="service-content-heading" className="cms-title mb-4 text-xl">Page content</h2>
        <BlockEditor blocks={blocks} onChange={next => { setBlocks(next); setEdited(true); }} />
      </section>
      <section aria-labelledby="service-faq-heading">
        <h2 id="service-faq-heading" className="cms-title mb-4 text-xl">Frequently asked questions (optional)</h2>
        <div className="space-y-3">
          {faqs.map(({ key, value: faq }, i) => <div key={key} className="cms-card space-y-3">
            <label className="cms-label">Question {i + 1}<input value={faq.q} onChange={e => setFaqs(replaceAt(faqs, i, { ...faq, q: e.target.value }))} className="cms-input mt-2" /></label>
            <label className="cms-label">Answer {i + 1}<textarea value={faq.a} onChange={e => setFaqs(replaceAt(faqs, i, { ...faq, a: e.target.value }))} rows={3} className="cms-input mt-2" /></label>
            <button type="button" className="cms-btn-danger" onClick={() => { setFaqs(removeAt(faqs, i)); setEdited(true); }}>Remove question</button>
          </div>)}
        </div>
        <button type="button" className="cms-btn mt-3" onClick={() => { setFaqs([...faqs, keyed({ q: '', a: '' })]); setEdited(true); }}>+ Question</button>
      </section>
    </div>
    {tab === 'preview' && <ServicePreview content={preview} />}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-wareongo-blue/20 bg-wareongo-ivory p-4 lg:left-64">
      <div className="mx-auto max-w-4xl space-y-2">
        {result?.ok === false && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
        <p className="text-xs text-wareongo-slate">{edited ? 'Unsaved changes' : state.hasDraft ? 'Draft saved privately' : 'No unsaved changes'}{state.staged ? ' · Changes ready for next build' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="draft" disabled={pending} className="cms-btn">{pending ? 'Saving…' : 'Save draft'}</button>
          <button type="submit" name="intent" value="publish" disabled={pending} className="cms-btn-primary">Save for next build</button>
          {state.published && <button type="submit" name="intent" value="unpublish" disabled={pending} className="cms-btn-danger">Remove from website</button>}
          {!edited && state.staged && <DeployButton configured={deployable} label="Deploy website" />}
        </div>
      </div>
    </div>
  </form>;
}
