import Link from '@/components/CmsLink';
import { getMicromarketAdSummaries } from '@/lib/content-summaries';
import { micromarketAdEditorPath } from '@/lib/micromarket-ad-schema';
import DeployButton from '@/components/DeployButton';
import { isDeployConfigured } from '@/lib/deploy';

export default async function MicromarketAdPages() {
  const rows = await getMicromarketAdSummaries();
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <Link href="/ad-pages" className="text-sm text-wareongo-slate hover:underline">← Ad pages</Link>
    <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-3"><h1 className="cms-title">Micromarket ad pages</h1><DeployButton configured={isDeployConfigured()} /></div>
    <p className="mb-5 text-sm text-wareongo-slate">Each page uses the Bangalore ad template. Edit local copy, preview on desktop and mobile, then save for the next build.</p>
    <div className="mb-8 flex flex-wrap gap-3">
      <Link href="/ad-pages/micromarkets/new" className="cms-btn-primary">+ New micromarket ad page</Link>
      <a href="/api/ad-pages/micromarkets/schema" className="cms-btn" download>Download general schema</a>
    </div>
    <div className="space-y-4">{rows.map(row => <article key={row.citySlug + '/' + row.slug} className="cms-card">
      <h2 className="ui-panel-title text-ui-ink"><Link href={micromarketAdEditorPath(row.citySlug, row.slug)} className="hover:underline">{row.name}</Link></h2>
      <p className="mt-1 text-sm text-wareongo-slate">/bangalore/{row.slug}</p>
      <p className="mt-3 text-sm">{!row.published ? 'Private draft · Not included in website builds' : row.staged ? 'Ready for next build' : 'Included in last build request'}{row.published && row.hasDraft && <span className="ml-3 text-wareongo-sienna">Draft changes</span>}</p>
      <Link href={micromarketAdEditorPath(row.citySlug, row.slug)} className="cms-btn mt-4">Edit local copy</Link>
    </article>)}</div>
    {!rows.length && <p className="cms-card text-sm">Create a micromarket ad page to start writing its local copy.</p>}
  </main>;
}
