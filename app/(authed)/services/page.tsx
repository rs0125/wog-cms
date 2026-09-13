import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { SERVICE_PAGES } from '@/lib/service-schema';
import { serviceStateOf } from '@/lib/service-staging';
import DeployButton from '@/components/DeployButton';
import { isDeployConfigured } from '@/lib/deploy';

export default async function ServicePages() {
  const rows = await prisma.servicePage.findMany();
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 className="cms-title text-4xl">Services</h1>
      <DeployButton configured={isDeployConfigured()} />
    </div>
    <p className="mb-8 text-sm text-wareongo-slate">Write your service pages here. Empty pages and drafts stay private. Use “Save for next build” when the content is ready.</p>
    <div className="space-y-4">
      {Object.entries(SERVICE_PAGES).map(([slug, name]) => {
        const row = rows.find(r => r.slug === slug);
        const state = row ? serviceStateOf(row) : null;
        return <div key={slug} className="cms-card">
          <h2 className="cms-title text-xl"><Link href={`/services/${slug}`} className="hover:underline">{name}</Link></h2>
          <p className="mt-1 text-sm text-wareongo-slate">/services/{slug}</p>
          <p className="mt-3 text-sm">
            {!state ? 'Not written' : state.staged
              ? state.published ? 'Ready for next build' : 'Removal ready for next build'
              : state.published ? 'Included in last build request' : 'Draft · Not on the website'}
            {state?.published && state.hasDraft && <span className="ml-3 text-wareongo-sienna">Draft changes</span>}
          </p>
          <Link href={`/services/${slug}`} className="cms-btn mt-4">{row ? 'Edit page' : 'Write page'}</Link>
        </div>;
      })}
    </div>
  </main>;
}
