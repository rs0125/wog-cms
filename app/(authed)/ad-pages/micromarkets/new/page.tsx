import Link from '@/components/CmsLink';
import { getEditorMicromarkets } from '@/lib/editor-inventory';
import { getMicromarketAdSummaries } from '@/lib/content-summaries';
import NewMicromarketAdForm from '@/components/NewMicromarketAdForm';
import { createMicromarketAdPage } from '../actions';

export default async function NewMicromarketAdPage() {
  const [inventory, existing] = await Promise.all([
    getEditorMicromarkets().catch(() => null), getMicromarketAdSummaries(),
  ]);
  const markets = inventory?.data.filter(market => market.citySlug === 'bengaluru' && market.listings > 0 && !existing.some(page => page.citySlug === market.citySlug && page.slug === market.slug))
    .map(({ slug, name }) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)) ?? [];
  return <main className="mx-auto max-w-3xl p-6 sm:p-10">
    <Link href="/ad-pages/micromarkets" className="text-sm text-wareongo-slate hover:underline">← Micromarket ad pages</Link>
    <h1 className="cms-title mb-3 mt-4">New micromarket ad page</h1>
    <p className="mb-6 text-sm text-wareongo-slate">Choose a Bangalore micromarket from the inventory. We’ll create a private draft with the same template as Peenya and fields for its local copy.</p>
    {!inventory ? <p role="alert" className="cms-card">The inventory could not load. Reload this page to try again.</p> : <NewMicromarketAdForm markets={markets} action={createMicromarketAdPage} />}
  </main>;
}
