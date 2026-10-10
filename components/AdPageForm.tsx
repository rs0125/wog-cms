'use client';

import { useActionState, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { AD_COPY_GROUPS, type AdPageContent, type AdPageImageKey } from '@/lib/ad-page-schema';
import { MAX_AD_PAGE_BYTES } from '@/lib/ad-page-content.mjs';
import type { SaveResult } from '@/lib/action-results';
import SingleImagePicker from './SingleImagePicker';
import DeployButton from './DeployButton';
import AdPagePreview from './AdPagePreview';
import WordCountSummary, { WordCount } from './WordCount';
import { adPageWordSections } from '@/lib/page-word-counts';
import { totalWords } from '@/lib/word-count';
import AiWriting from './AiWriting';

function Field({ id, label, value, onChange, multiline = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; multiline?: boolean;
}) {
  return <div><label htmlFor={id} className="cms-label">{label}</label>{multiline
    ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={4} maxLength={20000} className="cms-input" />
    : <input id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={20000} className="cms-input" />}</div>;
}

export default function AdPageForm({ content, expectedUpdatedAt, state, action, deployable, previewUrl }: {
  content: AdPageContent; expectedUpdatedAt: string; state: { hasDraft: boolean; staged: boolean }; deployable: boolean;
  previewUrl: string;
  action: (previous: SaveResult | undefined, form: FormData) => Promise<SaveResult>;
}) {
  const [result, formAction, pending] = useActionState(async (previous: SaveResult | undefined, form: FormData): Promise<SaveResult> => {
    try {
      return await action(previous, form);
    } catch (error) {
      // Next also throws for successful saves and authentication redirects.
      // Preserve those; transport failures should leave the editor mounted.
      unstable_rethrow(error);
      return { ok: false, error: 'Could not confirm the save. Your edits are still here. Check your connection and retry.' };
    }
  }, undefined);
  const [fields, setFields] = useState(content);
  const [edited, setEdited] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [clientError, setClientError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState<AdPageImageKey[]>([]);
  const uploading = uploadingImages.length > 0;
  const serialized = JSON.stringify(fields);
  const wordCounts = adPageWordSections(fields);
  const change = <K extends keyof AdPageContent>(key: K, value: AdPageContent[K]) => { setFields(current => ({ ...current, [key]: value })); setEdited(true); };
  // An upload may finish after a different image was edited. Merge into the
  // latest state rather than the render in which the upload started.
  function changeImage(key: AdPageImageKey, value: AdPageContent['images'][AdPageImageKey] | null) {
    setFields(current => ({ ...current, images: { ...current.images, [key]: value ?? { ...current.images[key], url: '', alt: '' } } }));
    setEdited(true);
  }
  const changeAreaGroup = (index: number, group: AdPageContent['areaGroups'][number]) => change('areaGroups', fields.areaGroups.map((value, i) => i === index ? group : value));
  const imageSlots = (group: string) => (Object.keys(fields.images) as AdPageImageKey[]).filter(key =>
    group === 'featured' ? key.startsWith('featured-') : group === 'available' ? key.startsWith('warehouse-') : group === 'locations' ? key.startsWith('micromarket-') : group === 'services' ? key === 'services' : false,
  );

  return <form action={formAction} onSubmit={event => {
    setClientError(null);
    if (uploading || pending) event.preventDefault();
    if (new TextEncoder().encode(serialized).byteLength > MAX_AD_PAGE_BYTES) {
      event.preventDefault();
      setClientError('This page has too much text to save. Shorten the content and try again; your edits are still here.');
    }
  }} aria-busy={pending || uploading} className="mt-6 pb-48">
    <input type="hidden" name="slug" value={content.slug} />
    <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <input type="hidden" name="content" value={serialized} />
    <p className="mb-5 text-sm leading-relaxed text-wareongo-slate">Edit the Bangalore copy, area recommendations, rent guide, FAQs and photos below. Warehouse details and micromarket counts come from the catalogue. Shared navigation, map positions and company figures follow the website.</p>
    <div className="mb-6 flex gap-2" role="group" aria-label="Ad page editor">
      {(['edit', 'preview'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'cms-btn-primary' : 'cms-btn'} onClick={() => setTab(value)}>{value === 'edit' ? 'Edit content' : 'Preview'}</button>)}
    </div>
    <AiWriting target={{ type: 'ad', slug: content.slug }} initial={content} values={fields}
      expectedUpdatedAt={expectedUpdatedAt} disabled={pending || uploading}
      lockedReason="This ad page already has approved content. You can download its writing template; make changes in the editor."
      onReveal={() => setTab('edit')} onChange={next => { setFields(next as AdPageContent); setEdited(true); }} />
    <WordCountSummary sections={wordCounts} />
    <fieldset disabled={pending} aria-label="Ad page content" className={tab === 'edit' ? 'min-w-0 space-y-4' : 'hidden'}>
      {AD_COPY_GROUPS.map(group => <details key={group.id} open={group.id === 'hero'} className="cms-card" id={`ad-section-${group.id}`}>
        <summary className="cms-title cursor-pointer text-lg">{group.title}
          {group.id !== 'settings' && <WordCount count={wordCounts.find(section => section.id === group.id)!.words} className="ml-3 inline-block" />}
        </summary>
        <div className="mt-5 space-y-5">
          {group.hint && <p className="cms-hint">{group.hint}</p>}
          {group.fields.map(field => <Field key={field.key} id={`copy-${field.key}`} label={field.label} multiline={field.multiline} value={fields.copy[field.key]} onChange={value => change('copy', { ...fields.copy, [field.key]: value })} />)}
          {group.id === 'settings' && <p className="text-xs text-wareongo-slate">This campaign page keeps its /bangalore URL and stays excluded from search indexing.</p>}
          {group.id === 'why' && fields.benefits.map((item, index) => <div key={item.id} className="cms-card space-y-3">
            <Field id={`benefit-${item.id}-title`} label={`Benefit ${index + 1}: desktop heading`} value={item.title} onChange={title => change('benefits', fields.benefits.map((value, i) => i === index ? { ...value, title } : value))} />
            <Field id={`benefit-${item.id}-mobile-title`} label="Mobile heading (optional; uses the main heading when empty)" value={item.mobileTitle} onChange={mobileTitle => change('benefits', fields.benefits.map((value, i) => i === index ? { ...value, mobileTitle } : value))} />
            <Field id={`benefit-${item.id}-body`} label="Desktop description (optional)" value={item.body} multiline onChange={body => change('benefits', fields.benefits.map((value, i) => i === index ? { ...value, body } : value))} />
            <Field id={`benefit-${item.id}-mobileBody`} label="Mobile description (optional; uses desktop when empty)" value={item.mobileBody} multiline onChange={mobileBody => change('benefits', fields.benefits.map((value, i) => i === index ? { ...value, mobileBody } : value))} />
          </div>)}
          {group.id === 'services' && fields.services.map((item, index) => <div key={item.id} className="cms-card space-y-3">
            {(['title', 'body', 'mobileTitle', 'mobileBody', 'cta'] as const).map(key => <Field key={key} id={`service-${item.id}-${key}`} label={{ title: `Service ${index + 1}: desktop heading`, body: 'Desktop description', mobileTitle: 'Mobile heading', mobileBody: 'Mobile description', cta: 'Button label' }[key]} value={item[key]} multiline={key === 'body' || key === 'mobileBody'} onChange={text => change('services', fields.services.map((value, i) => i === index ? { ...value, [key]: text } : value))} />)}
          </div>)}
          {group.id === 'audiences' && fields.audiences.map((item, index) => <div key={item.id} className="cms-card space-y-3">
            {(['title', 'body', 'mobileTitle', 'mobileBody', 'primaryCta', ...(item.id === '3pls' ? ['secondaryCta' as const] : [])] as const).map(key => <Field key={key} id={`audience-${item.id}-${key}`} label={{ title: `Audience ${index + 1}: desktop heading`, body: 'Desktop description', mobileTitle: 'Mobile heading (optional; uses desktop when empty)', mobileBody: 'Mobile description (optional; uses desktop when empty)', primaryCta: 'Main button label', secondaryCta: 'Second button label' }[key]} value={item[key]} multiline={key === 'body' || key === 'mobileBody'} onChange={text => change('audiences', fields.audiences.map((value, i) => i === index ? { ...value, [key]: text } : value))} />)}
          </div>)}
          {group.id === 'areas' && fields.areaGroups.map((areaGroup, groupIndex) => <div key={areaGroup.id} className="cms-card space-y-3">
            <Field id={`area-group-${areaGroup.id}`} label={areaGroup.scope === 'belts' ? 'Highway group heading' : 'City group heading'} value={areaGroup.title} onChange={title => changeAreaGroup(groupIndex, { ...areaGroup, title })} />
            {areaGroup.rows.map((row, index) => <div key={index} className="cms-card space-y-3">
              {(['need', 'areas'] as const).map(key => <Field key={key} id={`area-${areaGroup.id}-${index}-${key}`} label={key === 'need' ? `Requirement ${index + 1}` : 'Suggested areas'} value={row[key]} onChange={text => changeAreaGroup(groupIndex, { ...areaGroup, rows: areaGroup.rows.map((value, i) => i === index ? { ...value, [key]: text } : value) })} />)}
              <button type="button" className="cms-btn-danger" onClick={() => changeAreaGroup(groupIndex, { ...areaGroup, rows: areaGroup.rows.filter((_, i) => i !== index) })}>Remove row</button>
            </div>)}
            <button type="button" disabled={areaGroup.rows.length >= 30} className="cms-btn" onClick={() => changeAreaGroup(groupIndex, { ...areaGroup, rows: [...areaGroup.rows, { need: '', areas: '' }] })}>+ Area recommendation</button>
          </div>)}
          {group.id === 'rent' && <>
            {(['intro', 'description'] as const).map(key => <Field key={key} id={`rent-${key}`} label={key === 'intro' ? 'Introduction' : 'Rent guide explanation'} value={fields.rentGuide[key]} multiline onChange={text => change('rentGuide', { ...fields.rentGuide, [key]: text })} />)}
            {fields.rentGuide.rows.map((row, index) => <div key={index} className="cms-card space-y-3">
              {(['area', 'rent'] as const).map(key => <Field key={key} id={`rent-${index}-${key}`} label={key === 'area' ? `Area ${index + 1}` : 'Rent range'} value={row[key]} onChange={text => change('rentGuide', { ...fields.rentGuide, rows: fields.rentGuide.rows.map((value, i) => i === index ? { ...value, [key]: text } : value) })} />)}
              <button type="button" className="cms-btn-danger" onClick={() => change('rentGuide', { ...fields.rentGuide, rows: fields.rentGuide.rows.filter((_, i) => i !== index) })}>Remove row</button>
            </div>)}
            <button type="button" disabled={fields.rentGuide.rows.length >= 30} className="cms-btn" onClick={() => change('rentGuide', { ...fields.rentGuide, rows: [...fields.rentGuide.rows, { area: '', rent: '' }] })}>+ Rent row</button>
          </>}
          {group.id === 'faqs' && <>
            {fields.faqs.map((faq, index) => <div key={index} className="cms-card space-y-3">
              {(['q', 'a'] as const).map(key => <Field key={key} id={`faq-${index}-${key}`} label={`${key === 'q' ? 'Question' : 'Answer'} ${index + 1}`} value={faq[key]} multiline={key === 'a'} onChange={text => change('faqs', fields.faqs.map((value, i) => i === index ? { ...value, [key]: text } : value))} />)}
              <button type="button" className="cms-btn-danger" onClick={() => change('faqs', fields.faqs.filter((_, i) => i !== index))}>Remove FAQ</button>
            </div>)}
            <button type="button" disabled={fields.faqs.length >= 30} className="cms-btn" onClick={() => change('faqs', [...fields.faqs, { q: '', a: '' }])}>+ FAQ</button>
          </>}
          {imageSlots(group.id).length > 0 && <section className="space-y-4" aria-label={`${group.title} images`}>
            <h3 className="cms-title text-base">Images</h3>
            {imageSlots(group.id).map(key => <div key={key} className="space-y-2" data-image-slot={key}>
              <p className="text-sm font-medium">{key.startsWith('warehouse-') || key.startsWith('featured-') ? `Warehouse #${key.split('-')[1]}` : key === 'services' ? 'Services image' : key.slice('micromarket-'.length).replace(/^./, letter => letter.toUpperCase())}</p>
              <SingleImagePicker value={fields.images[key].url ? fields.images[key] : null} ratio="16:9" onChange={value => changeImage(key, value)} onUploadStateChange={busy => setUploadingImages(current => busy ? [...current, key] : current.filter(item => item !== key))} />
            </div>)}
          </section>}
        </div>
      </details>)}
    </fieldset>
    {tab === 'preview' && <AdPagePreview content={fields} url={previewUrl} />}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ui-line bg-wareongo-ivory p-4 lg:left-64">
      <div className="mx-auto max-w-5xl space-y-2">
        {(clientError || result?.ok === false) && <p role="alert" className="text-sm text-red-700">{clientError || (result?.ok === false ? result.error : '')}</p>}
        {uploading && <p role="status" className="text-sm text-wareongo-slate">Uploading photos… Wait for uploads to finish before saving.</p>}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-wareongo-slate">{edited ? 'Unsaved changes' : state.hasDraft ? 'Draft saved privately' : 'No unsaved changes'}{state.staged ? ' · Changes ready for next build' : ''}</p>
          <WordCount count={totalWords(wordCounts)} label="Total" variant="total" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="draft" disabled={pending || uploading} className="cms-btn">{pending ? 'Saving…' : 'Save draft'}</button>
          <button type="submit" name="intent" value="publish" disabled={pending || uploading} className="cms-btn-primary">Save for next build</button>
          {!pending && !uploading && !edited && <DeployButton configured={deployable} />}
        </div>
      </div>
    </div>
  </form>;
}
