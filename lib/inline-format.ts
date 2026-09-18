// Mirrored in the website's src/lib/inline-format.ts. Stored content stays text;
// only these emphasis markers are interpreted, never HTML.
export type InlinePart = string
  | { style: 'bold' | 'italic' | 'both'; children: InlinePart[] }
  | { style: 'link'; href: string; children: InlinePart[] };

export function parseInlineText(text: string, { links = false, depth = 0 } = {}): InlinePart[] {
  if (depth >= 16) return [text];
  const pattern = /\\([\\*_])|\*\*\*(?=\S)([\s\S]*?\S)\*\*\*|\*\*(?!\*)(?=\S)([\s\S]*?\S)\*\*(?!\*)|(?<!\w)_(?=\S)([\s\S]*?\S)_(?!\w)|(?<!\*)\*(?!\*)(?=\S)((?:\*\*(?=\S)[\s\S]*?\S\*\*|\\.|[^*])+?)(?<!\s)\*(?!\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  const parts: InlinePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    if (index > cursor) parts.push(text.slice(cursor, index));
    if (match[1]) parts.push(match[1]);
    else if (match[6]) parts.push(links
      ? { style: 'link', href: match[8], children: parseInlineText(match[7], { depth: depth + 1 }) }
      : match[0]);
    else parts.push({
      style: match[2] !== undefined ? 'both' : match[3] !== undefined ? 'bold' : 'italic',
      children: parseInlineText(match[2] ?? match[3] ?? match[4] ?? match[5], { links, depth: depth + 1 }),
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

const plainParts = (parts: InlinePart[]): string => parts.map(part =>
  typeof part === 'string' ? part : plainParts(part.children),
).join('');

/** Plain text for structured data and word counts, matching the visible copy. */
export const plainInlineText = (text: string): string => plainParts(parseInlineText(text));
