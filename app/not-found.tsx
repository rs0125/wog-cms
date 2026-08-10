import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <span className="cms-eyebrow mb-2 block">404</span>
      <h1 className="font-display mb-3 text-3xl text-wareongo-blue">Not found</h1>
      <p className="mb-6 text-sm text-wareongo-slate">
        That guide may have been deleted, or the URL is wrong.
      </p>
      <Link href="/guides" className="cms-btn-primary">
        Back to guides
      </Link>
    </main>
  );
}
