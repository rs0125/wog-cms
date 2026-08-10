'use client';

import { useEffect, useRef, useState } from 'react';

export type GuideOption = { slug: string; title: string };

/**
 * Multi-select for the `related` slugs. Replaces a free-text field where a typo
 * produced a cross-link the public site silently dropped — picking from the real
 * guide list makes an invalid slug impossible to enter. The server still
 * validates, since a form post doesn't have to come from this UI.
 */
export default function RelatedPicker({
  options,
  value,
  onChange,
}: {
  options: GuideOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Click-outside and Escape both close it — a dropdown that only closes by
  // re-clicking the button feels stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]);

  const titleFor = (slug: string) => options.find((o) => o.slug === slug)?.title ?? slug;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="cms-input flex items-center justify-between gap-2 text-left"
      >
        <span className={value.length ? 'text-wareongo-charcoal' : 'text-wareongo-slate/60'}>
          {value.length === 0
            ? 'None selected'
            : `${value.length} selected`}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-4 w-4 shrink-0 text-wareongo-blue transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Selected items stay visible when the panel is shut, so the field still
          says what it holds at a glance. */}
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => toggle(slug)}
                title={`Remove ${slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-wareongo-blue/25 bg-white px-2.5 py-1 text-xs text-wareongo-blue transition-colors hover:bg-wareongo-blue/5"
              >
                <span className="max-w-[18rem] truncate">{titleFor(slug)}</span>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-wareongo-blue/25 bg-white p-1 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-wareongo-slate">
              No other guides exist yet.
            </p>
          ) : (
            options.map((o) => {
              const checked = value.includes(o.slug);
              return (
                <label
                  key={o.slug}
                  role="option"
                  aria-selected={checked}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-wareongo-blue/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.slug)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-wareongo-blue"
                  />
                  <span className="min-w-0">
                    <span className="block text-wareongo-charcoal">{o.title}</span>
                    <span className="block truncate text-xs text-wareongo-slate">/guides/{o.slug}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
