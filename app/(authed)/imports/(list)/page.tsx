import Link from '@/components/CmsLink';
import { requireUser } from '@/lib/auth';
import { transaction } from '@/lib/agent-cms/repository';
export default async function Imports() {
  await requireUser();
  if (process.env.CMS_CONTEXT_ENABLED !== 'true')
    return (
      <main className="p-4 md:p-8">
        <h1 className="cms-title">Content imports</h1>
        <p>Content imports are not enabled.</p>
      </main>
    );
  const rows = await transaction((repo) => repo.queue());
  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="cms-title">Content imports</h1>
      <p className="my-4">
        Review imported drafts before approving them for a website build.
        Nothing in this queue is published.
      </p>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li className="cms-card break-words p-4" key={row.id}>
            <Link
              className="font-semibold underline"
              href={`/imports/${row.id}`}
            >
              {row.page_count} {row.page_type}{' '}
              {row.page_count === 1 ? 'page' : 'pages'}
            </Link>
            <p className="mt-2 text-sm">
              {row.actor} ·{' '}
              {row.created_at.toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })}{' '}
              IST
            </p>
          </li>
        ))}
      </ul>
      {rows.length === 100 && (
        <p className="my-4">Showing the latest 100 imports awaiting review.</p>
      )}
      {!rows.length && <p>No imports awaiting review.</p>}
    </main>
  );
}
