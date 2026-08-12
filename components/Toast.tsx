'use client';

import { useEffect, useState } from 'react';

// Centre-screen confirmation card: "Draft saved", "peb-vs-rcc deleted".
//
// Driven by a query param rather than client state, because every action here
// finishes with a redirect — the component that submitted is already gone by the
// time there's anything to report.
//
// The param is deliberately left in the URL. An earlier version tidied it away
// with window.history.replaceState, which broke the guide form: the App Router
// keys a page's leaf segment by its search params, so `/guides/5?saved=1` is a
// different segment from `/guides/5`. Rewriting the URL underneath a mounted
// page puts the router's idea of the current segment back on the pre-save one,
// and the form re-renders against those older props — losing the Staged state
// that turns "Save draft" into "Deploy". A slightly untidy address bar is a much
// better trade than a save that doesn't look like it landed. The cost is that a
// manual reload replays the card.
//
// It sits over a scrim, which is what makes it read as an event rather than page
// furniture. Because that scrim covers the whole screen there are four ways out
// — the timer, the ×, a click anywhere, and Escape — so it can never become
// something to get past.

type Tone = 'success' | 'removed';

const TONE: Record<Tone, { border: string; badge: string; accent: string }> = {
  success: {
    border: 'border-wareongo-green/40',
    badge: 'bg-wareongo-green/10',
    accent: 'text-wareongo-green',
  },
  // A deletion succeeded, but green would read as "all good" about a guide that
  // no longer exists. Sienna says done-and-it-was-a-removal.
  removed: {
    border: 'border-wareongo-sienna/40',
    badge: 'bg-wareongo-sienna/10',
    accent: 'text-wareongo-sienna',
  },
};

/** Shorter than a corner toast would need: this one is in the way while it's up. */
const VISIBLE_MS = 4500;

export default function Toast({
  title,
  detail,
  tone = 'success',
  dismissLabel,
  children,
}: {
  title: string;
  detail?: string;
  tone?: Tone;
  /**
   * Renders a secondary button that just closes the card ("Do it later"). It's a
   * prop rather than something the caller passes as a child because the page
   * rendering this is a server component, and the close handler can't cross that
   * boundary — only the label can.
   */
  dismissLabel?: string;
  /** Optional action (e.g. Deploy) — supplying it cancels the auto-dismiss. */
  children?: React.ReactNode;
}) {
  const [phase, setPhase] = useState<'enter' | 'in' | 'out'>('enter');
  const [gone, setGone] = useState(false);
  // A card holding something to click must not time out underneath the pointer.
  const sticky = Boolean(children) || Boolean(dismissLabel);

  useEffect(() => {
    // Entering on the next frame rather than on mount: the transition only runs
    // if the browser has painted the off-screen state first.
    const raf = requestAnimationFrame(() => setPhase('in'));
    const hide = sticky ? undefined : setTimeout(() => setPhase('out'), VISIBLE_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPhase('out');
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      if (hide) clearTimeout(hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [sticky]);

  if (gone) return null;

  const { border, badge, accent } = TONE[tone];
  const shown = phase === 'in';

  return (
    <div
      onClick={() => setPhase('out')}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${shown ? '' : 'pointer-events-none'}`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-wareongo-blue/25 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        // polite, not assertive: this confirms something the editor just did, so
        // it shouldn't cut across whatever a screen reader is already saying.
        role="status"
        aria-live="polite"
        // The card is the one place a click doesn't dismiss — so the × and any
        // action inside it stay clickable.
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={() => phase === 'out' && setGone(true)}
        className={`relative w-full max-w-sm rounded-3xl border bg-white px-7 py-8 text-center transition-all duration-200 motion-reduce:transition-none ${border} ${
          shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => setPhase('out')}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-lg px-2 py-1 text-lg leading-none text-wareongo-slate transition-colors hover:text-wareongo-blue"
        >
          ×
        </button>

        <span className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${badge}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
            className={`h-7 w-7 ${accent}`}
          >
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <p className="text-lg font-bold text-wareongo-blue">{title}</p>
        {detail && <p className="mt-1.5 text-sm text-wareongo-slate">{detail}</p>}
        {(children || dismissLabel) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {children}
            {dismissLabel && (
              <button type="button" onClick={() => setPhase('out')} className="cms-btn px-4 py-2.5 text-sm">
                {dismissLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
