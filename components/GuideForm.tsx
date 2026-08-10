'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import BlockEditor from './BlockEditor';
import GuidePreview from './GuidePreview';
import type { GuideBlock, GuideFaq, GuideInput } from '@/lib/guide-schema';
import { keyAll, keyed, removeAt, replaceAt, unkey, type Keyed } from '@/lib/keyed';
import type { SaveResult } from '@/app/(authed)/guides/actions';

export default function GuideForm({
  guide,
  action,
  id,
}: {
  guide: GuideInput;
  action: (prev: SaveResult | undefined, formData: FormData) => Promise<SaveResult>;
  id?: number;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  // Fields the preview reflects live in state; the rest stay uncontrolled
  // defaultValue inputs, since nothing reads them back until submit.
  const [title, setTitle] = useState(guide.title);
  const [summary, setSummary] = useState(guide.summary);
  const [dateModified, setDateModified] = useState(guide.dateModified);
  // Wrapped with stable keys so reordering a block or deleting an FAQ moves the
  // DOM node with the item instead of stranding focus — see lib/keyed.ts.
  const [blocks, setBlocks] = useState<Keyed<GuideBlock>[]>(() => keyAll(guide.blocks));
  const [faqs, setFaqs] = useState<Keyed<GuideFaq>[]>(() => keyAll(guide.faqs));
  const [keywords, setKeywords] = useState(guide.keywords.join(', '));
  const [related, setRelated] = useState(guide.related.join(', '));

  const csv = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);
  const plainBlocks = unkey(blocks);
  const plainFaqs = unkey(faqs);

  return (
    <form action={formAction} className="pb-28">
      {id !== undefined && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="blocks" value={JSON.stringify(plainBlocks)} />
      <input type="hidden" name="faqs" value={JSON.stringify(plainFaqs)} />
      <input type="hidden" name="keywords" value={JSON.stringify(csv(keywords))} />
      <input type="hidden" name="related" value={JSON.stringify(csv(related))} />

      <div className="mb-6 inline-flex rounded-xl border border-wareongo-blue/25 bg-white p-1">
        {(['edit', 'preview'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
              tab === t ? 'bg-wareongo-blue text-white' : 'text-wareongo-slate hover:text-wareongo-blue'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Kept mounted and hidden rather than unmounted, so switching tabs never
          discards in-progress edits or collapses the block editor's state. */}
      <div className={tab === 'preview' ? 'hidden' : 'space-y-8'}>
        <section className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="cms-label" htmlFor="title">On-page H1</label>
            <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className="cms-input" />
          </div>

          <div>
            <label className="cms-label" htmlFor="slug">Slug</label>
            <input id="slug" name="slug" defaultValue={guide.slug} required className="cms-input" />
            <p className="cms-hint">Public URL: /guides/{'{slug}'} — changing this breaks existing links.</p>
          </div>

          <div>
            <label className="cms-label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={guide.status} className="cms-input">
              <option value="DRAFT">Draft — not on the site</option>
              <option value="PUBLISHED">Published — included in next build</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="cms-label" htmlFor="seoTitle">SEO title &lt;title&gt;</label>
            <input id="seoTitle" name="seoTitle" defaultValue={guide.seoTitle} required className="cms-input" />
            <p className="cms-hint">Aim for ≤60 characters.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="cms-label" htmlFor="description">Meta description</label>
            <textarea id="description" name="description" rows={2} defaultValue={guide.description} required className="cms-input" />
            <p className="cms-hint">Aim for ≤160 characters. Also used as Article.description.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="cms-label" htmlFor="summary">&ldquo;In short&rdquo; summary</label>
            <textarea
              id="summary"
              name="summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              className="cms-input"
            />
            <p className="cms-hint">
              The direct answer AI engines extract first — the page&apos;s speakable block. Make it stand alone.
            </p>
          </div>

          <div>
            <label className="cms-label" htmlFor="datePublished">First published</label>
            <input id="datePublished" name="datePublished" type="date" defaultValue={guide.datePublished ?? ''} className="cms-input" />
          </div>

          <div>
            <label className="cms-label" htmlFor="dateModified">Last updated</label>
            <input
              id="dateModified"
              name="dateModified"
              type="date"
              value={dateModified}
              onChange={(e) => setDateModified(e.target.value)}
              required
              className="cms-input"
            />
            <p className="cms-hint">Feeds Article.dateModified — only bump it on real edits.</p>
          </div>

          <div>
            <label className="cms-label" htmlFor="sortOrder">Sort order</label>
            <input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={guide.sortOrder} className="cms-input" />
            <p className="cms-hint">Position on /guides and in its ItemList schema.</p>
          </div>

          <div>
            <label className="cms-label" htmlFor="keywords">Keywords</label>
            <input id="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} className="cms-input" />
            <p className="cms-hint">Comma-separated → Article.keywords.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="cms-label" htmlFor="related">Related guide slugs</label>
            <input id="related" value={related} onChange={(e) => setRelated(e.target.value)} className="cms-input" />
            <p className="cms-hint">Comma-separated slugs, rendered as cross-links at the foot of the guide.</p>
          </div>
        </section>

        <section>
          <h2 className="cms-label mb-3">Content blocks</h2>
          <BlockEditor blocks={blocks} onChange={setBlocks} />
        </section>

        <section>
          <h2 className="cms-label mb-2">FAQs</h2>
          <p className="mb-3 text-xs text-wareongo-slate">
            Rendered on the page and emitted as FAQPage schema. Google requires the two to match, so both come from here.
          </p>
          <div className="space-y-3">
            {faqs.map(({ key, value: faq }, i) => (
              <div key={key} className="cms-card">
                <div className="mb-2 flex items-center">
                  <span className="text-xs text-wareongo-slate">#{i + 1}</span>
                  <button
                    type="button"
                    className="cms-btn-danger ml-auto"
                    onClick={() => setFaqs(removeAt(faqs, i))}
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={faq.q}
                  placeholder="Question"
                  onChange={(e) => setFaqs(replaceAt(faqs, i, { ...faq, q: e.target.value }))}
                  className="cms-input mb-2 font-medium"
                />
                <textarea
                  value={faq.a}
                  rows={3}
                  placeholder="Answer"
                  onChange={(e) => setFaqs(replaceAt(faqs, i, { ...faq, a: e.target.value }))}
                  className="cms-input"
                />
              </div>
            ))}
            <button type="button" className="cms-btn" onClick={() => setFaqs([...faqs, keyed({ q: '', a: '' })])}>
              + FAQ
            </button>
          </div>
        </section>
      </div>

      <div className={tab === 'edit' ? 'hidden' : ''}>
        <p className="mb-3 text-xs text-wareongo-slate">
          Rendered with the live site&apos;s components and palette. Links are inert here.
        </p>
        <GuidePreview
          guide={{ title, summary, dateModified, blocks: plainBlocks, faqs: plainFaqs, related: csv(related) }}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-wareongo-blue/20 bg-wareongo-ivory/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link href="/guides" className="text-sm text-wareongo-slate transition-colors hover:text-wareongo-blue">
            ← Back
          </Link>
          {result && !result.ok && <p className="text-sm text-wareongo-sienna">{result.error}</p>}
          <button type="submit" disabled={pending} className="cms-btn-primary ml-auto">
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
