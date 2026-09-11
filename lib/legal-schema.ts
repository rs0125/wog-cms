import { z } from 'zod';

export const LEGAL_PAGES = {
  'privacy-policy': 'Privacy Policy',
  'terms-of-service': 'Terms of Service',
} as const;
export type LegalSlug = keyof typeof LEGAL_PAGES;
export const isLegalSlug = (slug: string): slug is LegalSlug => Object.hasOwn(LEGAL_PAGES, slug);
export const LEGAL_BLOCK_KINDS = ['h2', 'h3', 'p', 'ul', 'ol'] as const;

const text = z.string().trim().min(1, 'required').max(20000);
const date = z.iso.date();
const legalBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('h2'), text }),
  z.object({ kind: z.literal('h3'), text }),
  z.object({ kind: z.literal('p'), text, compact: z.boolean().optional() }),
  z.object({ kind: z.literal('ul'), items: z.array(text).min(1).max(100) }),
  z.object({ kind: z.literal('ol'), items: z.array(text).min(1).max(100) }),
]);

export const legalContentSchema = z.object({
  slug: z.enum(['privacy-policy', 'terms-of-service']),
  title: text.max(300),
  seoTitle: text.max(300),
  description: text.max(1000),
  effectiveDate: date,
  updated: date,
  blocks: z.array(legalBlockSchema).min(1, 'Add at least one content block.').max(300),
  notice: z.string().trim().max(20000),
}).refine(p => p.updated >= p.effectiveDate, {
  path: ['updated'], message: 'Last updated must be on or after the effective date.',
});

export type LegalContent = z.infer<typeof legalContentSchema>;
export type LegalBlock = z.infer<typeof legalBlockSchema>;
