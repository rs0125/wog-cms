import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { transaction } from '@/lib/agent-cms/repository';
import { reviewAction } from '../actions';
import { z } from 'zod';
export default async function ImportReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  if (
    !z.uuid().safeParse(id).success ||
    process.env.CMS_CONTEXT_ENABLED !== 'true'
  )
    notFound();
  const row = await transaction((repo) => repo.import(id));
  if (!row) notFound();
  const plan = row.payload as {
    changes: Array<{
      ref: string;
      diff: Array<{ field: string; before: unknown; after: unknown }>;
    }>;
  };
  const error = (await searchParams).error;
  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8">
      <Link className="mb-4 inline-block underline" href="/imports">
        Content imports
      </Link>
      <h1 className="cms-title">Review content import</h1>
      <p className="my-4 break-words">
        {row.state} · Submitted by {row.actor}
      </p>
      {error && (
        <p role="alert" className="my-4 text-red-700">
          {error}
        </p>
      )}
      <p className="my-4">
        These are the exact changes in this import. Approval makes this content
        eligible for the next website build. It does not start a build.
      </p>
      {plan.changes.map((change) => (
        <section key={change.ref} className="my-8">
          <h2 className="ui-panel-title break-words">{change.ref}</h2>
          {change.diff.map((diff) => (
            <div key={diff.field} className="cms-card my-4 p-4">
              <h3 className="cms-label mb-3">{diff.field}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="min-w-0">
                  <h4 className="cms-label mb-2">Before</h4>
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {typeof diff.before === 'string'
                      ? diff.before
                      : JSON.stringify(diff.before, null, 2)}
                  </pre>
                </div>
                <div className="min-w-0">
                  <h4 className="cms-label mb-2">After</h4>
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {typeof diff.after === 'string'
                      ? diff.after
                      : JSON.stringify(diff.after, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
      {row.state === 'PREPARED' && (
        <p>Preview only. The connected client has not saved these drafts.</p>
      )}
      {row.state === 'DRAFT' && (
        <form action={reviewAction} className="flex flex-wrap gap-4">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="hash" value={row.hash} />
          <button
            className="cms-btn min-h-12 bg-wareongo-purple px-4 text-white"
            name="intent"
            value="approve"
          >
            Approve for next build
          </button>
          <button className="cms-btn border px-4" name="intent" value="discard">
            Discard import drafts
          </button>
        </form>
      )}
    </main>
  );
}
