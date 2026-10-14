import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient, Prisma } from '@prisma/client';
import { harness, form } from './helpers/micromarket-ad.mjs';

// This test never reads a deployed CMS database or loads its .env.
const url = process.env.CMS_TEST_DATABASE_URL;
test('backend migration and CMS actions work together in disposable PostgreSQL', { skip: !url }, async () => {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  assert.equal(parsed.username, 'cms_test');
  assert.equal(parsed.pathname, '/cms_micromarket_ad_test');
  const backend = path.resolve(import.meta.dirname, '../../WareOnGo-Website-Backend');
  const migrate = () => execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--file', 'scripts/sql/20261014_micromarket_ad_pages.sql', '--url', url], { cwd: backend, stdio: 'pipe' });
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    migrate();
    const key = { citySlug: 'bengaluru', slug: 'peenya' };
    await db.micromarketAdPage.deleteMany({ where: key });
    migrate();
    const seed = JSON.parse(fs.readFileSync(path.join(backend, 'data/micromarket-ad-pages/peenya.json'), 'utf8'));
    const row = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: key } });
    assert.deepEqual(row.publishedContent, seed);
    const h = harness({ db: db.micromarketAdPage });
    const draft = structuredClone(seed); draft.area.whereItIs = 'Private Peenya draft.';
    await assert.rejects(h.save(undefined, form({ expectedUpdatedAt: row.updatedAt.toISOString() }, draft)), error => error.location?.endsWith('?saved=draft'));
    migrate(); // A repeated seed must not erase the editor's private revision.
    const saved = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: key } });
    assert.equal(saved.draftContent.area.whereItIs, 'Private Peenya draft.');
    assert.deepEqual(saved.publishedContent, seed);
    const stale = await h.save(undefined, form({ expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }, seed));
    assert.equal(stale.ok, false);
    const security = await db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE relname = 'MicromarketAdPage'`;
    assert.equal(security[0].relrowsecurity, true);

    const market = { citySlug: 'bengaluru', slug: 'cms-test-market', name: 'CMS Test Market', listings: 20 };
    const next = harness({ db: db.micromarketAdPage, inventory: [market] });
    await db.micromarketAdPage.deleteMany({ where: { citySlug: market.citySlug, slug: market.slug } });
    await assert.rejects(next.create(undefined, form({ slug: market.slug })), error => error.location?.endsWith('/cms-test-market'));
    let newRow = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: { citySlug: market.citySlug, slug: market.slug } } });
    assert.equal(newRow.publishedContent, null);
    const incomplete = await next.save(undefined, form({ slug: market.slug, expectedUpdatedAt: newRow.updatedAt.toISOString(), intent: 'publish' }, newRow.draftContent));
    assert.equal(incomplete.ok, false);
    const ready = newRow.draftContent;
    ready.area = { whereItIs: 'Local connections.', whoItSuits: 'Local businesses.' };
    ready.rentGuide = { intro: 'Current rent: {rentRange}.', description: 'Local rent conditions.' };
    ready.mapBylines[0].byline = 'Local warehouses.';
    ready.faqs.forEach(faq => { faq.a = 'Local answer.'; });
    await assert.rejects(next.save(undefined, form({ slug: market.slug, expectedUpdatedAt: newRow.updatedAt.toISOString(), intent: 'publish' }, ready)), error => error.location?.endsWith('?saved=publish'));
    newRow = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: { citySlug: market.citySlug, slug: market.slug } } });
    assert.deepEqual(newRow.publishedContent, ready);
    const approved = await db.micromarketAdPage.findMany({ where: { publishedContent: { not: Prisma.AnyNull } }, select: { publishedContent: true } });
    assert.ok(approved.some(row => row.publishedContent.slug === market.slug));
    assert.ok(!JSON.stringify(approved).includes('Private Peenya draft'));
    await db.micromarketAdPage.deleteMany({ where: { citySlug: market.citySlug, slug: market.slug } });
    await db.micromarketAdPage.update({ where: { citySlug_slug: key }, data: { draftContent: seed } });
  } finally { await db.$disconnect(); }
});
