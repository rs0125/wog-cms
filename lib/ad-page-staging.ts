import { sameContent } from './staging';

export function adPageStateOf(row: { draftContent: unknown; publishedContent: unknown; deployedContent: unknown }) {
  return {
    hasDraft: !sameContent(row.draftContent, row.publishedContent),
    staged: !sameContent(row.publishedContent, row.deployedContent),
  };
}
