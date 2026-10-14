'use client';

import { useActionState, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import type { SaveResult } from '@/lib/action-results';

export default function NewMicromarketAdForm({ markets, action }: {
  markets: { name: string; slug: string }[];
  action: (previous: SaveResult | undefined, form: FormData) => Promise<SaveResult>;
}) {
  const [slug, setSlug] = useState('');
  const [result, formAction, pending] = useActionState(async (previous: SaveResult | undefined, form: FormData): Promise<SaveResult> => {
    try { return await action(previous, form); }
    catch (error) { unstable_rethrow(error); return { ok: false, error: 'Could not confirm creation. Retry to open the same draft.' }; }
  }, undefined);
  return <form action={formAction} className="cms-card space-y-5" aria-busy={pending}>
    <div><label htmlFor="micromarket" className="cms-label">Micromarket</label>
      <select id="micromarket" name="slug" className="cms-input" value={slug} onChange={event => setSlug(event.target.value)} required disabled={pending}>
        <option value="">Choose a micromarket</option>
        {markets.map(market => <option key={market.slug} value={market.slug}>{market.name}</option>)}
      </select>
      <p className="cms-hint mt-2">{slug ? 'Website URL: /bangalore/' + slug : markets.length ? 'Existing ad pages are listed under Micromarket ad pages.' : 'All available micromarkets already have an ad-page draft.'}</p>
    </div>
    {result?.ok === false && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
    <button type="submit" className="cms-btn-primary" disabled={pending || !slug}>{pending ? 'Creating…' : 'Create private draft'}</button>
  </form>;
}
