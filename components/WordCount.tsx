import { totalWords, type WordCountSection } from '@/lib/word-count';

export function WordCount({ count, label, variant = 'default', className = '' }: {
  count: number; label?: string; variant?: 'default' | 'total'; className?: string;
}) {
  return <span className={`inline-block max-w-full break-words text-sm leading-5 tabular-nums ${
    variant === 'total'
      ? 'rounded-lg bg-wareongo-blue/5 px-2.5 py-1.5 font-semibold text-wareongo-blue'
      : 'font-medium text-wareongo-slate'
  } ${className}`}>
    {label && `${label}: `}{count.toLocaleString('en-IN')} {count === 1 ? 'word' : 'words'}
  </span>;
}

export default function WordCountSummary({ sections }: { sections: WordCountSection[] }) {
  return <section aria-label="Word counts" className="cms-card mb-6">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold text-wareongo-blue">Word count</h2>
      <WordCount count={totalWords(sections)} label="Total" variant="total" />
    </div>
    <p className="cms-hint">Counts the page copy you edit. Excludes SEO fields, image descriptions and automatically generated content.</p>
    <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
      {sections.map(section => <div key={section.id} className="flex min-w-0 items-baseline justify-between gap-3 border-t border-wareongo-blue/15 py-2 text-sm">
        <dt className="min-w-0 break-words text-wareongo-slate">{section.label}</dt>
        <dd className="min-w-0 max-w-[50%] shrink-0 text-right"><WordCount count={section.words} /></dd>
      </div>)}
    </dl>
  </section>;
}
