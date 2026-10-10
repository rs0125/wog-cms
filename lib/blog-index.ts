import { blogSchema, type BlogImage, type BlogInput } from './blog-schema';

/** Index metadata only; don't load every article body to open one editor. */
export const BLOG_INDEX_SELECT = {
  id: true, slug: true, title: true, description: true, dateModified: true,
  sortOrder: true, status: true, thumbnail: true,
} as const;

export type BlogIndexEntry = {
  id: number; slug: string; title: string; description: string; updated: string;
  sortOrder: number; thumbnail: BlogImage | null;
  firstImage?: BlogImage | null;
};

export function blogIndexEntries(rows: {
  id: number; slug: string; title: string; description: string; dateModified: Date;
  sortOrder: number; status: string; thumbnail: unknown;
}[]): BlogIndexEntry[] {
  return rows.filter(row => row.status === 'PUBLISHED').map(row => ({
    id: row.id, slug: row.slug, title: row.title, description: row.description,
    updated: row.dateModified.toISOString().slice(0, 10), sortOrder: row.sortOrder,
    thumbnail: blogSchema.shape.thumbnail.safeParse(row.thumbnail).data ?? null,
  }));
}

/** Match the API's sortOrder/id ordering, including newly created blogs and renamed slugs. */
export function previewBlogIndex(blog: BlogInput, entries: BlogIndexEntry[], id?: number) {
  const draft = {
    id: id ?? Number.MAX_SAFE_INTEGER, slug: blog.slug, title: blog.title,
    description: blog.description, updated: blog.dateModified, thumbnail: blog.thumbnail,
    firstImage: blog.blocks.flatMap(block => block.kind === 'images' ? block.images : [])[0] ?? null,
    sortOrder: Number.isFinite(blog.sortOrder) ? blog.sortOrder : 0,
  };
  return [...entries.filter(entry => entry.id !== id && entry.slug !== blog.slug), draft]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .map(({ slug, title, description, updated, thumbnail, firstImage }) => ({ slug, title, description, updated, thumbnail, firstImage }));
}
