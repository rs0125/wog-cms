import type seed from '@/content/micromarket-ad-pages/peenya.json';
import { parseMicromarketAdPage, createMicromarketAdTemplate } from './micromarket-ad-content.mjs';

type SeedContent = typeof seed;
/** A page may have a single area card (no whoItSuits) and a rent guide in titled sections. */
export type MicromarketAdContent = Omit<SeedContent, 'area' | 'rentGuide'> & {
  area: { whereItIs: string; whoItSuits?: string };
  rentGuide: { intro: string; description?: string; sections?: { title: string; body: string }[] };
};
export const micromarketAdEditorPath = (citySlug: string, slug: string) => '/ad-pages/micromarkets/' + citySlug + '/' + slug;
export const readMicromarketAdPage = (value: unknown, draft = false): MicromarketAdContent => parseMicromarketAdPage(value, { draft });
export const newMicromarketAdPage = (market: { citySlug: string; slug: string; name: string }): MicromarketAdContent => createMicromarketAdTemplate(market);
