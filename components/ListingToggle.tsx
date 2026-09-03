'use client';

import { useActionState } from 'react';
import Toast from './Toast';
import type { ListingResult } from '@/lib/action-results';

// Sits next to Delete, and works the way Delete deliberately doesn't: one click,
// no confirm step. Nothing is destroyed and the same button puts it back, so the
// two-step ceremony would only be in the way.
//
// Unlike Save and Delete this action doesn't redirect — it refreshes the page's
// server props in place, so nothing typed into the form below is lost. That also
// means there's no query param for the confirmation card to key off, so it comes
// from the action's own result instead.
//
// The action arrives as a prop rather than being imported: blogs and micromarket
// pages flip the same column for the same reason, and only the row differs.
export default function ListingToggle({
  id,
  listed,
  action,
  listedHint,
  delistedHint,
}: {
  id: number;
  listed: boolean;
  action: (prev: ListingResult | undefined, formData: FormData) => Promise<ListingResult>;
  /** Tooltip while listed — what Delist will do. */
  listedHint: string;
  /** Tooltip while delisted — what List will do. */
  delistedHint: string;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);

  return (
    <>
      <form action={formAction} className="flex flex-col items-end gap-1">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          title={listed ? listedHint : delistedHint}
          className="cms-btn px-4 py-2.5 text-sm"
        >
          {pending ? (listed ? 'Delisting…' : 'Listing…') : listed ? 'Delist' : 'List'}
        </button>
        {result && !result.ok && <p className="max-w-xs text-right text-xs text-wareongo-sienna">{result.error}</p>}
      </form>

      {/* Keyed on the timestamp so toggling back and forth shows a card each
          time, rather than reconciling onto the one already dismissed. */}
      {result && result.ok && (
        <Toast
          key={result.at}
          title={result.listed ? 'Listed' : 'Delisted'}
          detail="Takes effect on the next deploy."
          tone={result.listed ? 'success' : 'removed'}
        />
      )}
    </>
  );
}
