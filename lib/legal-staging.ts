import type { LegalPage } from '@prisma/client';
import { sameContent } from './staging';

export function legalStateOf(row: Pick<LegalPage, 'draftContent' | 'publishedContent' | 'deployedContent'>) {
  return {
    hasDraft: !sameContent(row.draftContent, row.publishedContent),
    staged: !sameContent(row.publishedContent, row.deployedContent),
  };
}
