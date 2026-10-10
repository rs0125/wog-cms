import { prisma } from './prisma';
import { blogSchema } from './blog-schema';
import { BLOG_INDEX_SELECT, blogIndexEntries } from './blog-index';

// The website gives this legacy article's first body photo priority over its
// rotating default thumbnails. Only this article needs a body read for the index.
const BODY_THUMBNAIL_SLUG = 'dabaspet-multimodal-logistics-park';
export async function loadBlogOptions() {
  const [rows, legacy] = await Promise.all([
    prisma.blog.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: BLOG_INDEX_SELECT }),
    prisma.blog.findUnique({ where: { slug: BODY_THUMBNAIL_SLUG }, select: { blocks: true } }),
  ]);
  const blocks = blogSchema.shape.blocks.safeParse(legacy?.blocks);
  const firstImage = blocks.success ? blocks.data.flatMap(block => block.kind === 'images' ? block.images : [])[0] : null;
  return {
    options: rows.map(({ id, slug, title }) => ({ id, slug, title })),
    indexEntries: blogIndexEntries(rows).map(entry => entry.slug === BODY_THUMBNAIL_SLUG ? { ...entry, firstImage } : entry),
  };
}
