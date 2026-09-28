import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AD_PAGES, isAdPageSlug, readAdPage } from '@/lib/ad-page-schema';
import { adPageStateOf } from '@/lib/ad-page-staging';
import { isDeployConfigured } from '@/lib/deploy';
import AdPageForm from '@/components/AdPageForm';
import { saveAdPage } from '../actions';

export default async function EditAdPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const { slug } = await params;
  if (!isAdPageSlug(slug)) notFound();
  const row = await prisma.adPage.findUnique({ where: { slug } });
  if (!row) throw new Error('Initialize the Bangalore ad page before editing.');
  const content = readAdPage(row.draftContent, true);
  if (content.slug !== slug) throw new Error('Ad page content does not match its URL.');
  const { saved } = await searchParams;
  const previewUrl = new URL('/preview/ad-pages/bangalore', process.env.WEBSITE_PREVIEW_ORIGIN || 'https://wareongo.com').href;
  return <main className="mx-auto max-w-5xl p-6 sm:p-10">
    <Link href="/ad-pages" className="text-sm text-wareongo-slate hover:underline">← Ad pages</Link>
    <h1 className="cms-title mb-2 mt-4 text-3xl sm:text-4xl">{AD_PAGES[slug]}</h1>
    <p className="text-sm text-wareongo-slate">wareongo.com/{slug} · Google Ads landing page</p>
    {saved && <p role="status" className="cms-card my-5 text-sm text-wareongo-green">{saved === 'publish' ? 'Saved for the next build. Deploy now or wait for the nightly build.' : 'Draft saved privately. Website builds use only approved content.'}</p>}
    <AdPageForm key={row.updatedAt.toISOString()} content={content} expectedUpdatedAt={row.updatedAt.toISOString()} state={adPageStateOf(row)} action={saveAdPage} deployable={isDeployConfigured()} previewUrl={previewUrl} />
  </main>;
}
