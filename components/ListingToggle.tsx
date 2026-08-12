'use client';

import { useActionState } from 'react';
import { toggleGuideListing } from '@/app/(authed)/guides/actions';

// Sits next to Delete, and works the way Delete deliberately doesn't: one click,
// no confirm step. Nothing is destroyed and the same button puts it back, so the
// two-step ceremony would only be in the way.
//
// The label flipping is the confirmation — the action refreshes this page's
// server props in place, so Delist becomes List without a navigation and without
// touching anything typed into the form below.
export default function ListingToggle({ id, listed }: { id: number; listed: boolean }) {
  const [error, action, pending] = useActionState(toggleGuideListing, undefined);

  return (
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
      {error && <p className="max-w-xs text-right text-xs text-wareongo-sienna">{error}</p>}
    </form>
  );
}
