import Link from '@/components/CmsLink';
import { getLegalSummaries } from '@/lib/content-summaries';
import { LEGAL_PAGES } from '@/lib/legal-schema';
import DeployButton from '@/components/DeployButton';
import { isDeployConfigured } from '@/lib/deploy';

export default async function LegalPages() {
  const rows = await getLegalSummaries();
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h1 className="cms-title">Legal pages</h1>
      <DeployButton configured={isDeployConfigured()} />
    </div>
    <p className="text-sm text-wareongo-slate mb-8">Save drafts privately. Use “Save for next build” when the copy is ready, then deploy or wait for the nightly build.</p>
    <div className="space-y-4">
      {Object.entries(LEGAL_PAGES).map(([slug, name]) => {
        const row = rows.find(r => r.slug === slug);
        const state = row ?? null;
        return <div key={slug} className="cms-card">
          <h2 className="ui-panel-title text-ui-ink"><Link href={`/legal/${slug}`} className="hover:underline">{name}</Link></h2>
          <p className="text-sm text-wareongo-slate mt-1">/{slug}</p>
          <p className="text-sm mt-3">
            {!state ? 'Initialize this page with the backend legal-page SQL before editing.' : <>
              {state.staged ? 'Ready for next build' : 'Included in last build request'}
              {state.hasDraft && <span className="ml-3 text-wareongo-sienna">Draft changes</span>}
            </>}
          </p>
        </div>;
      })}
    </div>
  </main>;
}
