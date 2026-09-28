import type { BlogBlock, BlogFaq } from './blog-schema';
import { plainInlineText } from './inline-format';

export type WordCountOptions = { links?: boolean; formatted?: boolean };
export type WordCountSection = { id: string; label: string; words: number };

/** Count whitespace-separated words and numbers, ignoring standalone punctuation. */
export function countWords(text: string | null | undefined, options: WordCountOptions = {}): number {
  const visible = options.formatted === false ? text ?? '' : plainInlineText(text ?? '', options);
  return visible.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

export function wordSection(
  id: string,
  label: string,
  texts: (string | null | undefined)[],
  options?: WordCountOptions,
): WordCountSection {
  return { id, label, words: texts.reduce((sum, text) => sum + countWords(text, options), 0) };
}

export function countBlockWords(block: BlogBlock, options?: WordCountOptions): number {
  switch (block.kind) {
    case 'h2':
    case 'h3':
    case 'p':
      return countWords(block.text, options);
    case 'ul':
    case 'ol':
      return block.items.reduce((sum, item) => sum + countWords(item, options), 0);
    case 'table':
      return [...block.table.headers, ...block.table.rows.flat()]
        .reduce((sum, cell) => sum + countWords(cell, options), 0);
    case 'images':
      return countWords(block.caption, options);
  }
}

export const countFaqWords = (faqs: BlogFaq[]): number => faqs.reduce((sum, faq) =>
  sum + countWords(faq.q, { formatted: false }) + countWords(faq.a), 0);

/** H2 sections include their H3 subsections. H3 defines sections when there is no H2. */
export function blockWordSections(blocks: BlogBlock[], options?: WordCountOptions): WordCountSection[] {
  const heading = blocks.some(block => block.kind === 'h2') ? 'h2' : 'h3';
  const sections: WordCountSection[] = [];
  blocks.forEach((block, index) => {
    if (block.kind === heading || sections.length === 0) {
      const label = block.kind === heading
        ? plainInlineText(block.text, options).trim() || 'Untitled section'
        : blocks.some(item => item.kind === heading) ? 'Opening content' : 'Page content';
      sections.push({ id: `content-${index}`, label, words: 0 });
    }
    sections[sections.length - 1].words += countBlockWords(block, options);
  });
  return sections.length ? sections : [{ id: 'content', label: 'Page content', words: 0 }];
}

export const totalWords = (sections: WordCountSection[]): number =>
  sections.reduce((sum, section) => sum + section.words, 0);
