'use client';

import { useActionState, useState } from 'react';
import BlockEditor from './BlockEditor';
import DeployButton from './DeployButton';
import { LegalBody, LegalDates } from './LegalContent';
import { LEGAL_BLOCK_KINDS, type LegalContent } from '@/lib/legal-schema';
import type { BlogBlock } from '@/lib/blog-schema';
import { keyAll, unkey, type Keyed } from '@/lib/keyed';
import type { SaveResult } from '@/lib/action-results';

export default function LegalForm({ content, expectedUpdatedAt, state, action, deployable }: {
  content: LegalContent; expectedUpdatedAt: string;
  state: { hasDraft: boolean; staged: boolean }; deployable: boolean;
  action: (prev: SaveResult | undefined, form: FormData) => Promise<SaveResult>;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [edited, setEdited] = useState(false);
  const [fields, setFields] = useState(content);
  const [blocks, setBlocks] = useState<Keyed<BlogBlock>[]>(() => keyAll(content.blocks));
  const plainBlocks = unkey(blocks) as LegalContent['blocks'];
  const preview = { ...fields, blocks: plainBlocks };
  const bind = (key: 'title' | 'seoTitle' | 'description' | 'effectiveDate' | 'updated' | 'notice') => ({
    id: key, name: key, value: fields[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFields(f => ({ ...f, [key]: e.target.value })),
  });
  return <form action={formAction} onInput={() => setEdited(true)} className="mt-6 pb-40">
    <input type="hidden" name="slug" value={content.slug} />
    <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <input type="hidden" name="blocks" value={JSON.stringify(plainBlocks)} />
    <p className="mb-5 text-sm text-wareongo-slate">Drafts stay private. “Save for next build” approves this copy for the next website deployment.</p>
    <div className="mb-6 flex gap-2" role="tablist" aria-label="Legal page editor">
      {(['edit', 'preview'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t}
        className={tab === t ? 'cms-btn-primary' : 'cms-btn'} onClick={() => setTab(t)}>{t === 'edit' ? 'Edit' : 'Preview'}</button>)}
    </div>
    {/* Keep fields mounted so preview and failed saves preserve all typed input. */}
    <div className={tab === 'edit' ? 'space-y-6' : 'hidden'}>
      <div><label htmlFor="title" className="cms-label">Page heading</label><input {...bind('title')} required maxLength={300} className="cms-input" /></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="effectiveDate" className="cms-label">Effective date</label><input {...bind('effectiveDate')} type="date" required className="cms-input" /></div>
        <div><label htmlFor="updated" className="cms-label">Last updated</label><input {...bind('updated')} type="date" required className="cms-input" /></div>
      </div>
      <div><label htmlFor="seoTitle" className="cms-label">SEO title</label><input {...bind('seoTitle')} required maxLength={300} className="cms-input" /></div>
      <div><label htmlFor="description" className="cms-label">Meta description</label><textarea {...bind('description')} required maxLength={1000} rows={3} className="cms-input" /></div>
      <section>
        <h2 className="cms-title text-xl mb-2">Page content</h2>
        <p className="cms-hint mb-4">Use **bold text** or [link text](https://example.com). Email links can use mailto:. HTML is displayed as text.</p>
        <BlockEditor blocks={blocks} kinds={LEGAL_BLOCK_KINDS} onChange={next => { setBlocks(next); setEdited(true); }} />
      </section>
      <div><label htmlFor="notice" className="cms-label">Closing notice (optional)</label><textarea {...bind('notice')} rows={4} className="cms-input" /></div>
    </div>
    {tab === 'preview' && <section aria-label="Legal page preview" className="rounded-lg bg-white p-6 sm:p-8 overflow-hidden">
      <h1 className="text-3xl font-bold mb-4 text-wareongo-charcoal break-words">{fields.title}</h1>
      <LegalDates content={preview} /><LegalBody content={preview} />
    </section>}
    <div className="fixed inset-x-0 bottom-0 lg:left-64 border-t border-wareongo-blue/20 bg-wareongo-ivory p-4 z-20">
      <div className="mx-auto max-w-4xl space-y-2">
        {result?.ok === false && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
        <p className="text-xs text-wareongo-slate">{edited ? 'Unsaved changes' : state.hasDraft ? 'Draft changes saved' : 'No draft changes'}{state.staged ? ' · Approved copy ready for next build' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="draft" disabled={pending} className="cms-btn">{pending ? 'Saving…' : 'Save draft'}</button>
          <button type="submit" name="intent" value="publish" disabled={pending} className="cms-btn-primary">Save for next build</button>
          {!edited && state.staged && <DeployButton configured={deployable} label="Deploy website" />}
        </div>
      </div>
    </div>
  </form>;
}
