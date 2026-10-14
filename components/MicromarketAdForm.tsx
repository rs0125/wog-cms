'use client';

import { useActionState, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { MICROMARKET_AD_COPY_FIELDS, MAX_MICROMARKET_AD_BYTES, createMicromarketAdTemplate } from '@/lib/micromarket-ad-content.mjs';
import type { MicromarketAdContent } from '@/lib/micromarket-ad-schema';
import type { SaveResult } from '@/lib/action-results';
import DeployButton from './DeployButton';
import AdPagePreview from './AdPagePreview';

function Field({ id, label, value, onChange, limit, multiline = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; limit: number; multiline?: boolean;
}) {
  return <div><label htmlFor={id} className="cms-label">{label}</label>{multiline
    ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={5} maxLength={limit} className="cms-input" />
    : <input id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={limit} className="cms-input" />}</div>;
}

function download(content: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MicromarketAdForm({ content, expectedUpdatedAt, state, action, deployable, previewUrl }: {
  content: MicromarketAdContent; expectedUpdatedAt: string; state: { hasDraft: boolean; staged: boolean }; deployable: boolean; previewUrl: string;
  action: (previous: SaveResult | undefined, form: FormData) => Promise<SaveResult>;
}) {
  const [fields, setFields] = useState(content);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [edited, setEdited] = useState(false);
  const [clientError, setClientError] = useState('');
  const [result, formAction, pending] = useActionState(async (previous: SaveResult | undefined, form: FormData): Promise<SaveResult> => {
    try { return await action(previous, form); }
    catch (error) { unstable_rethrow(error); return { ok: false, error: 'Could not confirm the save. Your edits are still here; check your connection and retry.' }; }
  }, undefined);
  const serialized = JSON.stringify(fields);
  const change = <K extends keyof MicromarketAdContent>(key: K, value: MicromarketAdContent[K]) => {
    setFields(current => ({ ...current, [key]: value })); setEdited(true);
  };
  const copyFields = (section: string) => MICROMARKET_AD_COPY_FIELDS.filter(field => field.section === section).map(field => {
    const key = field.key as keyof MicromarketAdContent['copy'];
    return <Field key={key} id={'copy-' + key} label={field.label} value={fields.copy[key]} limit={field.limit} multiline={field.multiline}
      onChange={value => change('copy', { ...fields.copy, [key]: value })} />;
  });
  return <form action={formAction} aria-busy={pending} className="mt-6 pb-48" onSubmit={event => {
    setClientError('');
    if (pending) event.preventDefault();
    if (new TextEncoder().encode(serialized).length > MAX_MICROMARKET_AD_BYTES) {
      event.preventDefault(); setClientError('This page has too much text. Shorten the copy before saving.');
    }
  }}>
    <input type="hidden" name="citySlug" value={content.citySlug} />
    <input type="hidden" name="slug" value={content.slug} />
    <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <input type="hidden" name="content" value={serialized} />
    <p className="mb-3 text-sm leading-relaxed text-wareongo-slate">Edit only {content.name}’s local headings, area guide, rent explanation and FAQs. The Bangalore template supplies the shared sections, forms, footer and desktop/mobile layout. Warehouse counts and rent ranges come from current inventory.</p>
    <p className="cms-hint mb-5">Use {'{listings}'} and {'{rentRange}'} for live figures and **text** for emphasis. The main heading automatically ends with “in {content.name}”. Complete every field before saving for the next build.</p>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Micromarket ad editor">
      {(['edit', 'preview'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'cms-btn-primary' : 'cms-btn'} onClick={() => setTab(value)}>{value === 'edit' ? 'Edit local copy' : 'Preview'}</button>)}
    </div>
    <details className="cms-card mb-5"><summary className="cursor-pointer text-sm font-medium">Writing template and schema</summary>
      <p className="cms-hint mt-3">Download the local-copy fields for this micromarket or the general schema for new campaigns. Apply finished copy in the fields below.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="cms-btn" onClick={() => download(fields, content.slug + '-ad-copy.json')}>Download current copy</button>
        <button type="button" className="cms-btn" onClick={() => download(createMicromarketAdTemplate(content), content.slug + '-ad-template.json')}>Download blank template</button>
        <a href="/api/ad-pages/micromarkets/schema" className="cms-btn" download>Download general schema</a>
      </div>
    </details>
    <fieldset disabled={pending} aria-label="Local micromarket copy" className={tab === 'edit' ? 'min-w-0 space-y-4' : 'hidden'}>
      <section className="cms-card space-y-5"><h2 className="cms-title text-lg">Main heading</h2>{copyFields('hero')}</section>
      <details className="cms-card"><summary className="cms-title cursor-pointer text-lg">Section headings</summary><div className="mt-5 space-y-5">{copyFields('headings')}</div></details>
      <section className="cms-card space-y-5"><h2 className="cms-title text-lg">About {content.name}</h2>
        {(['whereItIs', 'whoItSuits'] as const).map(key => <Field key={key} id={'area-' + key} label={key === 'whereItIs' ? 'Where it is' : 'Who it suits'} value={fields.area[key]} limit={5000} multiline onChange={value => change('area', { ...fields.area, [key]: value })} />)}
      </section>
      <section className="cms-card space-y-5"><h2 className="cms-title text-lg">Local rent guide</h2>
        <p className="cms-hint">The rent table is calculated automatically. Explain the local differences here.</p>
        {(['intro', 'description'] as const).map(key => <Field key={key} id={'rent-' + key} label={key === 'intro' ? 'Introduction' : 'Rent guide explanation'} value={fields.rentGuide[key]} limit={key === 'intro' ? 2000 : 4000} multiline onChange={value => change('rentGuide', { ...fields.rentGuide, [key]: value })} />)}
      </section>
      <section className="cms-card space-y-5"><h2 className="cms-title text-lg">Micromarket card bylines</h2>
        <p className="cms-hint">Short descriptions below the location names on desktop and mobile map cards.</p>
        {fields.mapBylines.map((item, index) => <Field key={item.slug} id={'map-byline-' + item.slug} label={item.slug.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase())} value={item.byline} limit={100} onChange={value => change('mapBylines', fields.mapBylines.map((byline, i) => i === index ? { ...byline, byline: value } : byline))} />)}
      </section>
      <section className="cms-card space-y-5"><h2 className="cms-title text-lg">Local FAQs</h2>
        <p className="cms-hint">Add questions specific to {content.name}. The WareOnGo fee question comes from the shared Bangalore page.</p>
        {fields.faqs.map((faq, index) => <div key={index} className="cms-card space-y-3">
          {(['q', 'a'] as const).map(key => <Field key={key} id={'faq-' + index + '-' + key} label={(key === 'q' ? 'Question ' : 'Answer ') + (index + 1)} value={faq[key]} limit={key === 'q' ? 200 : 4000} multiline={key === 'a'} onChange={value => change('faqs', fields.faqs.map((item, i) => i === index ? { ...item, [key]: value } : item))} />)}
          <button type="button" className="cms-btn-danger" disabled={fields.faqs.length <= 1} onClick={() => change('faqs', fields.faqs.filter((_, i) => i !== index))}>Remove FAQ</button>
        </div>)}
        <button type="button" className="cms-btn" disabled={fields.faqs.length >= 10} onClick={() => change('faqs', [...fields.faqs, { q: '', a: '' }])}>+ Local FAQ</button>
      </section>
      <details className="cms-card"><summary className="cms-title cursor-pointer text-lg">Page title and description</summary><div className="mt-5 space-y-5">{copyFields('metadata')}<p className="cms-hint">Ad pages stay excluded from search indexing.</p></div></details>
    </fieldset>
    {tab === 'preview' && <AdPagePreview content={fields} url={previewUrl} micromarket />}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ui-line bg-wareongo-ivory p-4 lg:left-64"><div className="mx-auto max-w-5xl space-y-3">
      {(clientError || result?.ok === false) && <p role="alert" className="text-sm text-red-700">{clientError || (result?.ok === false ? result.error : '')}</p>}
      <p className="text-xs text-wareongo-slate">{edited ? 'Unsaved changes' : state.hasDraft ? 'Draft saved privately' : 'No unsaved changes'}{state.staged ? ' · Changes ready for next build' : ''}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="draft" disabled={pending} className="cms-btn">{pending ? 'Saving…' : 'Save draft'}</button>
        <button type="submit" name="intent" value="publish" disabled={pending} className="cms-btn-primary">Save for next build</button>
        {!pending && !edited && <DeployButton configured={deployable} />}
      </div>
    </div></div>
  </form>;
}
