import { Fragment, type ReactNode } from 'react';
import { parseInlineText, type InlinePart } from '../lib/inline-format';

function renderParts(parts: InlinePart[]): ReactNode {
  return parts.map((part, i) => {
    if (typeof part === 'string') return <Fragment key={i}>{part}</Fragment>;
    const children = renderParts(part.children);
    if (part.style === 'link') {
      const safe = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(part.href)
        && !/[\s\\]/.test(part.href) && !Array.from(part.href).some(c => c.charCodeAt(0) < 32);
      return safe
        ? <a key={i} href={part.href} className="text-wareongo-blue hover:underline break-words">{children}</a>
        : <Fragment key={i}>{children}</Fragment>;
    }
    if (part.style === 'bold') return <strong key={i}>{children}</strong>;
    if (part.style === 'italic') return <em key={i}>{children}</em>;
    return <strong key={i}><em>{children}</em></strong>;
  });
}

export default function InlineText({ text, links = false }: { text: string; links?: boolean }) {
  return <>{renderParts(parseInlineText(text, { links }))}</>;
}
