import Link from '@/components/CmsLink';
import { getAdPageSummaries } from '@/lib/content-summaries';
import { AD_PAGES } from '@/lib/ad-page-schema';
import { isDeployConfigured } from '@/lib/deploy';
import DeployButton from '@/components/DeployButton';

export default async function AdPages() {
  const rows = await getAdPageSummaries();
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h1 className="cms-title">Ad pages</h1><DeployButton configured={isDeployConfigured()} /></div>
    <p className="mb-8 text-sm text-wareongo-slate">Edit campaign landing pages. Save drafts privately, then use “Save for next build” when your changes are ready.</p>
    <div className="space-y-4">{Object.entries(AD_PAGES).map(([slug, name]) => {
      const row = rows.find(page => page.slug === slug);
      const state = row ?? null;
      return <article key={slug} className="cms-card">
        <h2 className="ui-panel-title text-ui-ink"><Link href={`/ad-pages/${slug}`} className="hover:underline">{name}</Link></h2>
        <p className="mt-1 text-sm text-wareongo-slate">/{slug} · Google Ads landing page</p>
        <p className="mt-3 text-sm">{!state ? 'Content import required' : state.staged ? 'Ready for next build' : 'Included in last build request'}{state?.hasDraft && <span className="ml-3 text-wareongo-sienna">Draft changes</span>}</p>
        <Link href={`/ad-pages/${slug}`} className="cms-btn mt-4">Edit page</Link>
      </article>;
    })}</div>
  </main>;
}
