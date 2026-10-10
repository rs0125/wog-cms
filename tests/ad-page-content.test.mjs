import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAdPage } from '../lib/ad-page-content.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const page = read('../content/ad-pages/bangalore.json');
const legacy = read('./fixtures/bangalore-v1.json');

test('version 1 gains current guides and mobile copy without changing saved revisions', () => {
  const old = structuredClone(legacy);
  old.benefits = old.benefits.slice(0, 3);
  old.benefits[0].title = 'My custom benefit';
  old.benefits[0].body = 'My custom supporting copy';
  old.services[0].title = 'My custom service';
  old.copy.heroHeading = 'My custom hero';
  const before = structuredClone(old);
  const result = parseAdPage(old);
  assert.equal(result.version, 2);
  assert.equal(result.copy.heroHeading, old.copy.heroHeading);
  assert.equal(result.benefits.find(item => item.id === old.benefits[0].id).title, 'My custom benefit');
  assert.equal(result.services[0].title, 'My custom service');
  assert.equal(result.benefits.length, 6);
  assert.deepEqual(result.areaGroups, page.areaGroups);
  assert.deepEqual(result.rentGuide, page.rentGuide);
  assert.deepEqual(result.faqs, page.faqs);
  assert.equal(result.services[0].mobileTitle, page.services[0].mobileTitle);
  for (const key of ['heroSteps', 'areaRows', 'overviewParagraphs', 'overviewStats']) assert.equal(key in result, false);
  assert.equal('statsHeading' in result.copy, false);
  assert.equal('why' in result.images, false);
  assert.deepEqual(old, before);
  assert.deepEqual(parseAdPage(result), result, 'migration must be idempotent');
});

test('current edits survive even when they match historical default strings', () => {
  const current = structuredClone(page);
  current.copy.heroAccent = 'in Bangalore.';
  current.copy.whyHeading = 'Why choose WareOnGo';
  current.services[0].title = 'Find a warehouse';
  current.services[0].mobileTitle = 'My mobile title';
  current.benefits[0].title = 'Local expertise';
  current.areaGroups[0].rows[0].areas = 'My approved areas';
  current.rentGuide.rows[0].rent = '₹20 to ₹30';
  current.faqs[0].a = 'My approved answer';
  assert.deepEqual(parseAdPage(current), current);
});

for (const [label, edit] of [
  ['mobile service copy', p => { p.services[0].mobileBody = ''; }],
  ['area group title', p => { p.areaGroups[0].title = ''; }],
  ['area rows', p => { p.areaGroups[0].rows = []; }],
  ['suggested areas', p => { p.areaGroups[0].rows[0].areas = ''; }],
  ['rent rows', p => { p.rentGuide.rows = []; }],
  ['rent prose', p => { p.rentGuide.description = ''; }],
  ['rent range', p => { p.rentGuide.rows[0].rent = ''; }],
  ['FAQs', p => { p.faqs = []; }],
  ['FAQ answer', p => { p.faqs[0].a = ''; }],
]) test(`unfinished ${label} can be drafted but not approved`, () => {
  const draft = structuredClone(page); edit(draft);
  assert.deepEqual(parseAdPage(draft, { draft: true }), draft);
  assert.throws(() => parseAdPage(draft));
});

for (const [label, edit] of [
  ['version', p => { p.version = 3; }],
  ['missing section', p => { delete p.rentGuide; }],
  ['duplicate identity', p => { p.services[0].id = p.services[1].id; }],
  ['wrong area scope', p => { p.areaGroups[0].scope = 'city'; }],
  ['missing area group', p => { p.areaGroups.pop(); }],
  ['too many rows', p => { p.rentGuide.rows = Array(31).fill(p.rentGuide.rows[0]); }],
  ['unsafe image', p => { p.images.services.url = 'javascript:alert(1)'; }],
]) test(`reject malformed ${label} even in drafts`, () => {
  const invalid = structuredClone(page); edit(invalid);
  assert.throws(() => parseAdPage(invalid, { draft: true }));
});
