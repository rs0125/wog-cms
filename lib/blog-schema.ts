import { z } from 'zod';

// Mirrors the BlogBlock / BlogFaq types in the website repo
// (src/data/blogs.ts). The public renderer switches on `kind` with no default
// case, so an unknown kind renders nothing — validating here is what stops a
// malformed block from silently blanking a section of a live page.

const nonEmpty = z.string().trim().min(1, 'required');

const blogTableSchema = z.object({
  headers: z.array(nonEmpty).min(1, 'at least one header'),
  rows: z.array(z.array(z.string())).min(1, 'at least one row'),
});

/**
 * How many images one block may hold. The renderer derives the collage layout
 * from the count alone — 1 full width, 2 side by side, 3 in a row, 4 as a 2×2 —
 * so there is no separate layout field that could disagree with the images.
 */
export const MAX_IMAGES = 4;

const blogImageSchema = z.object({
  // Written by the upload route, never typed by hand: an absolute URL on the R2
  // public host. Anything else would also have to be added to the website's
  // vercel.json `images.remotePatterns` before it could be optimized.
  url: z.string().url().startsWith('https://', 'must be an https URL'),
  // Required, not optional: blog images carry information (a layout diagram, a
  // dock detail), so an empty alt would be wrong for both readers and crawlers.
  alt: nonEmpty,
  // Intrinsic size of the stored file, measured at upload. Rendered as the img
  // width/height attributes so the page reserves the right box and the text
  // below it doesn't jump when the image loads.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const blogBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('h2'), text: nonEmpty }),
  z.object({ kind: z.literal('h3'), text: nonEmpty }),
  z.object({ kind: z.literal('p'), text: nonEmpty }),
  z.object({ kind: z.literal('ul'), items: z.array(nonEmpty).min(1) }),
  z.object({ kind: z.literal('ol'), items: z.array(nonEmpty).min(1) }),
  z.object({ kind: z.literal('table'), table: blogTableSchema }),
  z.object({
    kind: z.literal('images'),
    images: z.array(blogImageSchema).min(1, 'add at least one image').max(MAX_IMAGES, `at most ${MAX_IMAGES} images`),
    // Optional shared caption under the whole group. Always present as a string
    // so the JSON shape is stable — an absent key and an empty one would
    // otherwise compare as different content and show the blog as Staged.
    caption: z.string().trim(),
  }),
]);

const blogFaqSchema = z.object({ q: nonEmpty, a: nonEmpty });

// Every row in a table must have exactly as many cells as there are headers —
// a short row renders a visually broken table on the live page.
export const tableRowsMatchHeaders = (blocks: BlogBlock[]) =>
  blocks.every((b) => (b.kind === 'table' ? b.table.rows.every((r) => r.length === b.table.headers.length) : true));

export const blogSchema = z.object({
  // Lowercase kebab only: the slug is the public URL segment (/blogs/{slug})
  // and changing one later costs a redirect, so it's worth constraining.
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, numbers and single hyphens only'),
  title: nonEmpty,
  seoTitle: nonEmpty,
  description: nonEmpty,
  summary: nonEmpty,
  keywords: z.array(nonEmpty),
  related: z.array(nonEmpty),
  // Optional byline. null, not '', so "no byline" is one value rather than two —
  // the empty string would otherwise show up as a difference against the
  // deployed snapshot and mark the blog Staged for nothing.
  author: nonEmpty.nullable(),
  blocks: z.array(blogBlockSchema).min(1, 'a blog needs at least one block').refine(tableRowsMatchHeaders, {
    message: 'every table row must have the same number of cells as headers',
  }),
  faqs: z.array(blogFaqSchema),
  datePublished: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dateModified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  sortOrder: z.number().int().min(0),
  status: z.enum(['DRAFT', 'PUBLISHED']),
});

export type BlogBlock = z.infer<typeof blogBlockSchema>;
export type BlogImage = z.infer<typeof blogImageSchema>;
export type BlogImagesBlock = Extract<BlogBlock, { kind: 'images' }>;
export type BlogFaq = z.infer<typeof blogFaqSchema>;
export type BlogInput = z.infer<typeof blogSchema>;

export const BLOCK_KINDS = ['h2', 'h3', 'p', 'ul', 'ol', 'table', 'images'] as const;

export const emptyBlock = (kind: BlogBlock['kind']): BlogBlock => {
  switch (kind) {
    case 'ul':
    case 'ol':
      return { kind, items: [''] };
    case 'table':
      return { kind, table: { headers: ['', ''], rows: [['', '']] } };
    case 'images':
      return { kind, images: [], caption: '' };
    default:
      return { kind, text: '' };
  }
};
