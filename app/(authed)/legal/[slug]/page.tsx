import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isLegalSlug, legalContentSchema, LEGAL_PAGES } from '@/lib/legal-schema';
import { legalStateOf } from '@/lib/legal-staging';
import { isDeployConfigured } from '@/lib/deploy';
import LegalForm from '@/components/LegalForm';
import { saveLegalPage } from '../actions';

export default async function EditLegalPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const row = await prisma.legalPage.findUnique({ where: { slug } });
  const content = legalContentSchema.safeParse(row?.draftContent);
  if (!row || !content.success || content.data.slug !== slug) return <main className="mx-auto max-w-4xl p-6">
    <h1 className="cms-title text-3xl">{LEGAL_PAGES[slug]}</h1>
    <p className="mt-4">This page’s content is not available. Apply the backend legal-page SQL, or check its stored content before editing.</p>
  </main>;
  const { saved } = await searchParams;
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <Link href="/legal" className="text-sm text-wareongo-slate hover:underline">← Legal pages</Link>
    <h1 className="cms-title mt-4 mb-2 text-3xl sm:text-4xl">{LEGAL_PAGES[slug]}</h1>
    <a href={`https://wareongo.com/${slug}`} target="_blank" rel="noreferrer" className="text-sm text-wareongo-slate hover:underline">wareongo.com/{slug} ↗</a>
    {saved && <p role="status" className="cms-card my-5 text-sm text-wareongo-green">{saved === 'publish'
      ? 'Saved for the next build. Deploy now or wait for the nightly build.'
      : 'Draft saved. Website builds will continue using the previous approved copy.'}</p>}
    <LegalForm key={row.updatedAt.toISOString()} content={content.data} expectedUpdatedAt={row.updatedAt.toISOString()}
      state={legalStateOf(row)} action={saveLegalPage} deployable={isDeployConfigured()} />
  </main>;
}
