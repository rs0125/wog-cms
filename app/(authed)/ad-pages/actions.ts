'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { writingSaveError } from '@/lib/ai-writing-guard';
import { isAdPageSlug, readAdPage } from '@/lib/ad-page-schema';
import { sameContent } from '@/lib/staging';
import type { SaveResult } from '@/lib/action-results';

export async function saveAdPage(_prev: SaveResult | undefined, form: FormData): Promise<SaveResult> {
  await requireUser();
  const slug = String(form.get('slug') ?? '');
  const intent = String(form.get('intent') ?? 'draft');
  const expected = String(form.get('expectedUpdatedAt') ?? '');
  if (!isAdPageSlug(slug)) return { ok: false, error: 'Unknown ad page.' };
  if (!['draft', 'publish'].includes(intent)) return { ok: false, error: 'Unknown save action.' };
  if (!expected || !Number.isFinite(Date.parse(expected))) return { ok: false, error: 'Reload this page before saving.' };
  const importError = await writingSaveError(form, { type: 'ad', slug });
  if (importError) return { ok: false, error: importError };
  let content;
  try {
    const raw = JSON.parse(String(form.get('content') ?? ''));
    content = readAdPage(raw && typeof raw === 'object' ? { ...raw, slug } : raw, intent === 'draft');
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? 'Could not read the page content.' : error instanceof Error ? error.message : 'Check the page content.' };
  }
  try {
    const { count } = await prisma.adPage.updateMany({
      where: { slug, updatedAt: new Date(expected) },
      data: { draftContent: content, ...(intent === 'publish' ? { publishedContent: content } : {}) },
    });
    if (count !== 1) {
      // A save may commit before its response is lost. A matching retry can
      // acknowledge that result without overwriting a newer revision.
      const current = await prisma.adPage.findUnique({ where: { slug }, select: { draftContent: true, publishedContent: true } });
      const alreadySaved = current && sameContent(current.draftContent, content)
        && (intent === 'draft' || sameContent(current.publishedContent, content));
      if (!alreadySaved) return { ok: false, error: 'This page changed after you opened it. Reload before saving so you do not overwrite another edit.' };
    }
  } catch {
    console.error('[ad-pages] save failed');
    return { ok: false, error: 'Could not save this page. Your edits are still here; please try again.' };
  }
  redirect(`/ad-pages/${slug}?saved=${intent}`);
}
