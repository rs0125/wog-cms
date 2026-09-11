'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { legalContentSchema, isLegalSlug } from '@/lib/legal-schema';
import type { SaveResult } from '@/lib/action-results';

export async function saveLegalPage(_prev: SaveResult | undefined, form: FormData): Promise<SaveResult> {
  await requireUser();
  const slug = String(form.get('slug') ?? '');
  if (!isLegalSlug(slug)) return { ok: false, error: 'Unknown legal page.' };
  const intent = String(form.get('intent') ?? 'draft');
  if (!['draft', 'publish'].includes(intent)) return { ok: false, error: 'Unknown save action.' };
  const expected = String(form.get('expectedUpdatedAt') ?? '');
  if (!expected || !Number.isFinite(Date.parse(expected))) return { ok: false, error: 'Reload this page before saving.' };

  let blocks: unknown;
  try { blocks = JSON.parse(String(form.get('blocks') ?? '')); }
  catch { return { ok: false, error: 'Could not read the content blocks.' }; }
  const parsed = legalContentSchema.safeParse({
    slug, blocks,
    title: form.get('title'), seoTitle: form.get('seoTitle'), description: form.get('description'),
    effectiveDate: form.get('effectiveDate'), updated: form.get('updated'), notice: form.get('notice'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  try {
    const { count } = await prisma.legalPage.updateMany({
      where: { slug, updatedAt: new Date(expected) },
      data: {
        draftContent: parsed.data,
        ...(intent === 'publish' ? { publishedContent: parsed.data } : {}),
      },
    });
    if (count !== 1) return { ok: false, error: 'This page changed after you opened it. Reload before saving so you do not overwrite another edit.' };
  } catch (error) {
    console.error('[legal] save failed:', error);
    return { ok: false, error: 'Could not save this page. Your edits are still here; please try again.' };
  }
  redirect(`/legal/${slug}?saved=${intent}`);
}
