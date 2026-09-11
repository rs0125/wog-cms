import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { LEGAL_PAGES } from '@/lib/legal-schema';
import { legalStateOf } from '@/lib/legal-staging';
import DeployButton from '@/components/DeployButton';
import { isDeployConfigured } from '@/lib/deploy';

export default async function LegalPages() {
  const rows = await prisma.legalPage.findMany({ orderBy: { slug: 'asc' } });
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h1 className="cms-title text-4xl">Legal pages</h1>
      <DeployButton configured={isDeployConfigured()} />
    </div>
    <p className="text-sm text-wareongo-slate mb-8">Save drafts privately. Use “Save for next build” when the copy is ready, then deploy or wait for the nightly build.</p>
    <div className="space-y-4">
      {Object.entries(LEGAL_PAGES).map(([slug, name]) => {
        const row = rows.find(r => r.slug === slug);
        const state = row ? legalStateOf(row) : null;
        return <div key={slug} className="cms-card">
          <h2 className="cms-title text-xl"><Link href={`/legal/${slug}`} className="hover:underline">{name}</Link></h2>
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
