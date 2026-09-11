import { Fragment } from 'react';
import type { LegalBlock, LegalContent } from '@/lib/legal-schema';

// Deliberately small inline format: bold and links, rendered as React nodes.
// HTML is always text; a pasted script or unsafe link cannot execute.
export function LegalInline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const safe = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(link[2]) && !/[\s\\]/.test(link[2]) && !Array.from(link[2]).some(c => c.charCodeAt(0) < 32);
      return safe
        ? <a key={i} href={link[2]} className="text-wareongo-blue hover:underline break-words">{link[1]}</a>
        : <Fragment key={i}>{link[1]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  })}</>;
}

function displayDate(iso: string, comma: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso))) return '—';
  const [year, month, day] = iso.split('-').map(Number);
  const suffix = day >= 11 && day <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');
  const name = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${day}${suffix} ${name}${comma ? ',' : ''} ${year}`;
}

export function LegalDates({ content }: { content: LegalContent }) {
  const terms = content.slug === 'terms-of-service';
  return <div className={terms ? '' : 'text-sm text-gray-600 mb-8'}>
    <p className={terms ? 'text-sm text-gray-500 mb-2' : ''}><strong>Effective Date:</strong> <time dateTime={content.effectiveDate}>{displayDate(content.effectiveDate, terms)}</time></p>
    <p className={terms ? 'text-sm text-gray-500 mb-6' : ''}><strong>Last Updated:</strong> <time dateTime={content.updated}>{displayDate(content.updated, terms)}</time></p>
  </div>;
}

function Block({ block, privacy, last }: { block: LegalBlock; privacy: boolean; last: boolean }) {
  if (block.kind === 'h2' || block.kind === 'h3') {
    const Tag = block.kind;
    return <Tag className={privacy ? 'text-2xl font-semibold text-wareongo-charcoal mt-8 mb-4' : 'text-xl font-bold mt-6 mb-3 text-wareongo-blue'}><LegalInline text={block.text} /></Tag>;
  }
  if (block.kind === 'ul' || block.kind === 'ol') {
    const Tag = block.kind;
    return <Tag className={`${block.kind === 'ul' ? 'list-disc' : 'list-decimal'} pl-6 space-y-2 ${privacy ? 'text-gray-700' : 'mb-4'}`}>
      {block.items.map((text, i) => <li key={i}><LegalInline text={text} /></li>)}
    </Tag>;
  }
  if (block.kind === 'p') return <p className={privacy ? `text-gray-700 leading-relaxed ${last ? '' : 'mb-4'}` : block.compact ? 'mb-2' : 'mb-4'}><LegalInline text={block.text} /></p>;
  return null;
}

export function LegalBody({ content }: { content: LegalContent }) {
  const privacy = content.slug === 'privacy-policy';
  // Preserve the privacy page's section spacing while allowing editors to
  // insert/reorder headings and paragraphs in the existing block editor.
  const groups: LegalBlock[][] = [];
  for (const block of content.blocks) {
    if (block.kind === 'h2' || !groups.length) groups.push([]);
    groups[groups.length - 1].push(block);
  }
  return <div className={`${privacy ? 'prose prose-gray max-w-none space-y-6' : 'prose max-w-none'} break-words`} data-legal-body>
    {privacy ? groups.map((group, i) => group[0]?.kind === 'h2'
      ? <section key={i}>{group.map((block, j) => <Block key={j} block={block} privacy last={j === group.length - 1} />)}</section>
      : <Fragment key={i}>{group.map((block, j) => <Block key={j} block={block} privacy last />)}</Fragment>)
      : content.blocks.map((block, i) => <Block key={i} block={block} privacy={false} last={i === content.blocks.length - 1} />)}
    {content.notice && <section className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <p className="text-gray-700 leading-relaxed text-sm"><LegalInline text={content.notice} /></p>
    </section>}
  </div>;
}
