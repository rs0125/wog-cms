import { notFound } from 'next/navigation';
import BlogForm from '@/components/BlogForm';
import DeleteBlogForm from '@/components/DeleteBlogForm';
import ListingToggle from '@/components/ListingToggle';
import Toast from '@/components/Toast';
import DeployButton from '@/components/DeployButton';
import { updateBlog } from '../actions';
import { prisma } from '@/lib/prisma';
import { blogSchema, type BlogInput } from '@/lib/blog-schema';
import { stateOf } from '@/lib/staging';
import { isDeployConfigured } from '@/lib/deploy';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function EditBlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  // Issued together: these don't depend on each other, and each sequential
  // round trip to the database costs real latency.
  const [row, allOptions] = await Promise.all([
    prisma.blog.findUnique({ where: { id: Number(id) } }),
    prisma.blog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, slug: true, title: true },
    }),
  ]);
  if (!row) notFound();

  // Every blog but this one — self-references are rejected server-side, so
  // they're simply not offered. Filtered here rather than in a second query.
  const relatedOptions = allOptions.filter((o) => o.id !== row.id);

  // Parsed rather than cast: blocks/faqs are Json columns, so this is the point
  // where bad data written by anything other than this form would surface —
  // better here than as a blank section on the live page.
  const parsed = blogSchema.safeParse({
    ...row,
    datePublished: iso(row.datePublished),
    dateModified: iso(row.dateModified),
  });

  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-2 text-2xl font-semibold">{row.title}</h1>
        <p className="mb-4 text-sm text-red-600">
          This blog&apos;s stored content doesn&apos;t match the expected shape, so the editor can&apos;t open it
          safely.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-neutral-100 p-4 text-xs">
          {parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}
        </pre>
      </main>
    );
  }

  const blog: BlogInput = parsed.data;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <span className="cms-eyebrow mb-2 block">Editing blog</span>
          <h1 className="cms-title text-3xl leading-tight sm:text-4xl">{blog.title}</h1>
          <a
            href={`https://wareongo.com/blogs/${blog.slug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-wareongo-slate transition-colors hover:text-wareongo-blue"
          >
            wareongo.com/blogs/{blog.slug} ↗
          </a>
        </div>
        <div className="ml-auto flex flex-wrap items-start justify-end gap-2">
          {/* Reads the row, not the parsed copy: this is about what the database
              currently says, which is also what the action flips. */}
          <ListingToggle id={row.id} listed={row.status === 'PUBLISHED'} />
          <DeleteBlogForm id={row.id} slug={blog.slug} />
        </div>
      </div>

      {saved && (
        <Toast
          title="Draft saved"
          detail="It's in the CMS, not on the site yet — wareongo.com keeps serving the old version until you deploy."
          dismissLabel="Do it later"
        >
          {/* No second confirmation behind this one: the card is already asking
              the question, with the alternative sitting right next to it. */}
          <DeployButton configured={isDeployConfigured()} label="Deploy now" confirm={false} />
        </Toast>
      )}

      <BlogForm
        blog={blog}
        action={updateBlog}
        id={row.id}
        relatedOptions={relatedOptions}
        staged={stateOf(row) === 'STAGED'}
        deployable={isDeployConfigured()}
        expectedUpdatedAt={row.updatedAt.toISOString()}
      />
    </main>
  );
}
