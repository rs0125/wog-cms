'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { fetchMicromarkets } from '@/lib/micromarkets-api';
import { fetchLocations } from '@/lib/locations-api';
import { micromarketAdEditorPath, newMicromarketAdPage, readMicromarketAdPage } from '@/lib/micromarket-ad-schema';
import { MAX_MICROMARKET_AD_BYTES, isSupportedAdIdentity, micromarketAdChoices } from '@/lib/micromarket-ad-content.mjs';
import { sameContent } from '@/lib/staging';
import type { SaveResult } from '@/lib/action-results';

const validKey = isSupportedAdIdentity;

export async function createMicromarketAdPage(_previous: SaveResult | undefined, form: FormData): Promise<SaveResult> {
  await requireUser();
  const citySlug = String(form.get('citySlug') ?? 'bengaluru');
  const slug = String(form.get('slug') ?? '');
  if (!validKey(citySlug, slug)) return { ok: false, error: 'Choose a supported area or city.' };
  try {
    const { data } = await fetchMicromarkets();
    const cities = citySlug === 'hosur' ? (await fetchLocations()).cities : [];
    const choices: { citySlug: string; slug: string; name: string }[] = micromarketAdChoices(data, cities);
    const market = choices.find(item => item.citySlug === citySlug && item.slug === slug);
    if (!market) return { ok: false, error: 'This area has no current inventory. Choose another area or city.' };
    const content = newMicromarketAdPage({ citySlug, slug, name: market.name });
    // An identical retry opens the existing page without replacing any edits.
    await prisma.micromarketAdPage.upsert({
      where: { citySlug_slug: { citySlug, slug } },
      create: { citySlug, slug, name: market.name, draftContent: content },
      update: {},
    });
  } catch {
    console.error('[micromarket-ad-pages] create failed');
    return { ok: false, error: 'Could not create this page. Check the inventory connection and try again.' };
  }
  redirect(micromarketAdEditorPath(citySlug, slug));
}

export async function saveMicromarketAdPage(_previous: SaveResult | undefined, form: FormData): Promise<SaveResult> {
  await requireUser();
  const citySlug = String(form.get('citySlug') ?? '');
  const slug = String(form.get('slug') ?? '');
  const intent = String(form.get('intent') ?? 'draft');
  const expected = String(form.get('expectedUpdatedAt') ?? '');
  if (!validKey(citySlug, slug)) return { ok: false, error: 'Unknown micromarket ad page.' };
  if (!['draft', 'publish'].includes(intent)) return { ok: false, error: 'Unknown save action.' };
  if (!expected || !Number.isFinite(Date.parse(expected))) return { ok: false, error: 'Reload this page before saving.' };
  let content;
  try {
    const raw = String(form.get('content') ?? '');
    if (new TextEncoder().encode(raw).length > MAX_MICROMARKET_AD_BYTES) throw new Error('This page has too much text. Shorten the copy before saving.');
    content = readMicromarketAdPage(JSON.parse(raw), intent === 'draft');
    if (content.citySlug !== citySlug || content.slug !== slug) throw new Error('The micromarket identity cannot be changed in the editor.');
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? 'Could not read the page content.' : error instanceof Error ? error.message : 'Check the page content.' };
  }
  try {
    const identity = await prisma.micromarketAdPage.findUnique({ where: { citySlug_slug: { citySlug, slug } }, select: { name: true, draftContent: true } });
    if (!identity || content.name !== identity.name) return { ok: false, error: 'The micromarket identity cannot be changed in the editor. Reload this page.' };
    const saved = readMicromarketAdPage(identity.draftContent, true);
    if (!sameContent(content.mapBylines.map(item => item.slug), saved.mapBylines.map(item => item.slug))) return { ok: false, error: 'Map locations come from the template. Edit only their bylines.' };
    const { count } = await prisma.micromarketAdPage.updateMany({
      where: { citySlug, slug, updatedAt: new Date(expected) },
      data: { draftContent: content, ...(intent === 'publish' ? { publishedContent: content } : {}) },
    });
    if (count !== 1) {
      const current = await prisma.micromarketAdPage.findUnique({ where: { citySlug_slug: { citySlug, slug } }, select: { draftContent: true, publishedContent: true } });
      const alreadySaved = current && sameContent(current.draftContent, content) && (intent === 'draft' || sameContent(current.publishedContent, content));
      if (!alreadySaved) return { ok: false, error: 'This page changed after you opened it. Reload before saving so you do not overwrite another edit.' };
    }
  } catch {
    console.error('[micromarket-ad-pages] save failed');
    return { ok: false, error: 'Could not save this page. Your edits are still here; please try again.' };
  }
  redirect(micromarketAdEditorPath(citySlug, slug) + '?saved=' + intent);
}
