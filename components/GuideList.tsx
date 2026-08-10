'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { reorderGuides, revertGuide } from '@/app/(authed)/guides/actions';
import { STATE_CLASS, STATE_HINT, STATE_LABEL, type GuideState } from '@/lib/staging';

export type GuideRow = {
  id: number;
  slug: string;
  title: string;
  /** Draft / Published / Staged — Staged means saved but not yet deployed. */
  state: GuideState;
  /** False when the guide has never been deployed, so there's nothing to revert to. */
  revertable: boolean;
  /** Pre-formatted YYYY-MM-DD — Dates don't cross the server/client boundary. */
  dateModified: string;
  sortOrder: number;
};

const EASE = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
/** Matches the `space-y-2.5` gap between rows (0.625rem). */
const GAP_PX = 10;

/**
 * Drag to reorder.
 *
 * The DOM order is deliberately left alone until the pointer is released.
 * Reordering during the drag moves rows out from under the cursor, which fires
 * fresh dragenter events and reorders again — a feedback loop that reads as
 * flicker. Instead the rows between the source and target are shifted by one
 * row-height with a CSS transform, so the layout never changes mid-drag and each
 * row has exactly one thing animating it.
 *
 * Nothing is written until "Save new order" is pressed.
 */
export default function GuideList({ guides }: { guides: GuideRow[] }) {
  const [order, setOrder] = useState<GuideRow[]>(guides);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // One render after a drop, transitions are suppressed: the row has moved in
  // the DOM *and* lost its transform in the same commit, so animating between
  // those two states would show a jump.
  const [committing, setCommitting] = useState(false);
  const [error, saveAction, saving] = useActionState(reorderGuides, undefined);

  /** Row height + gap, measured when a drag starts. */
  const [step, setStep] = useState(0);

  const dragging = dragIndex !== null;
  const dirty = !dragging && order.map((g) => g.id).join(',') !== guides.map((g) => g.id).join(',');
  const hasTies = guides.map((g) => g.sortOrder).some((n, i, all) => all.indexOf(n) !== i);

  useEffect(() => {
    if (!committing) return;
    const raf = requestAnimationFrame(() => setCommitting(false));
    return () => cancelAnimationFrame(raf);
  }, [committing]);

  /** How far row `i` slides to make room for the dragged row. */
  const shiftFor = (i: number) => {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex || i === dragIndex) return 0;
    if (dragIndex < overIndex && i > dragIndex && i <= overIndex) return -step;
    if (dragIndex > overIndex && i >= overIndex && i < dragIndex) return step;
    return 0;
  };

  const start = (i: number, el: HTMLLIElement) => {
    setStep(el.offsetHeight + GAP_PX);
    setDragIndex(i);
    setOverIndex(i);
  };

  const commit = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const next = [...order];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(overIndex, 0, moved);
      setCommitting(true);
      setOrder(next);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <>
      <ul className="space-y-2.5">
        {order.map((g, i) => {
          const shift = shiftFor(i);
          const isDragged = i === dragIndex;
          return (
            <li
              key={g.id}
              draggable
              onDragStart={(e) => start(i, e.currentTarget)}
              onDragOver={(e) => {
                // preventDefault marks this a valid drop target; without it the
                // browser refuses the drop and fires no dragover updates.
                e.preventDefault();
                if (dragging && i !== overIndex) setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                commit();
              }}
              onDragEnd={commit}
              style={{
                transform: shift ? `translateY(${shift}px)` : undefined,
                transition: committing ? 'none' : EASE,
              }}
              className={`flex items-center gap-3 rounded-2xl border bg-white p-4 ${
                isDragged
                  ? 'border-wareongo-blue opacity-40'
                  : 'border-wareongo-blue/20 hover:bg-wareongo-blue/5'
              }`}
            >
              <span
                aria-hidden="true"
                title="Drag to reorder"
                className="cursor-grab select-none px-1 text-wareongo-slate/60 active:cursor-grabbing"
              >
                ⠿
              </span>

              <span className="w-5 shrink-0 text-xs text-wareongo-slate">{i + 1}</span>

              {/* draggable={false} so dragging a row doesn't become a link drag. */}
              <Link href={`/guides/${g.id}`} draggable={false} className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-wareongo-blue">{g.title}</span>
                <span className="block truncate text-xs text-wareongo-slate">
                  /guides/{g.slug} · updated {g.dateModified}
                </span>
              </Link>

              <span
                title={STATE_HINT[g.state]}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${STATE_CLASS[g.state]}`}
              >
                {STATE_LABEL[g.state]}
              </span>

              {/* Only offered where it means something: staged edits sitting on
                  top of a snapshot we can put back. */}
              {g.state === 'STAGED' && g.revertable && <ResetGuide id={g.id} />}
            </li>
          );
        })}
      </ul>

      {hasTies && !dirty && (
        <p className="mt-4 rounded-2xl border border-wareongo-sienna/30 bg-wareongo-sienna/5 p-4 text-xs text-wareongo-sienna">
          Two or more guides share the same stored sort order, so their sequence falls back to creation order. Drag them
          into the order you want and save to fix it for good.
        </p>
      )}

      {dirty && (
        <form
          action={saveAction}
          className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-wareongo-blue/25 bg-white/95 p-4 backdrop-blur"
        >
          <input type="hidden" name="ids" value={JSON.stringify(order.map((g) => g.id))} />
          <p className="text-sm text-wareongo-charcoal">Order changed.</p>
          {error && <p className="text-sm text-wareongo-sienna">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setOrder(guides)} className="cms-btn px-4 py-2.5 text-sm">
              Reset
            </button>
            <button type="submit" disabled={saving} className="cms-btn-primary">
              {saving ? 'Saving…' : 'Save new order'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}


/** Discards a guide's staged edits, restoring the last deployed version. */
function ResetGuide({ id }: { id: number }) {
  const [armed, setArmed] = useState(false);
  const [error, action, pending] = useActionState(revertGuide, undefined);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title="Discard the unpublished edits and restore the version that is live"
        className="cms-btn shrink-0"
      >
        Reset
      </button>
    );
  }

  return (
    <form action={action} className="flex shrink-0 items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <span className="text-[11px] text-wareongo-slate">Discard edits?</span>
      <button type="submit" disabled={pending} className="cms-btn-danger">
        {pending ? '…' : 'Reset'}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="cms-btn">
        No
      </button>
      {error && <span className="text-[11px] text-wareongo-sienna">{error}</span>}
    </form>
  );
}
