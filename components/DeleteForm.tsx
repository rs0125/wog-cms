'use client';

import { useActionState, useState } from 'react';

// Two-step delete: the button reveals a field where the slug has to be typed
// back. There is no version history behind this, so a single misclick would be
// unrecoverable. The server re-checks the typed slug regardless of what this
// form sends.
//
// The action is a prop so blogs and micromarket pages share the ceremony rather
// than each growing their own copy of it.
export default function DeleteForm({
  id,
  slug,
  action,
  consequence,
}: {
  id: number;
  slug: string;
  action: (prev: string | undefined, formData: FormData) => Promise<string | undefined>;
  /**
   * One line on what actually happens to the live URL. It differs by section:
   * deleting a blog removes a page, deleting a micromarket page reverts one to
   * its listing grid — and the editor should know which before typing the slug.
   */
  consequence?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, formAction, pending] = useActionState(action, undefined);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="cms-btn-danger px-4 py-2.5 text-sm">
        Delete
      </button>
    );
  }

  return (
    <form action={formAction} className="rounded-2xl border border-wareongo-sienna/30 bg-wareongo-sienna/5 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="mb-2 text-xs text-wareongo-charcoal">
        This cannot be undone. Type <code className="font-semibold">{slug}</code> to confirm.
      </p>
      {consequence && <p className="mb-2 text-xs text-wareongo-slate">{consequence}</p>}
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
