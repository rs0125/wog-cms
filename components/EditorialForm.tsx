'use client';

import { useActionState, useState } from 'react';
import Link from '@/components/CmsLink';
import RelatedPicker, { type BlogOption } from './RelatedPicker';
import SingleImagePicker from './SingleImagePicker';
import StatOverridesEditor from './StatOverridesEditor';
import FormattedTextarea from './FormattedTextarea';
import { findMicromarket, type Micromarket } from '@/lib/micromarkets-api';
import { findLocation, type Location } from '@/lib/locations-api';
import WebsitePreview from './WebsitePreview';
import type { CityOverviewContent } from '@/lib/city-overview';
import { stateCandidates, type LocationPageSummary, type StateOverviewContent } from '@/lib/state-overview';
import type { StateCityEntry } from '@/lib/location-schema';
import StateCitiesEditor from './StateCitiesEditor';
import DeployButton from './DeployButton';
import WordCountSummary, { WordCount } from './WordCount';
import { editorialWordSections } from '@/lib/page-word-counts';
import { countFaqWords, totalWords } from '@/lib/word-count';
import {
  PROSE_BANDS,
  countWords,
  type EditorialFaq,
  type EditorialImage,
  type StatOverrides,
} from '@/lib/editorial-schema';
import { keyAll, keyed, removeAt, replaceAt, unkey, type Keyed } from '@/lib/keyed';
import type { SaveResult } from '@/lib/action-results';
import AiWriting from './AiWriting';

/**
 * Editor for one editorial listing page — a micromarket, a city or a state.
 *
 * One wireframe serves all three scopes, so one editor does too. Everything
 * that differs arrives in `identity`: which URL segments address the page, and
 * how the preview names what sits above it. Nothing else in this form knows
 * which scope it is editing.
 *
 * WebsitePreview renders the actual website at desktop or mobile width,
 * including its current inventory, layout conditions and text formatting.
 */

/**
 * How this page is addressed, and what the preview should say sits above it.
 *
 * A micromarket is addressed by the pair (citySlug, slug) because the same
 * locality tag can exist under two cities. A city or state is addressed by its
 * own slug inside a fixed kind, which the form posts as a hidden field rather
 * than letting an editor retype it — moving a page between kinds is not an edit,
 * it is a different page.
 */
export type FormIdentity =
  | { scope: 'micromarket'; citySlug: string; slug: string; parentLabel: string | null }
  | { scope: 'city'; slug: string; parentLabel: string | null }
  | { scope: 'state'; slug: string };

export interface EditorialFormPage extends CityOverviewContent, StateOverviewContent {
  name: string;
  seoTitle: string;
  metaDescription: string;
  h1: string;
  heroEyebrow: string | null;
  heroProse: string;
  heroImage: EditorialImage | null;
  marketHeading: string | null;
  marketProse: string | null;
  marketImage: EditorialImage | null;
  rentsHeading: string | null;
  rentsProse: string | null;
  specHeading: string | null;
  specProse: string | null;
  inventoryHeading: string | null;
  faqs: EditorialFaq[];
  relatedBlogs: string[];
  statOverrides: StatOverrides;
  status: 'DRAFT' | 'PUBLISHED';
}

export default function EditorialForm({
  page,
  identity,
  backHref,
  action,
  id,
  blogOptions,
  staged,
  deployable,
  expectedUpdatedAt,
  inventory = [],
  locationInventory = [],
  cityInventory = [],
}: {
  page: EditorialFormPage;
  /** Which URL segments address this page — see FormIdentity. */
  identity: FormIdentity;
  /** Where "← Back" goes: the list this page was opened from. */
  backHref: string;
  action: (prev: SaveResult | undefined, formData: FormData) => Promise<SaveResult>;
  id?: number;
  /** Every blog, for the editorial cross-link picker. */
  blogOptions: BlogOption[];
  /** This page has saved changes that haven't been deployed. */
  staged?: boolean;
  /** The row's updatedAt when this form was rendered, for the lost-update check. */
  expectedUpdatedAt?: string;
  /** Whether a deploy hook is configured; hides Deploy entirely when not. */
  deployable?: boolean;
  /**
   * The figures the site derives from live listings. Null when the slug matches
   * no real location, or when the query failed — the preview and the overrides
   * section both degrade to "not recorded" rather than inventing one.
   */
  inventory?: Micromarket[];
  locationInventory?: Location[];
  /** State pages: every city, for the cities section's list, rows and cards. */
  cityInventory?: Location[];
  /** State pages: every location page, for which cities and neighbours are published. */
  locationPages?: LocationPageSummary[];
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  // Any input anywhere in the form counts as an edit, including the FAQ editor —
  // those are plain inputs inside this form, so onInput catches them without
  // each one having to report upward.
  const [edited, setEdited] = useState(false);

  // Every field is state-backed: the prose so the word counters can track it as
  // it is typed, and the rest because React 19 resets an uncontrolled form after
  // a form action — see the note on `text` below.
  const [citySlug, setCitySlug] = useState(
    identity.scope === 'micromarket' ? identity.citySlug : '',
  );
  const [slug, setSlug] = useState(identity.slug);
  const market = identity.scope === 'micromarket' ? findMicromarket(inventory, citySlug, slug) : null;
  const location = identity.scope !== 'micromarket' ? findLocation(locationInventory, slug) : null;
  const stats = identity.scope === 'city' && location?.cityOverview
    ? { ...location, ...location.cityOverview.summary, peers: location.cityOverview.comparisonCities }
    : market ?? location ?? null;
  const [heroProse, setHeroProse] = useState(page.heroProse);
  const [marketProse, setMarketProse] = useState(page.marketProse ?? '');
  const [rentsProse, setRentsProse] = useState(page.rentsProse ?? '');
  const [specProse, setSpecProse] = useState(page.specProse ?? '');
  const [corridorProse, setCorridorProse] = useState(page.corridorProse ?? '');
  const [complianceProse, setComplianceProse] = useState(page.complianceProse ?? '');
  const [heroImage, setHeroImage] = useState<EditorialImage | null>(page.heroImage);
  const [marketImage, setMarketImage] = useState<EditorialImage | null>(page.marketImage);
  const [faqs, setFaqs] = useState<Keyed<EditorialFaq>[]>(() => keyAll(page.faqs));
  const [relatedBlogs, setRelatedBlogs] = useState<string[]>(page.relatedBlogs);
  const [statOverrides, setStatOverrides] = useState<StatOverrides>(page.statOverrides);
  // Null is the default list; see StateCitiesEditor.
  const [cityList, setCityList] = useState<Keyed<StateCityEntry>[] | null>(
    () => page.stateCities?.length ? keyAll(page.stateCities) : null,
  );

  /**
   * The plain text fields, held in state rather than left as defaultValue.
   *
   * Not a style choice. React 19 resets an uncontrolled form after a form
   * action completes, including when the action *failed* — so a save rejected
   * for one blank FAQ silently wiped the name, SEO title, meta description, H1
   * and every heading the editor had typed. The error named the FAQ, so there
   * was nothing on screen to suggest the rest had gone, and because these
   * inputs are `required` the browser then refused to resubmit: the Save button
   * looked dead. Controlled inputs re-render from state, so the reset is a
   * no-op.
   */
  const [text, setText] = useState({
    name: page.name,
    seoTitle: page.seoTitle,
    metaDescription: page.metaDescription,
    h1: page.h1,
    heroEyebrow: page.heroEyebrow ?? '',
    marketHeading: page.marketHeading ?? '',
    rentsHeading: page.rentsHeading ?? '',
    specHeading: page.specHeading ?? '',
    inventoryHeading: page.inventoryHeading ?? '',
    corridorHeading: page.corridorHeading ?? '',
    complianceHeading: page.complianceHeading ?? '',
    citiesHeading: page.citiesHeading ?? '',
  });
  const bind = (key: keyof typeof text) => ({
    value: text[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setText((t) => ({ ...t, [key]: e.target.value })),
  });

  const touch = () => setEdited(true);
  const plainFaqs = unkey(faqs);

  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  const isMicromarket = identity.scope === 'micromarket';
  const isCity = identity.scope === 'city';
  const isState = identity.scope === 'state';
  const wordCounts = editorialWordSections({
    ...text, heroProse, marketProse, rentsProse, specProse, corridorProse, complianceProse, faqs: plainFaqs,
  }, identity.scope);
  // Derived for the slug as typed, the way the site derives them at build.
  const candidates = isState ? stateCandidates(slug, cityInventory) : [];
  /** The URL the site will serve this content at, shown back to the editor. */
  const pagePath = isMicromarket
    ? `/overview/${market?.stateSlug || '{state}'}/${citySlug || '{city}'}/${slug || '{micromarket}'}`
    : identity.scope === 'city' ? `/overview/${location?.stateSlug || '{state}'}/${slug || '{city}'}`
    : `/overview/${slug || '{state}'}`;

  return (
    <form action={formAction} onInput={touch} className="space-y-8 pb-40">
      {id !== undefined && <input type="hidden" name="id" value={id} />}
      {expectedUpdatedAt && <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />}
      <input type="hidden" name="faqs" value={JSON.stringify(plainFaqs)} />
      <input type="hidden" name="relatedBlogs" value={JSON.stringify(relatedBlogs)} />
      <input type="hidden" name="statOverrides" value={JSON.stringify(statOverrides)} />
      {/* Empty string rather than "null": the action treats an empty value as
          absent, which keeps "no image" a single representation. */}
      <input type="hidden" name="heroImage" value={heroImage ? JSON.stringify(heroImage) : ''} />
      <input type="hidden" name="marketImage" value={marketImage ? JSON.stringify(marketImage) : ''} />
      {isState && <input type="hidden" name="stateCities" value={cityList ? JSON.stringify(unkey(cityList)) : ''} />}

      <AiWriting
        target={{ type: identity.scope, slug, ...(isMicromarket ? { citySlug } : {}) }}
        initial={{ ...page }} values={{ ...page, ...text, heroProse, marketProse, rentsProse, specProse, corridorProse, complianceProse, faqs: plainFaqs }}
        expectedUpdatedAt={expectedUpdatedAt} disabled={pending}
        lockedReason={page.status === 'PUBLISHED' ? 'This page is approved for the website. Use the editor to change its copy.' : undefined}
        onReveal={() => setTab('edit')}
        onChange={next => {
          setText(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, key === 'name' ? value : next[key] ?? ''])) as typeof current);
          setHeroProse(next.heroProse as string); setMarketProse(next.marketProse as string ?? '');
          setRentsProse(next.rentsProse as string ?? ''); setSpecProse(next.specProse as string ?? '');
          setCorridorProse(next.corridorProse as string ?? ''); setComplianceProse(next.complianceProse as string ?? '');
          if (JSON.stringify(next.faqs) !== JSON.stringify(plainFaqs)) setFaqs(keyAll(next.faqs as EditorialFaq[]));
          touch();
        }}
      />

      <div className="rounded-xl border border-ui-line bg-ui-surface p-4 text-sm">
        <p className="text-wareongo-charcoal">
          <strong>You write the words. The site counts the warehouses.</strong>
        </p>
        <ul className="mt-2 space-y-1 text-xs text-wareongo-slate">
          <li>
            Only the top block and the lead paragraph are required. Leave a section empty and it
            simply doesn&apos;t appear on the page — no gap, no empty heading.
          </li>
          <li>
            Every number — listing count, rents, sizes, clear height, the compliance band — is
            counted from {isMicromarket ? 'the warehouses tagged with this micromarket' : `the warehouses in this ${identity.scope}`}{' '}
            on each deploy, so it stays true on its own. Don&apos;t write figures into the prose.
          </li>
          <li>
            <strong>Preview</strong> shows the finished page at a real phone and desktop width.
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-ui-outline bg-ui-surface p-1">
          {(['edit', 'preview'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                tab === t ? 'bg-wareongo-blue text-ui-surface' : 'text-wareongo-slate hover:text-wareongo-blue'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

      </div>

      <WordCountSummary sections={wordCounts} />

      <div className={tab === 'preview' ? 'hidden' : 'space-y-8'}>
      <section className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-xl border border-ui-line bg-ui-surface p-4">
          <p className="cms-label mb-1">Page URL</p>
          <p className="break-all font-mono text-sm text-wareongo-charcoal" data-testid="overview-url">{pagePath}</p>
          <p className="cms-hint">
            Choose slugs that match the inventory. The state for a city or micromarket is filled
            from its location data. Publishing creates this overview page.
          </p>
          {!stats && <p className="cms-hint text-wareongo-sienna">No matching {identity.scope} was found in the inventory.</p>}
          {identity.scope !== 'state' && !stats?.stateSlug && <p className="cms-hint text-wareongo-sienna">The overview URL needs a matching {identity.scope} with a known state.</p>}
          {stats && !stats.hasPage && <p className="cms-hint text-wareongo-sienna">This {identity.scope} does not have enough listings to publish an overview yet. You can still save its content as a draft.</p>}
        </div>

        {/* Fixed, not editable: moving a page between city and state is not an
            edit, it is a different page over different inventory. */}
        {!isMicromarket && <input type="hidden" name="kind" value={identity.scope.toUpperCase()} />}

        {isMicromarket && (
          <div>
            <label className="cms-label" htmlFor="citySlug">City slug</label>
            <input
              id="citySlug"
              name="citySlug"
              value={citySlug}
              onChange={(e) => setCitySlug(e.target.value)}
              required
              placeholder="bengaluru"
              className="cms-input"
            />
            <p className="cms-hint">The parent city page&apos;s slug, e.g. bengaluru, not bangalore.</p>
          </div>
        )}

        <div>
          <label className="cms-label" htmlFor="slug">
            {isMicromarket ? 'Micromarket slug' : `${identity.scope === 'city' ? 'City' : 'State'} slug`}
          </label>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            placeholder={isMicromarket ? 'nelamangala' : identity.scope === 'city' ? 'bengaluru' : 'karnataka'}
            className="cms-input"
          />
          <p className="cms-hint">
            {isMicromarket
              ? 'A “/” in the name becomes a hyphen: alipur-budhpur.'
              : 'Lowercase, hyphenated: bengaluru, not bangalore; uttar-pradesh, not Uttar Pradesh.'}
          </p>
        </div>

        <div>
          <label className="cms-label" htmlFor="name">Name (for this list)</label>
          <input id="name" name="name" {...bind('name')} required className="cms-input" />
          <p className="cms-hint">Never rendered — the site uses the name it derives from listings.</p>
        </div>

        <div>
          <label className="cms-label" htmlFor="status">Status</label>
          {/* Keyed on the saved status, so the Delist/List button above — which
              writes this column and then refreshes the page's props rather than
              navigating — remounts this onto the new value. Without the key it
              would keep showing the old one and the next save would quietly
              undo the toggle. It holds its own state inside the remount so
              React's post-action form reset cannot revert an unsaved change. */}
          <StatusSelect key={page.status} status={page.status} />
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2 border-b border-ui-line pb-2.5">
          <h2 className="text-base font-semibold text-wareongo-blue">Search listing</h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            What Google shows: the browser tab title, the grey line under it in results, and the big
            heading at the top of the page.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="cms-label" htmlFor="seoTitle">SEO title &lt;title&gt;</label>
          <input id="seoTitle" name="seoTitle" {...bind('seoTitle')} required className="cms-input" />
          <p className="cms-hint">Aim for ≤60 characters.</p>
        </div>

        <div className="sm:col-span-2">
          <label className="cms-label" htmlFor="metaDescription">Meta description</label>
          <textarea
            id="metaDescription"
            name="metaDescription"
            rows={2}
            {...bind('metaDescription')}
            required
            className="cms-input"
          />
          <p className="cms-hint">Aim for ≤160 characters.</p>
        </div>

        <div className="sm:col-span-2">
          <label className="cms-label" htmlFor="h1">On-page H1</label>
          <input id="h1" name="h1" {...bind('h1')} required className="cms-input" />
        </div>

        <div className="sm:col-span-2">
          <label className="cms-label" htmlFor="heroEyebrow">Eyebrow</label>
          <input
            id="heroEyebrow"
            name="heroEyebrow"
            {...bind('heroEyebrow')}
            placeholder="Warehouses and godowns · Nelamangala, Bengaluru"
            className="cms-input"
          />
          <p className="cms-hint">Optional. Blank falls back to that pattern, built from live data.</p>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-wareongo-blue">Opening paragraph</h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            The first thing anyone reads, under the heading. Why this belt exists and who it is for.
            The count, rent and size tiles sit right beside it, so leave those figures out.
          </p>
        </div>

        <ProseField
          name="heroProse"
          label="Lead paragraph"
          value={heroProse}
          onChange={setHeroProse}
          band="heroProse"
          required
          rows={4}
        />

        <div>
          <span className="cms-label">Hero image</span>
          <SingleImagePicker
            value={heroImage}
            onChange={(next) => {
              touch();
              setHeroImage(next);
            }}
            ratio="4:3"
          />
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-wareongo-blue">
            Market <span className="ml-1 text-xs font-normal text-wareongo-slate">optional section</span>
          </h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            {isCity ? 'Why this city works for an occupier: routes, industries and demand. Mention three to five relevant localities; the corridor section below handles the detailed comparison.'
              : isState ? 'Why this state works for warehousing: its freight routes, industries and demand, and which cities carry the stock. The cities section below compares them, so leave city figures out.'
              : 'Where the stock actually sits: the sub-localities and estates inside this belt.'}
          </p>
        </div>

        <HeadingField name="marketHeading" placeholder={isState ? 'Why {place} for warehousing' : 'Warehouse space in {place}: where the stock sits'} {...bind('marketHeading')} />

        <ProseField
          name="marketProse"
          label="Market paragraph"
          value={marketProse}
          onChange={setMarketProse}
          band={isCity ? 'cityMarketProse' : 'marketProse'}
          rows={5}
        />

        <div>
          <span className="cms-label">Market image</span>
          <SingleImagePicker
            value={marketImage}
            onChange={(next) => {
              touch();
              setMarketImage(next);
            }}
            ratio="5:4"
          />
          {isState && <p className="cms-hint">Optional. Without one, the page shows the state&apos;s best T1 listing photo that no city card is already using.</p>}
        </div>
      </section>

      {isState && <section className="space-y-5">
        <div><h2 className="text-base font-semibold text-wareongo-blue">Cities <span className="ml-1 text-xs font-normal text-wareongo-slate">optional heading and list</span></h2>
          <p className="mt-1 text-xs text-wareongo-slate">The table and photo cards show these cities in order. By default that is the 4 cities in this state with the most listings. Each card uses the city&apos;s best T1 listing photo unless you upload one. A city with a published overview links to it, any other city in our listings links to its listing page, and a city not in our listings shows no figures and no link. The state&apos;s other cities with listings are named in a line under the cards.</p></div>
        <HeadingField name="citiesHeading" placeholder="Where warehouse stock sits in {place}" {...bind('citiesHeading')} />
        <StateCitiesEditor
          value={cityList}
          candidates={candidates}
          onChange={(next) => {
            touch();
            setCityList(next);
          }}
        />
      </section>}

      {isCity && <section className="space-y-5">
        <div><h2 className="text-base font-semibold text-wareongo-blue">Corridors <span className="ml-1 text-xs font-normal text-wareongo-slate">optional paragraph</span></h2>
          <p className="mt-1 text-xs text-wareongo-slate">Explain which locations suit different requirements. The corridor table and size comparison come from the inventory.</p></div>
        <HeadingField name="corridorHeading" placeholder="Where warehouse stock sits in {place}" {...bind('corridorHeading')} />
        <ProseField name="corridorProse" label="Corridor paragraph" value={corridorProse} onChange={setCorridorProse} band="corridorProse" rows={5} />
      </section>}

      <section className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-wareongo-blue">
            Pricing <span className="ml-1 text-xs font-normal text-wareongo-slate">optional section</span>
          </h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            {isCity ? 'Explain how unit size and location affect rent. The page adds rent by size and a comparison with other cities automatically.' : 'What rent tracks here: grade, compliance and access. The chart compares this location with its neighbours.'} Keep changing inventory figures in the data sections.
          </p>
        </div>

        <HeadingField name="rentsHeading" placeholder="Warehouse rent in {place}" {...bind('rentsHeading')} />

        <ProseField
          name="rentsProse"
          label="Pricing paragraph"
          value={rentsProse}
          onChange={setRentsProse}
          band="rentsProse"
          rows={5}
        />
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-wareongo-blue">
            Specification <span className="ml-1 text-xs font-normal text-wareongo-slate">optional section</span>
          </h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            What the clear heights, docks and unit sizes mean for an occupier. The table beside it is
            counted for you, and a row with no data hides rather than reading &ldquo;not
            specified&rdquo;.
          </p>
        </div>

        <HeadingField name="specHeading" placeholder="Typical specification in {place}" {...bind('specHeading')} />

        <ProseField
          name="specProse"
          label="Specification paragraph"
          value={specProse}
          onChange={setSpecProse}
          band="specProse"
          rows={4}
        />
      </section>

      {(isCity || isState) && <section className="space-y-5">
        <div><h2 className="text-base font-semibold text-wareongo-blue">Compliance <span className="ml-1 text-xs font-normal text-wareongo-slate">optional paragraph</span></h2>
          <p className="mt-1 text-xs text-wareongo-slate">{isState
            ? 'State rules an occupier should know: land conversion and zoning, industrial-estate allotment terms, the fire NOC authority and building plan approval. The FAQs stay the short answers, so no sentence repeats between them. Check every legal claim against a dated source.'
            : 'Local and state context for approvals and the documents an occupier should check. Recorded inventory counts appear separately.'}</p></div>
        <HeadingField name="complianceHeading" placeholder="Warehouse compliance in {place}" {...bind('complianceHeading')} />
        <ProseField name="complianceProse" label="Compliance paragraph" value={complianceProse} onChange={setComplianceProse} band="complianceProse" rows={6} />
      </section>}

      <section className="space-y-5">
        <div className="border-b border-ui-line pb-2.5">
          <h2 className="text-base font-semibold text-wareongo-blue">Listings heading &amp; links</h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            The warehouse grid is built for you and {isState ? 'sits third on the page, after the market and cities sections' : 'leads the page'}. Add a heading and any blogs worth linking at the foot.
          </p>
        </div>

        <HeadingField name="inventoryHeading" placeholder="Warehouses for rent in {place}" {...bind('inventoryHeading')} />

        <div>
          <span className="cms-label">Editorial cross-links</span>
          <RelatedPicker
            options={blogOptions}
            value={relatedBlogs}
            onChange={(next) => {
              touch();
              setRelatedBlogs(next);
            }}
          />
          <p className="cms-hint">Blogs to link at the foot of the page.</p>
        </div>
      </section>

      <StatOverridesEditor
        value={statOverrides}
        computed={stats}
        scopeNoun={identity.scope}
        onChange={(next) => {
          touch();
          setStatOverrides(next);
        }}
      />

      <section>
        <div className="mb-3 border-b border-ui-line pb-2.5">
          <h2 className="text-base font-semibold text-wareongo-blue">
            Questions <span className="ml-1 text-xs font-normal text-wareongo-slate">optional section</span>
          </h2>
          <p className="mt-1 text-xs text-wareongo-slate">
            Shown as an accordion and in matching FAQ markup. {isCity ? 'Suggested six: rent, best locations, sizes, compliance, owner or broker, and getting a shortlist.' : 'Suggested questions: rent, best pockets, sizes and compliance.'} Remove any you do not need; a half-filled question will block saving.
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map(({ key, value: faq }, i) => (
            <div key={key} className="cms-card" data-writing-path={`faqs.${i}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-wareongo-slate">#{i + 1}</span>
                <WordCount count={countFaqWords([faq])} />
                <button
                  type="button"
                  className="cms-btn-danger ml-auto"
                  onClick={() => {
                    touch();
                    setFaqs(removeAt(faqs, i));
                  }}
                >
                  Remove
                </button>
              </div>
              <input
                value={faq.q}
                data-writing-path={`faqs.${i}.q`}
                placeholder="Question"
                onChange={(e) => setFaqs(replaceAt(faqs, i, { ...faq, q: e.target.value }))}
                className="cms-input mb-2 font-medium"
              />
              <FormattedTextarea
                value={faq.a}
                data-writing-path={`faqs.${i}.a`}
                rows={3}
                placeholder="Answer"
                onChange={(e) => setFaqs(replaceAt(faqs, i, { ...faq, a: e.target.value }))}
                className="cms-input"
              />
            </div>
          ))}
          <button
            type="button"
            className="cms-btn"
            onClick={() => {
              touch();
              setFaqs([...faqs, keyed({ q: '', a: '' })]);
            }}
          >
            + FAQ
          </button>
        </div>
      </section>

      </div>

      {/* 1280 is a real desktop viewport, so `lg:` applies; the frame scales to
          fit the editor column rather than rendering at whatever width happens
          to be free. */}
      {tab === 'preview' && <WebsitePreview content={{ type: identity.scope, content: {
        ...text, slug, citySlug, kind: isCity ? 'CITY' : 'STATE',
        heroProse, marketProse, rentsProse, specProse, corridorProse, complianceProse,
        heroImage, marketImage, faqs: plainFaqs, relatedBlogs, statOverrides,
        stateCities: cityList && unkey(cityList),
      } }} />}

      <div className="fixed inset-x-0 bottom-0 z-20 lg:left-64 border-t border-ui-line bg-wareongo-ivory/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <Link href={backHref} className="text-sm text-wareongo-slate transition-colors hover:text-wareongo-blue">
            ← Back
          </Link>
          <WordCount count={totalWords(wordCounts)} label="Total" variant="total" />
          {result && !result.ok && <p className="text-sm text-wareongo-sienna">{result.error}</p>}
          <div className="ml-auto">
            {/* Nothing edited and nothing waiting to go out → neither action
                applies, so the slot shows a disabled Save draft rather than an
                enabled button that would write a no-op. */}
            {!edited && staged ? (
              <DeployButton configured={Boolean(deployable)} />
            ) : (
              <button type="submit" disabled={pending || !edited} className="cms-btn-primary">
                {pending ? 'Saving…' : 'Save draft'}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

/**
 * A prose slot with a live word count against its editorial band.
 *
 * The band is guidance, not validation. Show it separately from the current
 * count so an editorial target cannot be mistaken for a required minimum.
 */
function ProseField({
  name,
  label,
  value,
  onChange,
  band,
  rows,
  required,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  band: keyof typeof PROSE_BANDS;
  rows: number;
  required?: boolean;
}) {
  const { min, max } = PROSE_BANDS[band];
  const words = countWords(value);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label className="cms-label" htmlFor={name}>
          {label}
          {!required && <span className="ml-1.5 normal-case tracking-normal opacity-70">optional</span>}
        </label>
        <div id={`${name}-word-count`} className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <WordCount count={words} />
          <span className="text-xs text-wareongo-slate">Target: {min}–{max} words</span>
        </div>
      </div>
      <FormattedTextarea
        id={name}
        name={name}
        aria-describedby={`${name}-word-count`}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="cms-input"
      />
    </div>
  );
}

/**
 * Controlled, and remounted by its `key` when the saved status changes.
 *
 * Both halves matter: controlled so React's reset after a form action cannot
 * throw away an unsaved choice, and remounted so a Delist/List click — which
 * refreshes server props in place instead of navigating — is reflected here.
 */
function StatusSelect({ status }: { status: EditorialFormPage['status'] }) {
  const [value, setValue] = useState(status);
  return (
    <select
      id="status"
      name="status"
      value={value}
      onChange={(e) => setValue(e.target.value as EditorialFormPage['status'])}
      className="cms-input"
    >
      <option value="DRAFT">Draft — overview is not published</option>
      <option value="PUBLISHED">Published — overview page from next build</option>
    </select>
  );
}

/** An optional section heading; blank falls back to the template default. */
function HeadingField({
  name,
  placeholder,
  ...bound
}: {
  name: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <div>
      <label className="cms-label" htmlFor={name}>
        Heading <span className="ml-1 normal-case tracking-normal opacity-70">optional</span>
      </label>
      <input id={name} name={name} placeholder={placeholder} className="cms-input" {...bound} />
      <p className="cms-hint">Blank uses the placeholder, with the place name filled in.</p>
    </div>
  );
}
