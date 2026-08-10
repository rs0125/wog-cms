'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerSiteBuild } from '@/app/(authed)/guides/actions';

/**
 * Deploys the live site, behind a confirmation modal.
 *
 * Saving only writes to the database — nothing reaches wareongo.com until a
 * build runs. This is that build, and it's the one outward-facing action in the
 * CMS: it republishes production and the build notifies search engines. Hence
 * the modal.
 *
 * The action is invoked directly rather than through a <form>. This component
 * renders inside the guide form's footer, and a nested <form> is invalid HTML —
 * React reports it as a hydration error.
 *
 * Uses a native <dialog> so focus trapping, Escape-to-close and the backdrop
 * come from the platform instead of being reimplemented.
 */
export default function DeployButton({
  configured,
  variant = 'default',
}: {
  configured: boolean;
  /** `subtle` sits inside a banner; `default` is a standalone primary button. */
  variant?: 'default' | 'subtle';
}) {
  const [result, setResult] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  if (!configured) return null;

  const ok = result !== undefined && result.startsWith('ok:');
  const message = result === undefined ? undefined : ok ? result.slice(3) : result;

  const deploy = () => {
    startTransition(async () => {
      const r = await triggerSiteBuild();
      setResult(r);
      // Close once there's an outcome, so it shows in the page rather than
      // inside a modal the user then has to dismiss.
      dialog.current?.close();
      // A successful deploy just advanced every guide's snapshot, which clears
      // the Staged badges. Without this the page would keep showing the state
      // from before the deploy until a manual reload.
      if (r?.startsWith('ok:')) router.refresh();
    });
  };

  if (message) {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
          ok
            ? 'border-wareongo-green/30 bg-wareongo-green/5 text-wareongo-green'
            : 'border-wareongo-sienna/30 bg-wareongo-sienna/5 text-wareongo-sienna'
        }`}
      >
        {message}
        {/* Dismissable so the control comes back — otherwise a second deploy
            would need a page reload. */}
        <button
          type="button"
          onClick={() => setResult(undefined)}
          aria-label="Dismiss"
          className="font-semibold opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={variant === 'subtle' ? 'cms-btn' : 'cms-btn-primary'}
      >
        Deploy
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-wareongo-blue/20 bg-white p-0 backdrop:bg-wareongo-blue/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <h2 className="cms-title mb-2 text-xl">Deploy to production?</h2>
          <p className="mb-1 text-sm text-wareongo-slate">
            This starts a production build of <strong className="text-wareongo-charcoal">wareongo.com</strong> and
            publishes every saved change that is marked Published.
          </p>
          <p className="mb-6 text-sm text-wareongo-slate">
            The build takes a few minutes and notifies search engines when it finishes.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="cms-btn px-4 py-2.5 text-sm">
              Cancel
            </button>
            <button type="button" onClick={deploy} disabled={pending} className="cms-btn-primary">
              {pending ? 'Deploying…' : 'Deploy'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
