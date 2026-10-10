import BlogForm from '@/components/BlogForm';
import { createBlog } from '../actions';
import { prisma } from '@/lib/prisma';
import type { BlogInput } from '@/lib/blog-schema';
import { isDeployConfigured } from '@/lib/deploy';
import { loadBlogOptions } from '@/lib/blog-index-server';

// Gated by app/(authed)/layout.tsx, which also marks this segment dynamic.

export default async function NewBlogPage() {
  // Default to the end of the list so a new blog never silently reshuffles the
  // ItemList positions of the existing ones.
  const [last, { options: relatedOptions, indexEntries }] = await Promise.all([
    prisma.blog.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } }),
    loadBlogOptions(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const blank: BlogInput = {
    slug: '',
    title: '',
    seoTitle: '',
    description: '',
    summary: '',
    keywords: [],
    related: [],
    blocks: [{ kind: 'p', text: '' }],
    faqs: [],
    author: null,
    thumbnail: null,
    datePublished: today,
    dateModified: today,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    status: 'DRAFT',
  };

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <span className="cms-eyebrow mb-2 block">New</span>
      <h1 className="cms-title mb-6">Blog</h1>
      <BlogForm
        blog={blank}
        action={createBlog}
        relatedOptions={relatedOptions}
        indexEntries={indexEntries}
        deployable={isDeployConfigured()}
      />
    </main>
  );
}
