import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isServiceSlug, serviceDraftSchema, SERVICE_PAGES, emptyService } from '@/lib/service-schema';
import { serviceStateOf } from '@/lib/service-staging';
import { isDeployConfigured } from '@/lib/deploy';
import ServiceForm from '@/components/ServiceForm';
import { saveServicePage } from '../actions';

export default async function EditServicePage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const { slug } = await params;
  if (!isServiceSlug(slug)) notFound();
  const row = await prisma.servicePage.findUnique({ where: { slug } });
  const content = row ? serviceDraftSchema.parse(row.draftContent) : emptyService(slug);
  if (content.slug !== slug) throw new Error('Service content does not match its URL.');
  const { saved } = await searchParams;
  const state = row ? serviceStateOf(row) : { hasDraft: false, staged: false, published: false, deployed: false };
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <Link href="/services" className="text-sm text-wareongo-slate hover:underline">← Services</Link>
    <h1 className="cms-title mt-4 mb-2 text-3xl sm:text-4xl">{SERVICE_PAGES[slug]}</h1>
    <p className="text-sm text-wareongo-slate">wareongo.com/services/{slug}</p>
    {saved && <p role="status" className="cms-card my-5 text-sm text-wareongo-green">{saved === 'publish'
      ? 'Saved for the next build. Deploy now or wait for the nightly build.'
      : saved === 'unpublish' ? 'This page and its footer link will be removed on the next build. Your draft is kept.'
        : 'Draft saved privately. Website builds only use content saved for the next build.'}</p>}
    <ServiceForm key={row?.updatedAt.toISOString() ?? 'new'} content={content} expectedUpdatedAt={row?.updatedAt.toISOString() ?? 'new'}
      state={state} action={saveServicePage} deployable={isDeployConfigured()} />
  </main>;
}
