import Link from '@/components/CmsLink';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { readMicromarketAdPage } from '@/lib/micromarket-ad-schema';
import { isSupportedAdIdentity, micromarketAdPath } from '@/lib/micromarket-ad-content.mjs';
import { adPageStateOf } from '@/lib/ad-page-staging';
import { isDeployConfigured } from '@/lib/deploy';
import MicromarketAdForm from '@/components/MicromarketAdForm';
import { saveMicromarketAdPage } from '../../actions';

export default async function EditMicromarketAdPage({ params, searchParams }: {
  params: Promise<{ citySlug: string; slug: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const { citySlug, slug } = await params;
  if (!isSupportedAdIdentity(citySlug, slug)) notFound();
  const row = await prisma.micromarketAdPage.findUnique({ where: { citySlug_slug: { citySlug, slug } } });
  if (!row) notFound();
  const content = readMicromarketAdPage(row.draftContent, true);
  if (content.citySlug !== citySlug || content.slug !== slug || content.name !== row.name) throw new Error('Micromarket ad page identity mismatch.');
  const { saved } = await searchParams;
  const previewUrl = new URL('/preview/ad-pages/micromarket', process.env.WEBSITE_PREVIEW_ORIGIN || 'https://wareongo.com').href;
  return <main className="mx-auto max-w-5xl p-6 sm:p-10">
    <Link href="/ad-pages/micromarkets" className="text-sm text-wareongo-slate hover:underline">← Micromarket ad pages</Link>
    <h1 className="cms-title mb-2 mt-4">{row.name} ad page</h1>
    <p className="text-sm text-wareongo-slate">wareongo.com{micromarketAdPath(slug, citySlug)} · Shared ad template</p>
    {saved && <p role="status" className="cms-card my-5 text-sm text-wareongo-green">{saved === 'publish' ? 'Saved for the next build. Deploy now or wait for the nightly build.' : 'Draft saved privately. Website builds use only approved content.'}</p>}
    <MicromarketAdForm key={row.updatedAt.toISOString()} content={content} expectedUpdatedAt={row.updatedAt.toISOString()} state={adPageStateOf(row)} action={saveMicromarketAdPage} deployable={isDeployConfigured()} previewUrl={previewUrl} />
  </main>;
}
