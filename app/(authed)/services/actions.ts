'use server';

import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { isServiceSlug, serviceDraftSchema, servicePublishSchema } from '@/lib/service-schema';
import type { SaveResult } from '@/lib/action-results';

export async function saveServicePage(_prev: SaveResult | undefined, form: FormData): Promise<SaveResult> {
  await requireUser();
  const slug = String(form.get('slug') ?? '');
  if (!isServiceSlug(slug)) return { ok: false, error: 'Unknown service page.' };
  const intent = String(form.get('intent') ?? 'draft');
  if (!['draft', 'publish', 'unpublish'].includes(intent)) return { ok: false, error: 'Unknown save action.' };
  const expected = String(form.get('expectedUpdatedAt') ?? '');
  if (expected !== 'new' && (!expected || !Number.isFinite(Date.parse(expected)))) {
    return { ok: false, error: 'Reload this page before saving.' };
  }
  let raw: unknown;
  try { raw = JSON.parse(String(form.get('content') ?? '')); }
  catch { return { ok: false, error: 'Could not read the page content.' }; }
  const parsed = (intent === 'publish' ? servicePublishSchema : serviceDraftSchema).safeParse(
    raw && typeof raw === 'object' ? { ...raw, slug } : raw,
  );
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };

  try {
    const data = {
      draftContent: parsed.data,
      ...(intent === 'publish' ? { publishedContent: parsed.data } : {}),
      ...(intent === 'unpublish' ? { publishedContent: Prisma.DbNull } : {}),
    };
    if (expected === 'new') {
      // A concurrent first save hits the unique slug constraint instead of
      // overwriting a page another editor just created.
      await prisma.servicePage.create({ data: { slug, ...data } });
    } else {
      const { count } = await prisma.servicePage.updateMany({ where: { slug, updatedAt: new Date(expected) }, data });
      if (count !== 1) return { ok: false, error: 'This page changed after you opened it. Reload before saving so you do not overwrite another edit.' };
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'This page was just saved by another editor. Reload before saving.' };
    }
    console.error('[services] save failed');
    return { ok: false, error: 'Could not save this page. Your edits are still here; please try again.' };
  }
  redirect(`/services/${slug}?saved=${intent}`);
}
