// One-time backfill for the deployedContent/deployedAt columns.
//
// Those columns were added after the guides were already live on wareongo.com,
// so every row started with a null snapshot. `stateOf()` reads a null snapshot
// as "never deployed", which made guides that are demonstrably on the site show
// as Staged.
//
// The site was last built from exactly the content now in these rows, so the
// correct starting snapshot is the current content. Run once:
//
//   node scripts/backfill-deployed.mjs
//
// Idempotent: only fills rows whose snapshot is still null, so re-running can't
// clobber a genuinely staged edit.

import pkg from '@next/env';
import { PrismaClient } from '@prisma/client';

pkg.loadEnvConfig(process.cwd(), false);
const prisma = new PrismaClient();

// ⚠️  This duplicates contentOf() in lib/staging.ts, which is the source of
// truth for "what counts as deployed content". A .mjs script can't import the
// .ts module without a build step, so if you add or remove a field there, mirror
// it here — otherwise this script writes a snapshot of the wrong shape and every
// guide reads as Staged.
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

const contentOf = (g) => ({
  slug: g.slug,
  title: g.title,
  seoTitle: g.seoTitle,
  description: g.description,
  summary: g.summary,
  keywords: g.keywords,
  blocks: g.blocks,
  faqs: g.faqs,
  related: g.related,
  datePublished: iso(g.datePublished),
  dateModified: iso(g.dateModified),
  sortOrder: g.sortOrder,
  status: g.status,
});

async function main() {
  // Filtered in JS on purpose: for a nullable Json column Prisma reads
  // `{ equals: null }` as *JSON* null, not SQL NULL, so that filter silently
  // matches nothing. Prisma.DbNull would work; reading 5 rows is simpler.
  const rows = (await prisma.guide.findMany()).filter((g) => g.deployedContent === null);
  if (rows.length === 0) {
    console.log('[backfill] nothing to do — every guide already has a snapshot.');
    return;
  }

  const now = new Date();
  await prisma.$transaction(
    rows.map((g) =>
      prisma.guide.update({ where: { id: g.id }, data: { deployedContent: contentOf(g), deployedAt: now } }),
    ),
  );
  for (const g of rows) console.log(`  snapshotted ${g.slug} (${g.status})`);
  console.log(`[backfill] ${rows.length} guide(s) marked as deployed.`);
}

main()
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
