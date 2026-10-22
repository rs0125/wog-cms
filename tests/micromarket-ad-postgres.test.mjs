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
  const migrate = (file = '20261014_micromarket_ad_pages.sql') => execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--file', 'scripts/sql/' + file, '--url', url], { cwd: backend, stdio: 'pipe' });
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    migrate();
    // The 14 October area migration restores its Hosur-only constraint, so no Hyderabad row may survive an earlier run.
    await db.micromarketAdPage.deleteMany({ where: { OR: [{ citySlug: 'hyderabad' }, { citySlug: 'bengaluru', slug: 'sheds' }] } });
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

    migrate('20261014_area_ad_pages.sql');
    for (const [citySlug, slug] of [['bengaluru', 'hoskote'], ['bengaluru', 'nelamangala'], ['bengaluru', 'electronic-city-jigani-bommasandra'], ['hosur', 'hosur']]) {
      const identity = { citySlug, slug };
      const areaSeed = JSON.parse(fs.readFileSync(path.join(backend, 'data/micromarket-ad-pages', slug + '.json'), 'utf8'));
      const area = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: identity } });
      assert.deepEqual(area.draftContent, areaSeed);
      assert.equal(area.publishedContent, null, slug + ' starts private');
      const privateCopy = structuredClone(areaSeed); privateCopy.area.whereItIs = 'Private area revision.';
      const areaActions = harness({ db: db.micromarketAdPage });
      await assert.rejects(areaActions.save(undefined, form({ ...identity, expectedUpdatedAt: area.updatedAt.toISOString() }, privateCopy)), error => error.location?.endsWith('?saved=draft'));
      migrate('20261014_area_ad_pages.sql');
      const revised = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: identity } });
      assert.deepEqual(revised.draftContent, privateCopy);
      assert.equal(revised.publishedContent, null);
      if (citySlug === 'hosur') {
        await assert.rejects(areaActions.save(undefined, form({ ...identity, expectedUpdatedAt: revised.updatedAt.toISOString(), intent: 'publish' }, areaSeed)), error => error.location?.endsWith('?saved=publish'));
        const approvedArea = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: identity } });
        assert.deepEqual(approvedArea.publishedContent, areaSeed);
      }
      // Keep this isolated fixture repeatable; no deployed database is used.
      await db.micromarketAdPage.update({ where: { citySlug_slug: identity }, data: { draftContent: areaSeed, publishedContent: Prisma.DbNull } });
    }
    migrate('20261022_hyderabad_sheds_ad_pages.sql');
    for (const [citySlug, slug] of [['hyderabad', 'hyderabad'], ['bengaluru', 'sheds']]) {
      const identity = { citySlug, slug };
      const pageSeed = JSON.parse(fs.readFileSync(path.join(backend, 'data/micromarket-ad-pages', slug + '.json'), 'utf8'));
      const page = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: identity } });
      assert.deepEqual(page.draftContent, pageSeed);
      assert.equal(page.publishedContent, null, slug + ' starts private');
      const actions = harness({ db: db.micromarketAdPage });
      const privateCopy = structuredClone(pageSeed); privateCopy.area.whereItIs = 'Private revision.';
      await assert.rejects(actions.save(undefined, form({ ...identity, expectedUpdatedAt: page.updatedAt.toISOString() }, privateCopy)), error => error.location?.endsWith('?saved=draft'));
      migrate('20261022_hyderabad_sheds_ad_pages.sql'); // A repeated seed keeps the private revision.
      const revised = await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: identity } });
      assert.deepEqual(revised.draftContent, privateCopy);
      assert.equal(revised.publishedContent, null);
      // The CMS action approves the single-card / sectioned shape as stored.
      await assert.rejects(actions.save(undefined, form({ ...identity, expectedUpdatedAt: revised.updatedAt.toISOString(), intent: 'publish' }, pageSeed)), error => error.location?.endsWith('?saved=publish'));
      migrate('20261022_hyderabad_sheds_ad_pages.sql'); // A repeated seed keeps the approval.
      assert.deepEqual((await db.micromarketAdPage.findUniqueOrThrow({ where: { citySlug_slug: identity } })).publishedContent, pageSeed);
    }
    await assert.rejects(db.micromarketAdPage.create({ data: { citySlug: 'hyderabad', slug: 'kompally', name: 'Invalid', draftContent: seed } }), /constraint/);
    await assert.rejects(db.micromarketAdPage.create({ data: { citySlug: 'hosur', slug: 'invalid-neighbor', name: 'Invalid', draftContent: seed } }), /constraint/);
    await assert.rejects(db.micromarketAdPage.create({ data: { citySlug: 'delhi', slug: 'invalid-city', name: 'Invalid', draftContent: seed } }), /constraint/);

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
