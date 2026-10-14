import type seed from '@/content/micromarket-ad-pages/peenya.json';
import { parseMicromarketAdPage, createMicromarketAdTemplate } from './micromarket-ad-content.mjs';

export type MicromarketAdContent = typeof seed;
export const micromarketAdEditorPath = (citySlug: string, slug: string) => '/ad-pages/micromarkets/' + citySlug + '/' + slug;
export const readMicromarketAdPage = (value: unknown, draft = false): MicromarketAdContent => parseMicromarketAdPage(value, { draft });
export const newMicromarketAdPage = (market: { citySlug: string; slug: string; name: string }): MicromarketAdContent => createMicromarketAdTemplate(market);
