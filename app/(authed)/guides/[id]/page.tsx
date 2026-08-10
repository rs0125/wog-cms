import { notFound } from 'next/navigation';
import GuideForm from '@/components/GuideForm';
import DeleteGuideForm from '@/components/DeleteGuideForm';
import { updateGuide } from '../actions';
import { prisma } from '@/lib/prisma';
import { guideSchema, type GuideInput } from '@/lib/guide-schema';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function EditGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const row = await prisma.guide.findUnique({ where: { id: Number(id) } });
  if (!row) notFound();

  // Parsed rather than cast: blocks/faqs are Json columns, so this is the point
  // where bad data written by anything other than this form would surface —
  // better here than as a blank section on the live page.
  const parsed = guideSchema.safeParse({
    ...row,
    datePublished: iso(row.datePublished),
    dateModified: iso(row.dateModified),
  });

  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-2 text-2xl font-semibold">{row.title}</h1>
        <p className="mb-4 text-sm text-red-600">
          This guide&apos;s stored content doesn&apos;t match the expected shape, so the editor can&apos;t open it
          safely.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-neutral-100 p-4 text-xs">
          {parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}
        </pre>
      </main>
    );
  }

  const guide: GuideInput = parsed.data;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <span className="cms-eyebrow mb-2 block">Editing guide</span>
          <h1 className="font-display text-3xl leading-tight text-wareongo-blue sm:text-4xl">{guide.title}</h1>
          <a
            href={`https://wareongo.com/guides/${guide.slug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-wareongo-slate transition-colors hover:text-wareongo-blue"
          >
            wareongo.com/guides/{guide.slug} ↗
          </a>
        </div>
        <div className="ml-auto">
          <DeleteGuideForm id={row.id} slug={guide.slug} />
        </div>
      </div>

      {saved && (
        <p className="mb-5 rounded-xl border border-wareongo-green/30 bg-wareongo-green/5 px-4 py-2.5 text-sm text-wareongo-green">
          Saved. It reaches the live site on the next build.
        </p>
      )}

      <GuideForm guide={guide} action={updateGuide} id={row.id} />
    </main>
  );
}
