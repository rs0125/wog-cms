import { prisma } from './prisma';
import { writingTargetSchema, writingComplete, type WritingTarget } from './ai-writing';
import { isServiceSlug } from './service-schema';
import { isLegalSlug } from './legal-schema';
import { isAdPageSlug } from './ad-page-schema';
import { fetchLocations, findLocation, listFor } from './locations-api';
import { fetchMicromarkets, findMicromarket } from './micromarkets-api';

class WritingImportError extends Error {}

/** Shared by the authenticated preflight action and the normal editor saves. */
export async function writingEligibility(target: WritingTarget, expected: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await checkWritingState(target, expected);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof WritingImportError ? error.message
      : 'Could not check this page. Your JSON is kept here. Try again when the connection is available.' };
  }
}

/** Read-only eligibility check. Normal editor actions remain the only save path. */
async function checkWritingState(rawTarget: WritingTarget, expected: string) {
  const parsed = writingTargetSchema.safeParse(rawTarget);
  if (!parsed.success) throw new WritingImportError('This page address is invalid. Set its URL before importing.');
  const target = parsed.data;
  const { type, slug } = target;
  if (type === 'service' && !isServiceSlug(slug) || type === 'legal' && !isLegalSlug(slug) || type === 'ad' && !isAdPageSlug(slug))
    throw new WritingImportError('This page is not available. Return to the page list and choose a page.');
  const row = type === 'blog' ? await prisma.blog.findUnique({ where: { slug } })
    : type === 'micromarket' ? await prisma.micromarketPage.findUnique({ where: { citySlug_slug: { citySlug: target.citySlug!, slug } } })
      : type === 'city' || type === 'state' ? await prisma.locationPage.findUnique({ where: { kind_slug: { kind: type === 'city' ? 'CITY' : 'STATE', slug } } })
        : type === 'service' ? await prisma.servicePage.findUnique({ where: { slug } })
          : type === 'legal' ? await prisma.legalPage.findUnique({ where: { slug } })
            : await prisma.adPage.findUnique({ where: { slug } });
  if ((row?.updatedAt.toISOString() ?? 'new') !== expected)
    throw new WritingImportError('This page changed after you opened it. Download your JSON before reloading the page, then review it against the latest copy.');
  if (row) {
    if (('status' in row && row.status === 'PUBLISHED') || ('publishedContent' in row && row.publishedContent != null) || row.deployedContent != null)
      throw new WritingImportError('This page already has approved or previously deployed content. Use the editor to make changes; JSON imports are unavailable.');
    const content = 'draftContent' in row ? row.draftContent : row;
    if (!content || typeof content !== 'object' || Array.isArray(content))
      throw new WritingImportError('The stored page has invalid content. Repair its stored content before importing.');
    if (writingComplete(type, content as Record<string, unknown>))
      throw new WritingImportError('This page already has its required writing. Use the editor to make changes; JSON imports are unavailable.');
  } else if (type === 'legal' || type === 'ad') {
    throw new WritingImportError('This page must be initialized before it can be edited.');
  } else if (type === 'city' || type === 'state') {
    const inventory = await fetchLocations();
    if (!findLocation(listFor(inventory, type === 'city' ? 'CITY' : 'STATE'), slug))
      throw new WritingImportError('Choose a location from the CMS location list so this content has a matching page.');
  } else if (type === 'micromarket') {
    if (!findMicromarket((await fetchMicromarkets()).data, target.citySlug!, slug))
      throw new WritingImportError('Choose a micromarket from the CMS list so this content has a matching page.');
  }
  if (process.env.CMS_CONTEXT_ENABLED === 'true') {
    const ref = [type, target.citySlug, slug].filter(Boolean).join('/');
    const pending = await prisma.$queryRaw<Array<{ ref: string }>>`SELECT ref FROM cms_agent_private.drafts WHERE ref = ${ref} LIMIT 1`;
    if (pending.length) throw new WritingImportError('This page has a pending Context Engine import. Review or discard it in Content imports before importing another file.');
  }
}
