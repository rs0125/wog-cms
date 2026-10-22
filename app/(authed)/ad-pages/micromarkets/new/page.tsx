import Link from '@/components/CmsLink';
import { getEditorMicromarkets, getEditorLocations } from '@/lib/editor-inventory';
import { micromarketAdChoices } from '@/lib/micromarket-ad-content.mjs';
import { getMicromarketAdSummaries } from '@/lib/content-summaries';
import NewMicromarketAdForm from '@/components/NewMicromarketAdForm';
import { createMicromarketAdPage } from '../actions';

export default async function NewMicromarketAdPage() {
  const [inventory, locations, existing] = await Promise.all([
    getEditorMicromarkets().catch(() => null), getEditorLocations().catch(() => null), getMicromarketAdSummaries(),
  ]);
  const choices: { citySlug: string; slug: string; name: string }[] = micromarketAdChoices(inventory?.data ?? [], locations?.cities ?? []);
  const markets = choices.filter(market => !existing.some(page => page.citySlug === market.citySlug && page.slug === market.slug));
  return <main className="mx-auto max-w-3xl p-6 sm:p-10">
    <Link href="/ad-pages/micromarkets" className="text-sm text-wareongo-slate hover:underline">← Micromarket ad pages</Link>
    <h1 className="cms-title mb-3 mt-4">New micromarket ad page</h1>
    <p className="mb-6 text-sm text-wareongo-slate">Choose a Bangalore micromarket, the Electronic City/Jigani/Bommasandra area, Bangalore industrial sheds, Hosur or Hyderabad. We’ll create a private draft in the shared ad-page layout, with fields for its local copy.</p>
    {!inventory ? <p role="alert" className="cms-card">The inventory could not load. Reload this page to try again.</p> : <NewMicromarketAdForm markets={markets} action={createMicromarketAdPage} />}
  </main>;
}
