import type { AdPage } from '@prisma/client';
import { sameContent } from './staging';

export function adPageStateOf(row: Pick<AdPage, 'draftContent' | 'publishedContent' | 'deployedContent'>) {
  return {
    hasDraft: !sameContent(row.draftContent, row.publishedContent),
    staged: !sameContent(row.publishedContent, row.deployedContent),
  };
}
