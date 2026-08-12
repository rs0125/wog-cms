'use client';

import { useActionState } from 'react';
import Toast from './Toast';
import { toggleGuideListing } from '@/app/(authed)/guides/actions';

// Sits next to Delete, and works the way Delete deliberately doesn't: one click,
// no confirm step. Nothing is destroyed and the same button puts it back, so the
// two-step ceremony would only be in the way.
//
// Unlike Save and Delete this action doesn't redirect — it refreshes the page's
// server props in place, so nothing typed into the form below is lost. That also
// means there's no query param for the confirmation card to key off, so it comes
// from the action's own result instead.
export default function ListingToggle({ id, listed }: { id: number; listed: boolean }) {
  const [result, action, pending] = useActionState(toggleGuideListing, undefined);

  return (
    <>
      <form action={action} className="flex flex-col items-end gap-1">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          title={
            listed
              ? 'Take this guide off wareongo.com — it comes down on the next deploy'
              : 'Put this guide back on wareongo.com — it returns on the next deploy'
          }
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
