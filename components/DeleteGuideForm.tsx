'use client';

import { useActionState, useState } from 'react';
import { deleteGuide } from '@/app/(authed)/guides/actions';

// Two-step delete: the button reveals a field where the slug has to be typed
// back. There is no version history behind this, so a single misclick would be
// unrecoverable. The server re-checks the typed slug regardless of what this
// form sends.
export default function DeleteGuideForm({ id, slug }: { id: number; slug: string }) {
  const [armed, setArmed] = useState(false);
  const [error, action, pending] = useActionState(deleteGuide, undefined);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="cms-btn-danger px-4 py-2.5 text-sm">
        Delete
      </button>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-wareongo-sienna/30 bg-wareongo-sienna/5 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="mb-2 text-xs text-wareongo-charcoal">
        This cannot be undone. Type <code className="font-semibold">{slug}</code> to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="confirmSlug" autoFocus placeholder={slug} className="cms-input max-w-xs py-2 text-sm" />
        <button type="submit" disabled={pending} className="cms-btn-danger px-4 py-2.5 text-sm">
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button type="button" onClick={() => setArmed(false)} className="cms-btn px-4 py-2.5 text-sm">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-wareongo-sienna">{error}</p>}
    </form>
  );
}
