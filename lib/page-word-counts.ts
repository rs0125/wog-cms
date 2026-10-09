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
  | 'complianceHeading' | 'complianceProse' | 'citiesHeading' | 'inventoryHeading', string | null
>>;

export type EditorialScope = 'micromarket' | 'city' | 'state';

/** Each scope lists only the sections it renders; a state's grid sits third. */
const EDITORIAL_ORDER = {
  micromarket: ['title', 'hero', 'market', 'pricing', 'specification', 'inventory', 'faqs'],
  city: ['title', 'hero', 'market', 'corridors', 'pricing', 'specification', 'compliance', 'inventory', 'faqs'],
  state: ['title', 'hero', 'market', 'cities', 'inventory', 'pricing', 'specification', 'compliance', 'faqs'],
} as const;

export function editorialWordSections(content: EditorialCopy, scope: EditorialScope): WordCountSection[] {
  const sections = {
    title: wordSection('title', 'Page heading & eyebrow', [content.h1, content.heroEyebrow], { formatted: false }),
    hero: wordSection('hero', 'Opening paragraph', [content.heroProse]),
    market: wordSection('market', 'Market', [content.marketHeading, content.marketProse]),
    cities: wordSection('cities', 'Cities heading', [content.citiesHeading], { formatted: false }),
    corridors: wordSection('corridors', 'Corridors', [content.corridorHeading, content.corridorProse]),
    pricing: wordSection('pricing', 'Pricing', [content.rentsHeading, content.rentsProse]),
    specification: wordSection('specification', 'Specification', [content.specHeading, content.specProse]),
    compliance: wordSection('compliance', 'Compliance', [content.complianceHeading, content.complianceProse]),
    inventory: wordSection('inventory', 'Listings heading', [content.inventoryHeading], { formatted: false }),
    faqs: { id: 'faqs', label: 'Questions', words: countFaqWords(content.faqs) },
  };
  return EDITORIAL_ORDER[scope].map(key => sections[key]);
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
