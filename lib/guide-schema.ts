import { z } from 'zod';

// Mirrors the GuideBlock / GuideFaq types in the website repo
// (src/data/guides.ts). The public renderer switches on `kind` with no default
// case, so an unknown kind renders nothing — validating here is what stops a
// malformed block from silently blanking a section of a live page.

const nonEmpty = z.string().trim().min(1, 'required');

const guideTableSchema = z.object({
  headers: z.array(nonEmpty).min(1, 'at least one header'),
  rows: z.array(z.array(z.string())).min(1, 'at least one row'),
});

const guideBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('h2'), text: nonEmpty }),
  z.object({ kind: z.literal('h3'), text: nonEmpty }),
  z.object({ kind: z.literal('p'), text: nonEmpty }),
  z.object({ kind: z.literal('ul'), items: z.array(nonEmpty).min(1) }),
  z.object({ kind: z.literal('ol'), items: z.array(nonEmpty).min(1) }),
  z.object({ kind: z.literal('table'), table: guideTableSchema }),
]);

const guideFaqSchema = z.object({ q: nonEmpty, a: nonEmpty });

// Every row in a table must have exactly as many cells as there are headers —
// a short row renders a visually broken table on the live page.
const tableRowsMatchHeaders = (blocks: GuideBlock[]) =>
  blocks.every((b) => (b.kind === 'table' ? b.table.rows.every((r) => r.length === b.table.headers.length) : true));

export const guideSchema = z.object({
  // Lowercase kebab only: the slug is the public URL segment (/guides/{slug})
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
  blocks: z.array(guideBlockSchema).min(1, 'a guide needs at least one block').refine(tableRowsMatchHeaders, {
    message: 'every table row must have the same number of cells as headers',
  }),
  faqs: z.array(guideFaqSchema),
  datePublished: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dateModified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  sortOrder: z.number().int().min(0),
  status: z.enum(['DRAFT', 'PUBLISHED']),
});

export type GuideBlock = z.infer<typeof guideBlockSchema>;
export type GuideFaq = z.infer<typeof guideFaqSchema>;
export type GuideInput = z.infer<typeof guideSchema>;

export const BLOCK_KINDS = ['h2', 'h3', 'p', 'ul', 'ol', 'table'] as const;

export const emptyBlock = (kind: GuideBlock['kind']): GuideBlock => {
  switch (kind) {
    case 'ul':
    case 'ol':
      return { kind, items: [''] };
    case 'table':
      return { kind, table: { headers: ['', ''], rows: [['', '']] } };
    default:
      return { kind, text: '' };
  }
};
