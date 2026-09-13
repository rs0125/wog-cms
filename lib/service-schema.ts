import { z } from 'zod';
import { blogSchema, blogBlockSchema, tableRowsMatchHeaders } from './blog-schema';

export const SERVICE_PAGES = {
  'warehouse-search': 'Warehouse Search',
  'build-to-suit': 'Build-To-Suit',
  'lease-negotiation': 'Lease Negotiation',
  'compliance-procurement': 'Compliance Procurement',
} as const;
export type ServiceSlug = keyof typeof SERVICE_PAGES;
export const isServiceSlug = (slug: string): slug is ServiceSlug => Object.hasOwn(SERVICE_PAGES, slug);
const slugSchema = z.enum(['warehouse-search', 'build-to-suit', 'lease-negotiation', 'compliance-procurement']);

// Drafts may be unfinished, including a newly added empty block. Published
// revisions use the same complete block validation as blogs below.
const text = z.string().max(20000);
const draftBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('h2'), text }),
  z.object({ kind: z.literal('h3'), text }),
  z.object({ kind: z.literal('p'), text }),
  z.object({ kind: z.literal('ul'), items: z.array(text).max(100) }),
  z.object({ kind: z.literal('ol'), items: z.array(text).max(100) }),
  z.object({ kind: z.literal('table'), table: z.object({ headers: z.array(text).max(50), rows: z.array(z.array(text).max(50)).max(300) }) }),
  z.object({ kind: z.literal('images'), images: z.array(z.object({
    url: z.string().url().startsWith('https://'), alt: text,
    width: z.number().int().positive(), height: z.number().int().positive(),
  })).max(4), caption: text }),
]);

export const serviceDraftSchema = z.object({
  slug: slugSchema,
  title: z.string().max(300),
  seoTitle: z.string().max(300),
  description: z.string().max(1000),
  summary: text,
  keywords: z.array(z.string().max(300)).max(100),
  blocks: z.array(draftBlockSchema).max(300),
  faqs: z.array(z.object({ q: text, a: text })).max(100),
});

export type ServiceContent = z.infer<typeof serviceDraftSchema>;
export const hasServiceWriting = (blocks: ServiceContent['blocks']) => blocks.some(b =>
  b.kind === 'p' ? Boolean(b.text.trim())
    : b.kind === 'ul' || b.kind === 'ol' ? b.items.some(s => s.trim())
      : b.kind === 'table' ? b.table.rows.some(row => row.some(s => s.trim())) : false,
);

const completeServiceSchema = serviceDraftSchema.extend({
  title: z.string().trim().min(1, 'Add a page heading.').max(300),
  seoTitle: z.string().trim().min(1, 'Add an SEO title.').max(300),
  description: z.string().trim().min(1, 'Add a meta description.').max(1000),
  summary: z.string().trim().min(1, 'Add an introduction.').max(20000),
  blocks: z.array(blogBlockSchema).min(1, 'Write service content before publishing.').max(300).refine(tableRowsMatchHeaders, {
    message: 'Every table row must have the same number of cells as headers.',
  }),
  faqs: blogSchema.shape.faqs,
  keywords: blogSchema.shape.keywords,
}).refine(p => hasServiceWriting(p.blocks), {
  path: ['blocks'], message: 'Write service content in a paragraph, list or table before publishing.',
});

// Publishing also saves a draft. Preserve every draft size/shape constraint so
// a published revision can always be reopened and edited by the CMS.
export const servicePublishSchema = serviceDraftSchema.pipe(completeServiceSchema);

export const emptyService = (slug: ServiceSlug): ServiceContent => ({
  slug, title: SERVICE_PAGES[slug], seoTitle: `${SERVICE_PAGES[slug]} | WareOnGo`,
  description: '', summary: '', keywords: [], blocks: [], faqs: [],
});
