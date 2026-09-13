import type { ServicePage } from '@prisma/client';
import { sameContent } from './staging';

export function serviceStateOf(row: Pick<ServicePage, 'draftContent' | 'publishedContent' | 'deployedContent'>) {
  return {
    hasDraft: !sameContent(row.draftContent, row.publishedContent),
    staged: !sameContent(row.publishedContent, row.deployedContent),
    published: row.publishedContent !== null,
    deployed: row.deployedContent !== null,
  };
}
