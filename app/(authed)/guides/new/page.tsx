import GuideForm from '@/components/GuideForm';
import { createGuide } from '../actions';
import { prisma } from '@/lib/prisma';
import type { GuideInput } from '@/lib/guide-schema';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

export default async function NewGuidePage() {
  // Default to the end of the list so a new guide never silently reshuffles the
  // ItemList positions of the existing ones.
  const last = await prisma.guide.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const today = new Date().toISOString().slice(0, 10);

  const blank: GuideInput = {
    slug: '',
    title: '',
    seoTitle: '',
    description: '',
    summary: '',
    keywords: [],
    related: [],
    blocks: [{ kind: 'p', text: '' }],
    faqs: [],
    datePublished: today,
    dateModified: today,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    status: 'DRAFT',
  };

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <span className="cms-eyebrow mb-2 block">New</span>
      <h1 className="font-display mb-6 text-4xl text-wareongo-blue">Guide</h1>
      <GuideForm guide={blank} action={createGuide} />
    </main>
  );
}
