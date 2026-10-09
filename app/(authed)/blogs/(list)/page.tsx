import Link from '@/components/CmsLink';
import { getBlogSummaries } from '@/lib/content-summaries';
import BlogList from '@/components/BlogList';
import DeployButton from '@/components/DeployButton';
import Toast from '@/components/Toast';
import { isDeployConfigured } from '@/lib/deploy';

// Auth and dynamic rendering both come from app/(authed)/layout.tsx.

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ reordered?: string; reverted?: string; deleted?: string }>;
}) {
  const { reordered, reverted, deleted } = await searchParams;
  const deployable = isDeployConfigured();
  const rows = await getBlogSummaries();
  const live = rows.filter(g => g.state === 'PUBLISHED').length;
  const staged = rows.filter(g => g.state === 'STAGED').length;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="cms-title">Blogs</h1>
          <p className="mt-1 text-sm text-wareongo-slate">
            {rows.length} total · {live} live{staged > 0 ? ` · ${staged} staged` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Whether the hook exists is all the client needs — never the URL. */}
          <DeployButton configured={deployable} />
          <Link href="/blogs/new" className="cms-btn-primary">
            New blog
          </Link>
        </div>
      </header>

      {/* No second line: whether the site still serves the page depends on what
          was last deployed, which this page can't know without reading the
          snapshot column, and a confident wrong sentence is worse than none. */}
      {deleted && <Toast title={`“${deleted}” deleted`} tone="removed" />}

      {reverted && <Toast title="Reverted to the last deployed version" />}

      {/* Stays an inline banner: it holds a Deploy button, and an action that
          fades itself out after six seconds is a trap. */}
      {reordered && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-wareongo-green/30 bg-wareongo-green/5 px-4 py-2.5 text-sm text-wareongo-green">
          <span>Order saved. Deploy to push it live.</span>
          <span className="ml-auto">
            <DeployButton configured={deployable} variant="subtle" />
          </span>
        </div>
      )}

      <BlogList blogs={rows} />
    </main>
  );
}
