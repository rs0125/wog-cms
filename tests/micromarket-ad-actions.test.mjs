import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMicromarketAdPage, MICROMARKET_AD_SCHEMA, createMicromarketAdTemplate } from '../lib/micromarket-ad-content.mjs';

import { harness, form } from './helpers/micromarket-ad.mjs';
const root = path.resolve(import.meta.dirname, '..');
const content = JSON.parse(fs.readFileSync(path.join(root, 'content/micromarket-ad-pages/peenya.json'), 'utf8'));
const stamp = '2026-10-14T00:00:00.000Z';
const saved = intent => error => error.location === `/ad-pages/micromarkets/bengaluru/peenya?saved=${intent}`;
test('every direct action and schema download requires an authenticated CMS session', async () => {
  const h = harness({ denied: true });
  for (const action of [h.save, h.create]) await assert.rejects(action(undefined, form()), /unauthenticated/);
  await assert.rejects(h.schema.GET(), /unauthenticated/);
  assert.equal(h.writes.length, 0);
});
test('creation uses the exact inventory identity and stores only a private draft', async () => {
  const h = harness();
  await assert.rejects(h.create(undefined, form({}, { name: 'Forged name' })), error => error.location === '/ad-pages/micromarkets/bengaluru/peenya');
  const args = h.writes[0];
  assert.equal(args.create.name, 'Peenya');
  assert.equal(args.create.publishedContent, undefined);
  assert.equal(args.create.draftContent.area.whereItIs, '');
  assert.equal(JSON.stringify(args.update), '{}');
});
test('creation refuses missing inventory, wrong cities and unsafe slugs', async () => {
  for (const options of [{ inventory: [] }, { inventory: [{ citySlug: 'mumbai', slug: 'peenya', name: 'Peenya', listings: 62 }] }, { inventory: [{ citySlug: 'bengaluru', slug: 'peenya', name: 'Peenya', listings: 0 }] }]) {
    const h = harness(options); assert.equal((await h.create(undefined, form())).ok, false); assert.equal(h.writes.length, 0);
  }
  assert.equal((await harness().create(undefined, form({ slug: '../peenya' }))).ok, false);
});
test('incomplete private copy cannot replace the approved public revision', async () => {
  const page = structuredClone(content); page.area.whereItIs = '';
  const h = harness();
  await assert.rejects(h.save(undefined, form({}, page)), saved('draft'));
  assert.equal(h.writes[0].data.publishedContent, undefined);
  assert.equal(h.writes[0].where.updatedAt.toISOString(), stamp);
  assert.equal((await h.save(undefined, form({ intent: 'publish' }, page))).ok, false);
  assert.equal(h.writes.length, 1);
});
test('approval stores exactly the complete local-copy schema', async () => {
  const h = harness(); await assert.rejects(h.save(undefined, form({ intent: 'publish' })), saved('publish'));
  assert.deepEqual(h.writes[0].data.draftContent, content);
  assert.deepEqual(h.writes[0].data.publishedContent, content);
});
test('tampered shared fields and identity changes are rejected before any writes', async () => {
  for (const change of [p => { p.copy.enquiryNote = 'Changed callback'; }, p => { p.services = []; }, p => { p.map = {}; }, p => { p.heroSummary = 'Fake count'; }, p => { p.name = 'Other market'; }, p => { p.slug = 'other-market'; }, p => { p.copy.heroHeading = '<script>alert(1)</script>'; }, p => { p.area.whereItIs = '{unknown}'; }]) {
    const page = structuredClone(content); change(page); const h = harness();
    assert.equal((await h.save(undefined, form({}, page))).ok, false); assert.equal(h.writes.length, 0);
  }
});
test('conflicts preserve newer edits but a matching lost-response retry is acknowledged', async () => {
  const h = harness({ count: 0 }); assert.match((await h.save(undefined, form())).error, /changed after/);
  for (const intent of ['draft', 'publish']) {
    const retry = harness({ count: 0, current: { draftContent: content, publishedContent: content } });
    await assert.rejects(retry.save(undefined, form({ intent })), saved(intent)); assert.equal(retry.writes.length, 1);
  }
  const stale = harness({ count: 0, current: { draftContent: content, publishedContent: {} } });
  assert.match((await stale.save(undefined, form({ intent: 'publish' }))).error, /changed after/);
});
test('database failures retain edits and never leak connection information', async () => {
  const result = await harness({ failure: true }).save(undefined, form());
  assert.match(result.error, /edits are still here/); assert.doesNotMatch(result.error, /private database/);
});
test('general schema supports a new inventory market and requires its local prose before approval', () => {
  const page = createMicromarketAdTemplate({ citySlug: 'bengaluru', slug: 'hoskote', name: 'Hoskote' });
  assert.equal(page.slug, 'hoskote'); assert.equal(page.copy.heroHeading, 'Warehouses for Rent');
  assert.throws(() => parseMicromarketAdPage(page), /add text/);
  page.area = { whereItIs: 'Local connectivity.', whoItSuits: 'Local businesses.' };
  page.rentGuide = { intro: 'From {rentRange}.', description: 'Local rent explanation.' };
  page.mapBylines[0].byline = 'Local warehouses.';
  page.faqs.forEach(faq => { faq.a = 'Local answer.'; });
  assert.deepEqual(parseMicromarketAdPage(page), page);
  assert.equal(MICROMARKET_AD_SCHEMA.additionalProperties, false);
});
test('the CMS, backend and website validators and Peenya seed agree', () => {
  const source = fs.readFileSync(path.join(root, 'lib/micromarket-ad-content.mjs'), 'utf8');
  for (const file of ['../WareOnGo-Website-Backend/services/micromarketAdContent.js', '../wareongo-website/scripts/lib/micromarket-ad-content.mjs']) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), source);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '../WareOnGo-Website-Backend/data/micromarket-ad-pages/peenya.json'), 'utf8')), content);
});
