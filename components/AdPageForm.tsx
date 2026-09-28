'use client';

import { useActionState, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { AD_COPY_GROUPS, type AdPageContent, type AdPageImageKey } from '@/lib/ad-page-schema';
import { MAX_AD_PAGE_BYTES } from '@/lib/ad-page-content.mjs';
import type { SaveResult } from '@/lib/action-results';
import SingleImagePicker from './SingleImagePicker';
import DeployButton from './DeployButton';
import AdPagePreview from './AdPagePreview';

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
  const change = <K extends keyof AdPageContent>(key: K, value: AdPageContent[K]) => { setFields(current => ({ ...current, [key]: value })); setEdited(true); };
  // An upload may finish after a different image was edited. Merge into the
  // latest state rather than the render in which the upload started.
  function changeImage(key: AdPageImageKey, value: AdPageContent['images'][AdPageImageKey] | null) {
    setFields(current => ({ ...current, images: { ...current.images, [key]: value ?? { ...current.images[key], url: '', alt: '' } } }));
    setEdited(true);
  }
  const figures = (key: 'overviewStats') => <div className="space-y-3">
    {fields[key].map((figure, index) => <div key={index} className="cms-card grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
      <Field id={`${key}-${index}-value`} label={`Figure ${index + 1}`} value={figure.value} onChange={value => change(key, fields[key].map((item, i) => i === index ? { ...item, value } : item))} />
      <Field id={`${key}-${index}-label`} label="Description" value={figure.label} onChange={label => change(key, fields[key].map((item, i) => i === index ? { ...item, label } : item))} />
      <button type="button" className="cms-btn-danger self-end" onClick={() => change(key, fields[key].filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <button type="button" disabled={fields[key].length >= 8} className="cms-btn" onClick={() => change(key, [...fields[key], { value: '', label: '' }])}>+ Figure</button>
  </div>;
  const imageSlots = (group: string) => (Object.keys(fields.images) as AdPageImageKey[]).filter(key =>
    group === 'featured' ? key.startsWith('featured-') : group === 'available' ? key.startsWith('warehouse-') : group === 'locations' ? key.startsWith('micromarket-') : group === 'services' ? key === 'services' : group === 'why' ? key === 'why' : false,
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
    <p className="mb-5 text-sm leading-relaxed text-wareongo-slate">The current Bangalore copy and photos are imported below. Warehouse details, micromarket counts, map positions and market tables stay connected to the existing catalogue. Shared navigation and company logos follow the website.</p>
    <div className="mb-6 flex gap-2" role="group" aria-label="Ad page editor">
      {(['edit', 'preview'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'cms-btn-primary' : 'cms-btn'} onClick={() => setTab(value)}>{value === 'edit' ? 'Edit content' : 'Preview'}</button>)}
    </div>
    <fieldset disabled={pending} aria-label="Ad page content" className={tab === 'edit' ? 'min-w-0 space-y-4' : 'hidden'}>
      {AD_COPY_GROUPS.map(group => <details key={group.id} open={group.id === 'hero'} className="cms-card" id={`ad-section-${group.id}`}>
        <summary className="cms-title cursor-pointer text-lg">{group.title}</summary>
        <div className="mt-5 space-y-5">
          {group.fields.map(field => <Field key={field.key} id={`copy-${field.key}`} label={field.label} multiline={field.multiline} value={fields.copy[field.key]} onChange={value => change('copy', { ...fields.copy, [field.key]: value })} />)}
          {group.id === 'settings' && <p className="text-xs text-wareongo-slate">This campaign page keeps its /bangalore URL and stays excluded from search indexing.</p>}
          {group.id === 'hero' && <div className="grid gap-3 sm:grid-cols-2">
            {fields.heroSteps.map((step, index) => <Field key={index} id={`hero-step-${index}`} label={`Step ${index + 1}`} value={step} onChange={text => change('heroSteps', fields.heroSteps.map((value, i) => i === index ? text : value))} />)}
          </div>}
          {group.id === 'why' && fields.benefits.map((item, index) => <div key={item.id} className="cms-card space-y-3">
            <Field id={`benefit-${item.id}-title`} label={`Benefit ${index + 1}`} value={item.title} onChange={title => change('benefits', fields.benefits.map((value, i) => i === index ? { ...value, title } : value))} />
            <Field id={`benefit-${item.id}-body`} label="Supporting copy (optional)" value={item.body} multiline onChange={body => change('benefits', fields.benefits.map((value, i) => i === index ? { ...value, body } : value))} />
          </div>)}
          {group.id === 'services' && fields.services.map((item, index) => <div key={item.id} className="cms-card space-y-3">
            {(['title', 'body', 'cta'] as const).map(key => <Field key={key} id={`service-${item.id}-${key}`} label={key === 'title' ? `Service ${index + 1}` : key === 'body' ? 'Description' : 'Button label'} value={item[key]} multiline={key === 'body'} onChange={text => change('services', fields.services.map((value, i) => i === index ? { ...value, [key]: text } : value))} />)}
          </div>)}
          {group.id === 'audiences' && fields.audiences.map((item, index) => <div key={item.id} className="cms-card space-y-3">
            {(['title', 'body', 'primaryCta', ...(item.id === '3pls' ? ['secondaryCta' as const] : [])] as const).map(key => <Field key={key} id={`audience-${item.id}-${key}`} label={key === 'title' ? `Audience ${index + 1}` : key === 'body' ? 'Description' : key === 'primaryCta' ? 'Main button label' : 'Second button label'} value={item[key]} multiline={key === 'body'} onChange={text => change('audiences', fields.audiences.map((value, i) => i === index ? { ...value, [key]: text } : value))} />)}
          </div>)}
          {group.id === 'areas' && <div className="space-y-3">{fields.areaRows.map((row, index) => <div key={index} className="cms-card space-y-3">
            <Field id={`area-${index}-need`} label={`Requirement ${index + 1}`} value={row.need} multiline onChange={need => change('areaRows', fields.areaRows.map((value, i) => i === index ? { ...value, need } : value))} />
            <Field id={`area-${index}-areas`} label="Suggested areas, separated by commas" value={row.areas.join(',')} onChange={areas => change('areaRows', fields.areaRows.map((value, i) => i === index ? { ...value, areas: areas.split(',') } : value))} />
            <button type="button" className="cms-btn-danger" onClick={() => change('areaRows', fields.areaRows.filter((_, i) => i !== index))}>Remove row</button>
          </div>)}<button type="button" disabled={fields.areaRows.length >= 30} className="cms-btn" onClick={() => change('areaRows', [...fields.areaRows, { need: '', areas: [''] }])}>+ Area recommendation</button></div>}
          {group.id === 'overview' && <>
            {fields.overviewParagraphs.map((paragraph, index) => <Field key={index} id={`overview-${index}`} label={`Overview paragraph ${index + 1}`} value={paragraph} multiline onChange={text => change('overviewParagraphs', fields.overviewParagraphs.map((value, i) => i === index ? text : value))} />)}
            <h3 className="cms-label">Overview figures</h3>{figures('overviewStats')}
          </>}
          {imageSlots(group.id).length > 0 && <section className="space-y-4" aria-label={`${group.title} images`}>
            <h3 className="cms-title text-base">Images</h3>
            {imageSlots(group.id).map(key => <div key={key} className="space-y-2">
              <p className="text-sm font-medium">{key.startsWith('warehouse-') || key.startsWith('featured-') ? `Warehouse #${key.split('-')[1]}` : key === 'services' ? 'Services image' : key === 'why' ? 'Why choose WareOnGo image' : key.slice('micromarket-'.length).replace(/^./, letter => letter.toUpperCase())}</p>
              <SingleImagePicker value={fields.images[key].url ? fields.images[key] : null} ratio="16:9" onChange={value => changeImage(key, value)} onUploadStateChange={busy => setUploadingImages(current => busy ? [...current, key] : current.filter(item => item !== key))} />
            </div>)}
          </section>}
        </div>
      </details>)}
    </fieldset>
    {tab === 'preview' && <AdPagePreview content={fields} url={previewUrl} />}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-wareongo-blue/20 bg-wareongo-ivory p-4 lg:left-64">
      <div className="mx-auto max-w-5xl space-y-2">
        {(clientError || result?.ok === false) && <p role="alert" className="text-sm text-red-700">{clientError || (result?.ok === false ? result.error : '')}</p>}
        {uploading && <p role="status" className="text-sm text-wareongo-slate">Uploading photos… Wait for uploads to finish before saving.</p>}
        <p className="text-xs text-wareongo-slate">{edited ? 'Unsaved changes' : state.hasDraft ? 'Draft saved privately' : 'No unsaved changes'}{state.staged ? ' · Changes ready for next build' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="draft" disabled={pending || uploading} className="cms-btn">{pending ? 'Saving…' : 'Save draft'}</button>
          <button type="submit" name="intent" value="publish" disabled={pending || uploading} className="cms-btn-primary">Save for next build</button>
          {!pending && !uploading && !edited && <DeployButton configured={deployable} />}
        </div>
      </div>
    </div>
  </form>;
}
