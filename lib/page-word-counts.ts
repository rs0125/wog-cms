import type { BlogInput, BlogFaq } from './blog-schema';
import type { LegalContent } from './legal-schema';
import { AD_COPY_GROUPS, type AdPageContent } from './ad-page-schema';
import { blockWordSections, countFaqWords, wordSection, type WordCountSection } from './word-count';

/** Blogs and service pages share the same authored content shape. */
export function articleWordSections(
  content: Pick<BlogInput, 'title' | 'summary' | 'blocks' | 'faqs'>,
  summaryLabel = 'Summary',
): WordCountSection[] {
  return [
    wordSection('title', 'Page heading', [content.title], { formatted: false }),
    wordSection('summary', summaryLabel, [content.summary]),
    ...blockWordSections(content.blocks),
    { id: 'faqs', label: 'FAQs', words: countFaqWords(content.faqs) },
  ];
}

export function legalWordSections(content: Pick<LegalContent, 'title' | 'blocks' | 'notice'>): WordCountSection[] {
  return [
    wordSection('title', 'Page heading', [content.title], { formatted: false }),
    ...blockWordSections(content.blocks, { links: true }),
    wordSection('notice', 'Closing notice', [content.notice], { links: true }),
  ];
}

type EditorialCopy = {
  h1: string;
  heroProse: string;
  faqs: BlogFaq[];
} & Partial<Record<
  'heroEyebrow' | 'marketHeading' | 'marketProse' | 'rentsHeading' | 'rentsProse'
  | 'specHeading' | 'specProse' | 'corridorHeading' | 'corridorProse'
  | 'complianceHeading' | 'complianceProse' | 'inventoryHeading', string | null
>>;

export function editorialWordSections(content: EditorialCopy, isCity: boolean): WordCountSection[] {
  return [
    wordSection('title', 'Page heading & eyebrow', [content.h1, content.heroEyebrow], { formatted: false }),
    wordSection('hero', 'Opening paragraph', [content.heroProse]),
    wordSection('market', 'Market', [content.marketHeading, content.marketProse]),
    ...(isCity ? [wordSection('corridors', 'Corridors', [content.corridorHeading, content.corridorProse])] : []),
    wordSection('pricing', 'Pricing', [content.rentsHeading, content.rentsProse]),
    wordSection('specification', 'Specification', [content.specHeading, content.specProse]),
    ...(isCity ? [wordSection('compliance', 'Compliance', [content.complianceHeading, content.complianceProse])] : []),
    wordSection('inventory', 'Listings heading', [content.inventoryHeading], { formatted: false }),
    { id: 'faqs', label: 'Questions', words: countFaqWords(content.faqs) },
  ];
}

export function adPageWordSections(content: AdPageContent): WordCountSection[] {
  return AD_COPY_GROUPS.filter(group => group.id !== 'settings').map(group => {
    const texts = group.fields.map(field => content.copy[field.key]);
    switch (group.id) {
      case 'hero': texts.push(...content.heroSteps); break;
      case 'why': texts.push(...content.benefits.flatMap(item => [item.title, item.body])); break;
      case 'services': texts.push(...content.services.flatMap(item => [item.title, item.body, item.cta])); break;
      case 'audiences': texts.push(...content.audiences.flatMap(item => [
        item.title, item.body, item.primaryCta, ...(item.id === '3pls' ? [item.secondaryCta] : []),
      ])); break;
      case 'areas': texts.push(...content.areaRows.flatMap(row => [row.need, ...row.areas])); break;
      case 'overview': texts.push(
        ...content.overviewParagraphs, ...content.overviewStats.flatMap(item => [item.value, item.label]),
      ); break;
    }
    return wordSection(group.id, group.title, texts, { formatted: false });
  });
}
