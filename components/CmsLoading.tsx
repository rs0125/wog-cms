import type { ReactNode } from 'react';
import { NAVIGATION_GROUPS } from '@/lib/navigation';
import { AD_COPY_GROUPS } from '@/lib/ad-page-schema';
import { AD_HERO_STEP_COUNT } from '@/lib/ad-page-content.mjs';
import { isDeployConfigured } from '@/lib/deploy';
import { WordCount } from './WordCount';
import OverviewIntro from './OverviewIntro';

function Skeleton({ className = 'h-3 w-full' }: { className?: string }) {
  return <div className={`cms-skeleton ${className}`} />;
}

function Frame({ label, children, className = 'max-w-4xl p-6 sm:p-10' }: {
  label: string; children: ReactNode; className?: string;
}) {
  return <main className={`mx-auto ${className}`} data-cms-loading={label}>
    <p role="status" className="sr-only">Loading {label}…</p>
    <div aria-hidden="true">{children}</div>
  </main>;
}

function Button({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return <div className={`relative ${primary ? 'cms-btn-primary' : 'cms-btn'}`}>
    <span className="invisible">{children}</span><Skeleton className="absolute inset-0 rounded-lg" />
  </div>;
}

function Deploy({ label = 'Deploy' }: { label?: string }) {
  return isDeployConfigured() ? <Button primary>{label}</Button> : null;
}

function Total() {
  return <span className="relative inline-block"><WordCount count={0} label="Total" variant="total" className="invisible" />
    <span className="cms-skeleton absolute inset-0 rounded-lg" /></span>;
}

function Paragraph() {
  return <div className="space-y-2"><Skeleton /><Skeleton className="h-3 w-3/4" /></div>;
}

export function DashboardLoading() {
  return <Frame label="content menu" className="max-w-6xl px-5 py-8 sm:p-10">
    <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
      <div><p className="cms-eyebrow mb-3">Your workspace</p><h1 className="cms-title">Content menu</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-wareongo-slate">Choose a category to create, edit or publish your website content.</p></div><Deploy label="Deploy website" />
    </header>
    <div className="space-y-10">{NAVIGATION_GROUPS.map(group => <section key={group.id}>
      <div className="mb-4"><h2 className="ui-card-title text-ui-ink">{group.label}</h2><p className="mt-1 text-xs leading-relaxed text-wareongo-slate">{group.description}</p></div>
      <div className={`grid gap-4 ${group.items.length > 1 ? 'xl:grid-cols-3' : ''}`}>
        {group.items.map(item => <div key={item.id} className="overflow-hidden rounded-xl border border-ui-line bg-ui-surface">
          <div className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h3 className="ui-panel-title text-ui-ink">{item.label}</h3><span>→</span></div>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-wareongo-slate">{item.description}</p>
            <div className="mt-5 border-t border-ui-line pt-4"><div className="flex h-7 items-center"><Skeleton className="h-5 w-28" /></div><div className="mt-1 flex h-4 items-center"><Skeleton className="h-3 w-36" /></div></div>
          </div>
          {item.children && <div className="grid border-t border-ui-line sm:grid-cols-2">{item.children.map(child =>
            <div key={child.id} className="flex min-h-14 items-center justify-between gap-3 border-ui-line px-5 py-3 text-sm font-medium text-wareongo-blue last:border-t sm:px-6 sm:last:border-l sm:last:border-t-0">{child.label}<span>→</span></div>)}</div>}
        </div>)}
      </div>
    </section>)}</div>
  </Frame>;
}

export function PageListLoading({ overview = false, label = 'blogs' }: { overview?: boolean; label?: string }) {
  return <Frame label={label}>
    <header className={`flex flex-wrap items-end gap-3 ${overview ? 'mb-6' : 'mb-8'}`}>
      <div className="min-w-0">{overview && <div className="cms-eyebrow mb-1 flex h-[1.5em] items-center"><Skeleton className="h-3 w-16" /></div>}
        {label === 'blogs' ? <h1 className="cms-title">Blogs</h1> : label === 'micromarkets' ? <h1 className="cms-title">Micromarkets</h1> : <div className="cms-title"><Skeleton className="h-[1.25em] w-36" /></div>}
        <Skeleton className="mt-1 h-5 w-48" /></div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {label === 'overview pages' && <Button>States</Button>}<Deploy /><Button primary>{overview ? 'New page' : 'New blog'}</Button>
      </div>
    </header>
    {overview && <><OverviewIntro micromarket={label === 'micromarkets'} />
      <Skeleton className="mb-3 h-4 w-48" /></>}
    <div className="space-y-2.5">{Array.from({ length: 6 }, (_, i) => <div key={i} className="cms-card flex flex-wrap items-center gap-3 sm:flex-nowrap">
      {!overview && <Skeleton className="h-5 w-8 shrink-0" />}
      <div className={`min-w-0 flex-1 space-y-2 ${overview ? 'basis-full sm:basis-0' : 'basis-3/4 sm:basis-0'}`}>
        <Skeleton className={`h-4 ${i % 2 ? 'w-2/3' : 'w-3/4'}`} /><Skeleton className="h-3 w-1/2" />
      </div>
      {overview && <Skeleton className="h-3 w-16" />}
      <Skeleton className="h-7 w-20 shrink-0 rounded-full" />
      {overview && <Skeleton className="h-11 w-16 rounded-lg" />}
    </div>)}</div>
  </Frame>;
}

export function CatalogueLoading({ title, pages, action = true }: { title: string; pages: Record<string, string>; action?: boolean }) {
  return <Frame label={title.toLowerCase()}>
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3"><h1 className="cms-title">{title}</h1><Deploy /></header>
    <p className="mb-8 text-sm text-wareongo-slate">{title === 'Services'
      ? 'Write your service pages here. Empty pages and drafts stay private. Use “Save for next build” when the content is ready.'
      : title === 'Legal pages' ? 'Save drafts privately. Use “Save for next build” when the copy is ready, then deploy or wait for the nightly build.'
        : 'Edit campaign landing pages. Save drafts privately, then use “Save for next build” when your changes are ready.'}</p>
    <div className="space-y-4">{Object.entries(pages).map(([slug, name]) => <div className="cms-card" key={slug}>
      <h2 className="ui-panel-title text-ui-ink">{name}</h2>
      <p className="mt-1 text-sm text-wareongo-slate">{title === 'Services' ? '/services/' : '/'}{slug}{title === 'Ad pages' && ' · Google Ads landing page'}</p>
      <div className="mt-3 flex h-5 items-center"><Skeleton className="h-3 w-48 max-w-full" /></div>
      {action && <div className="mt-4"><Button>Edit page</Button></div>}
    </div>)}</div>
  </Frame>;
}

function Field({ tall = false }: { tall?: boolean }) {
  return <div><div className="cms-label flex h-5 items-center"><Skeleton className="h-3 w-28" /></div>
    <Skeleton className={`${tall ? 'h-28' : 'h-12'} w-full rounded-lg`} /></div>;
}

function Tabs({ capsule = false, ad = false }: { capsule?: boolean; ad?: boolean }) {
  return capsule ? <div className="inline-flex max-w-full flex-wrap rounded-xl border border-ui-outline bg-ui-surface p-1">
    {['Edit', 'Preview'].map(label => <div key={label} className="relative min-h-11 rounded-lg px-4 py-2 text-sm font-semibold">
      <span className="invisible">{label}</span><Skeleton className="absolute inset-0 rounded-lg" /></div>)}
  </div> : <div className="flex gap-2"><Button primary>{ad ? 'Edit content' : 'Edit'}</Button><Button>Preview</Button></div>;
}

function WritingPanel() {
  return <div className="cms-card"><div className="min-h-11 py-3 text-sm font-semibold text-wareongo-blue">
    <span className="mr-2">▸</span>AI writing <span className="ml-2 font-normal text-wareongo-slate">Template and JSON import</span>
  </div></div>;
}

function WordCounts({ rows }: { rows: number }) {
  return <div className="cms-card">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold text-wareongo-blue">Word count</h2><Total /></div>
    <p className="cms-hint">Counts the page copy you edit. Excludes SEO fields, image descriptions and automatically generated content.</p>
    <div className="mt-4 grid gap-x-8 sm:grid-cols-2">{Array.from({ length: rows }, (_, i) =>
      <div key={i} className="flex justify-between gap-4 border-t border-ui-line py-3"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-14" /></div>)}</div>
  </div>;
}

type EditorKind = 'blog' | 'overview' | 'micromarket' | 'service' | 'legal' | 'ad';

function SaveBar({ kind }: { kind: EditorKind }) {
  const compact = ['blog', 'overview', 'micromarket'].includes(kind);
  return <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 border-t border-ui-line lg:left-64 ${compact ? 'bg-wareongo-ivory/95 px-6 py-3 backdrop-blur' : 'bg-wareongo-ivory p-4'}`}>
    <div className={`mx-auto ${kind === 'ad' ? 'max-w-5xl' : 'max-w-4xl'} ${compact ? 'flex flex-wrap items-center gap-3' : 'space-y-2'}`}>
      {compact ? <><span className="text-sm text-wareongo-slate">← Back</span><Total /><div className="ml-auto"><Button primary>Save draft</Button></div></>
        : <><div className="flex flex-wrap items-baseline justify-between gap-2"><Skeleton className="h-3 w-36" /><Total /></div>
          <div className="flex flex-wrap gap-2"><Button>Save draft</Button><Button primary>Save for next build</Button>{kind === 'ad' && <Deploy />}</div></>}
    </div>
  </div>;
}

function OverviewFields({ micromarket }: { micromarket: boolean }) {
  return <div className="space-y-8">
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="rounded-xl border border-ui-line bg-ui-surface p-4 sm:col-span-2">
        <p className="cms-label mb-1">Page URL</p><Skeleton className="my-1 h-5 w-3/4" />
        <p className="cms-hint">Choose slugs that match the inventory. The state for a city or micromarket is filled from its location data. Publishing creates this overview page.</p>
      </div>
      {micromarket && <Field />}<Field /><Field /><Field />
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="border-b border-ui-line pb-2.5 sm:col-span-2"><h2 className="text-base font-semibold text-wareongo-blue">Search listing</h2>
        <p className="mt-1 text-xs text-wareongo-slate">What Google shows: the browser tab title, the grey line under it in results, and the big heading at the top of the page.</p></div>
      <div className="sm:col-span-2"><Field /></div><div className="sm:col-span-2"><Field tall /></div>
    </div>
  </div>;
}

function AdFields() {
  return <div className="space-y-4">{AD_COPY_GROUPS.map(group => <div key={group.id} className="cms-card">
    <div className="cms-title text-lg">{group.title}{group.id !== 'settings' && <span className="ml-3 inline-block align-middle"><Skeleton className="h-3 w-16" /></span>}</div>
    {group.id === 'hero' && <div className="mt-5 space-y-5">
      {group.fields.map(field => <Field key={field.key} tall={field.multiline} />)}
      <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: AD_HERO_STEP_COUNT }, (_, i) => <Field key={i} />)}</div>
    </div>}
  </div>)}</div>;
}

export function EditorLoading({ kind, isNew = false }: { kind: EditorKind; isNew?: boolean }) {
  const overview = kind === 'overview' || kind === 'micromarket';
  const compact = kind === 'blog' || overview;
  const rows = overview ? kind === 'micromarket' ? 7 : 9
    : kind === 'ad' ? AD_COPY_GROUPS.filter(group => group.id !== 'settings').length : 4;
  return <Frame label={`${kind} editor`} className={`${kind === 'ad' ? 'max-w-5xl' : 'max-w-4xl'} p-6 pb-40 sm:p-10 sm:pb-40`}>
    <header className="mb-6 flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1">
      {kind === 'overview' && !isNew && <div className="cms-eyebrow mb-2 flex h-[1.5em] items-center"><Skeleton className="h-3 w-20" /></div>}
      <div className={compact ? 'cms-eyebrow mb-2 flex h-[1.5em] items-center' : 'mb-4 flex h-5 items-center'}><Skeleton className="h-3 w-28" /></div>
      <div className="cms-title"><Skeleton className="h-[1.25em] w-64 max-w-full" /></div>
      {(!isNew || overview) && <Skeleton className={`${compact ? 'mt-1' : 'mt-2'} h-5 w-64 max-w-full`} />}
    </div>{compact && !isNew && <div className="ml-auto flex flex-wrap gap-2"><Button>List</Button><Button>Delete…</Button></div>}</header>
    <div className={overview ? 'space-y-8' : 'space-y-6'}>
      {overview ? <><WritingPanel /><div className="rounded-xl border border-ui-line bg-ui-surface p-4 text-sm">
        <p className="text-wareongo-charcoal"><strong>You write the words. The site counts the warehouses.</strong></p>
        <ul className="mt-2 space-y-1 text-xs text-wareongo-slate">
          <li>Only the top block and the lead paragraph are required. Leave a section empty and it simply doesn&apos;t appear on the page — no gap, no empty heading.</li>
          <li>Every number — listing count, rents, sizes, clear height, the compliance band — is counted from {kind === 'micromarket' ? 'the warehouses tagged with this micromarket' : 'the matching warehouses'} on each deploy, so it stays true on its own. Don&apos;t write figures into the prose.</li>
          <li><strong>Preview</strong> shows the finished page at a real phone and desktop width.</li>
        </ul>
      </div><div><Tabs capsule /></div></>
        : <>{kind !== 'blog' && <p className={`text-sm text-wareongo-slate ${kind === 'ad' ? 'leading-relaxed' : ''}`}>
          {kind === 'legal' ? 'Drafts stay private. “Save for next build” approves this copy for the next website deployment.'
            : kind === 'service' ? 'Drafts can be unfinished. Add an introduction and page content, then save for the next build to publish the page and its footer link.'
              : 'The current Bangalore copy and photos are imported below. Warehouse details, micromarket counts, map positions and market tables stay connected to the existing catalogue. Shared navigation and company logos follow the website.'}
        </p>}<div><Tabs capsule={kind === 'blog'} ad={kind === 'ad'} /></div><WritingPanel /></>}
      <WordCounts rows={rows} />
      {kind === 'ad' ? <AdFields /> : overview ? <OverviewFields micromarket={kind === 'micromarket'} />
        : kind === 'blog' ? <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field /></div>
          <Field /><Field /><div className="sm:col-span-2"><Field /></div><div className="sm:col-span-2"><Field tall /></div>
        </div> : <div className="space-y-6"><Field />
          {kind === 'legal' ? <div className="grid gap-5 sm:grid-cols-2"><Field /><Field /></div> : <Field tall />}
          <Field /><Field tall /></div>}
    </div>
    <SaveBar kind={kind} />
  </Frame>;
}

export function ImportsLoading({ review = false }: { review?: boolean }) {
  return <Frame label={review ? 'import review' : 'content imports'} className={`${review ? 'max-w-6xl' : 'max-w-5xl'} p-4 md:p-8`}>
    {review && <Skeleton className="mb-4 h-4 w-32" />}
    <h1 className="cms-title">{review ? 'Review content import' : 'Content imports'}</h1>
    {review && <Skeleton className="my-4 h-6 w-64 max-w-full" />}
    <p className="my-4">{review ? 'These are the exact changes in this import. Approval makes this content eligible for the next website build. It does not start a build.'
      : 'Review imported drafts before approving them for a website build. Nothing in this queue is published.'}</p>
    {review && <Skeleton className="mt-8 h-8 w-64 max-w-full" />}
    <div className={review ? 'mt-8 space-y-6' : 'space-y-3'}>{Array.from({ length: 3 }, (_, i) =>
      <div key={i} className="cms-card"><Skeleton className="h-5 w-48 max-w-full" />
        {review ? <div className="mt-4 grid gap-4 md:grid-cols-2">{['Before', 'After'].map(label => <div key={label}><p className="cms-label mb-2">{label}</p><Paragraph /></div>)}</div> : <Skeleton className="mt-2 h-5 w-2/3" />}
      </div>)}</div>
  </Frame>;
}
