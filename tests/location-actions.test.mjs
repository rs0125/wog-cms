import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const page = { kind: 'CITY', slug: 'bengaluru', name: 'Bengaluru', seoTitle: 'Bengaluru overview', metaDescription: 'Warehouse guide',
  h1: 'Warehouse for rent in Bengaluru', heroEyebrow: null, heroProse: 'A city introduction.', heroImage: null,
  marketHeading: null, marketProse: null, marketImage: null, rentsHeading: null, rentsProse: null,
  specHeading: null, specProse: null, inventoryHeading: null, corridorHeading: 'The corridors', corridorProse: 'Compare **locations**.',
  complianceHeading: 'Local approvals', complianceProse: 'Check the property documents.', faqs: [], relatedBlogs: [], statOverrides: null, status: 'PUBLISHED' };

function harness({ denied = false, count = 1, stored = page } = {}) {
  const writes = [];
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(compiled, { exports, module: { exports }, Date, Object, Error, console, process,
      require(id) {
        if (id === 'zod' || id === '@prisma/client') return require(id);
        if (id === 'next/navigation') return { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } };
        if (id === 'next/cache') return { refresh() {} };
        if (id === '@/lib/auth') return { requireUser: async () => { if (denied) throw new Error('unauthenticated'); } };
        if (id === '@/lib/locations-api') return { fetchLocations: async () => [], listFor: x => x, findLocation: () => page, locationOverviewPath: () => '/overview/karnataka/bengaluru' };
        if (id === '@/lib/prisma') return { prisma: { blog: { findMany: async () => [] }, locationPage: {
          findUnique: async () => stored,
          create: async args => { writes.push(args); return { id: 1 }; },
          update: async args => { writes.push(args); return {}; },
          updateMany: async args => { writes.push(args); return { count }; },
        } } };
        if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
        if (id.startsWith('./')) return load(path.join(path.dirname(file), id.slice(2) + '.ts'));
        throw new Error(`Unexpected import: ${id}`);
      },
    }, { filename: file });
    return exports;
  }
  return { writes, actions: load('app/(authed)/locations/actions.ts'), staging: load('lib/location-staging.ts'), schema: load('lib/location-schema.ts').locationSchema,
    overview: load('lib/state-overview.ts'), noOverrides: load('lib/editorial-schema.ts').NO_OVERRIDES };
}
const form = (extra = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...page, id: 1, expectedUpdatedAt: '2026-09-22T00:00:00.000Z', ...extra })) {
    data.set(key, value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return data;
};
const redirected = error => error.location?.startsWith('/locations');
// Objects built inside the VM have their own prototypes; compare their JSON.
const plain = value => JSON.parse(JSON.stringify(value));
const state = { ...page, kind: 'STATE', slug: 'karnataka', corridorHeading: null, corridorProse: null, citiesHeading: 'Cities with stock' };
/** What contentOf() wrote for a state before compliance and cities existed. */
const legacyStateSnapshot = h => {
  const snapshot = h.staging.contentOf(state);
  for (const field of ['complianceHeading', 'complianceProse', 'citiesHeading', 'stateCities']) delete snapshot[field];
  return snapshot;
};
const { Prisma } = require('@prisma/client');
const photo = { url: 'https://images.example.test/mysuru.webp', alt: 'Mysuru warehouse', width: 1600, height: 900 };
const cityList = [
  { name: ' Mysore ', slug: 'mysuru', image: photo },
  { name: 'Hosapete', slug: null, image: null },
  { name: 'Bengaluru', slug: 'bengaluru' },
];

test('city fields survive create and update, including emphasis and clearing', async () => {
  const h = harness();
  await assert.rejects(h.actions.createLocation(undefined, form()), redirected);
  assert.equal(h.writes[0].data.corridorProse, page.corridorProse);
  assert.equal(h.writes[0].data.complianceHeading, page.complianceHeading);
  await assert.rejects(h.actions.updateLocation(undefined, form({ corridorProse: '', complianceProse: 'Updated guidance.' })), redirected);
  assert.equal(h.writes[1].data.corridorProse, null);
  assert.equal(h.writes[1].data.complianceProse, 'Updated guidance.');
  assert.equal(h.writes[1].where.updatedAt.toISOString(), '2026-09-22T00:00:00.000Z');
});

test('state saves keep compliance and the cities heading but cannot acquire corridor copy', async () => {
  const h = harness({ stored: { ...page, kind: 'STATE' } });
  await assert.rejects(h.actions.updateLocation(undefined, form({ kind: 'STATE', citiesHeading: 'Cities with stock' })), redirected);
  for (const field of ['corridorHeading', 'corridorProse']) assert.equal(h.writes[0].data[field], null);
  assert.equal(h.writes[0].data.complianceHeading, page.complianceHeading);
  assert.equal(h.writes[0].data.complianceProse, page.complianceProse);
  assert.equal(h.writes[0].data.citiesHeading, 'Cities with stock');
  await assert.rejects(h.actions.updateLocation(undefined, form({ kind: 'STATE', citiesHeading: '', complianceProse: '' })), redirected);
  assert.equal(h.writes[1].data.citiesHeading, null);
  assert.equal(h.writes[1].data.complianceProse, null);
});

test('city saves keep corridor copy but cannot acquire the cities heading', async () => {
  const h = harness();
  await assert.rejects(h.actions.updateLocation(undefined, form({ citiesHeading: 'Cities with stock' })), redirected);
  assert.equal(h.writes[0].data.citiesHeading, null);
  assert.equal(h.writes[0].data.corridorProse, page.corridorProse);
});

test('old content and old deployed snapshots remain compatible until a real city edit', () => {
  const h = harness();
  const old = { ...page };
  for (const field of ['corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse']) delete old[field];
  assert.equal(h.schema.parse(old).corridorProse, null);
  const snapshot = h.staging.contentOf(old);
  for (const field of ['corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse']) delete snapshot[field];
  assert.equal(h.staging.stateOf({ ...old, deployedContent: snapshot }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...old, citiesHeading: 'Stray state copy', deployedContent: snapshot }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...old, corridorProse: 'New paragraph', deployedContent: snapshot }), 'STAGED');
});

test('old state rows and snapshots remain compatible until a real compliance or cities edit', () => {
  const h = harness();
  const old = { ...state };
  for (const field of ['complianceHeading', 'complianceProse', 'citiesHeading']) delete old[field];
  assert.equal(h.schema.parse(old).citiesHeading, null);
  assert.equal(h.schema.parse(old).complianceProse, null);
  const snapshot = legacyStateSnapshot(h);
  const blank = { ...old, complianceHeading: null, complianceProse: null, citiesHeading: null };
  assert.equal(h.staging.stateOf({ ...blank, deployedContent: snapshot }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...blank, corridorProse: 'Stray city copy', deployedContent: snapshot }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...blank, complianceProse: 'State rules', deployedContent: snapshot }), 'STAGED');
  assert.equal(h.staging.stateOf({ ...blank, citiesHeading: 'Cities', deployedContent: snapshot }), 'STAGED');
  assert.equal(h.staging.stateOf({ ...state, deployedContent: h.staging.contentOf(state) }), 'PUBLISHED');
});

test('revert restores new fields and clears them when reverting to a legacy snapshot', async () => {
  const h = harness({ stored: { ...page, deployedContent: page } });
  await assert.rejects(h.actions.revertLocation(undefined, form()), redirected);
  assert.equal(h.writes[0].data.complianceProse, page.complianceProse);
  const old = { ...page }; delete old.corridorProse; delete old.complianceProse;
  const legacy = harness({ stored: { ...page, deployedContent: old } });
  await assert.rejects(legacy.actions.revertLocation(undefined, form()), redirected);
  assert.equal(legacy.writes[0].data.corridorProse, null);
  assert.equal(legacy.writes[0].data.complianceProse, null);
  const stray = harness({ stored: { ...page, deployedContent: { ...page, citiesHeading: 'Stray state copy' } } });
  await assert.rejects(stray.actions.revertLocation(undefined, form()), redirected);
  assert.equal(stray.writes[0].data.citiesHeading, null);
});

test('state revert restores compliance and the cities heading, and clears them from a legacy snapshot', async () => {
  const h = harness({ stored: { ...state, deployedContent: state } });
  await assert.rejects(h.actions.revertLocation(undefined, form()), redirected);
  assert.equal(h.writes[0].data.kind, 'STATE');
  assert.equal(h.writes[0].data.complianceProse, page.complianceProse);
  assert.equal(h.writes[0].data.citiesHeading, 'Cities with stock');
  const legacy = harness({ stored: { ...state, deployedContent: legacyStateSnapshot(h) } });
  await assert.rejects(legacy.actions.revertLocation(undefined, form()), redirected);
  for (const field of ['corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse', 'citiesHeading']) {
    assert.equal(legacy.writes[0].data[field], null);
  }
});

test('state city lists validate their entries and read an empty list as the default', () => {
  const { schema } = harness();
  const parsed = schema.parse({ ...state, stateCities: cityList }).stateCities;
  assert.deepEqual(plain(parsed), [
    { name: 'Mysore', slug: 'mysuru', image: photo },
    { name: 'Hosapete', slug: null, image: null },
    { name: 'Bengaluru', slug: 'bengaluru', image: null },
  ]);
  assert.equal(schema.parse({ ...state, stateCities: [] }).stateCities, null, 'No list and an empty list are one value.');
  assert.equal(schema.parse({ ...state, stateCities: null }).stateCities, null);
  assert.equal(schema.parse({ ...page, stateCities: cityList }).stateCities, null, 'City pages have no city list.');
  const rejects = (list, pattern) => assert.throws(() => schema.parse({ ...state, stateCities: list }), pattern);
  rejects([{ name: 'Mysuru', slug: 'mysuru' }, { name: 'Mysore', slug: 'mysuru' }], /listed twice/);
  rejects([{ name: 'Hosapete', slug: null }, { name: 'hosapete ', slug: null }], /listed twice/);
  rejects([{ name: '   ', slug: null }], /required/);
  rejects([{ name: 'x'.repeat(61), slug: null }], /60 characters/);
  rejects([{ name: 'Mysuru', slug: 'Not A Slug' }]);
  // /locations slugs keep the double hyphen a "A / B" name produces.
  const aurangabad = { name: 'Chhatrapati Sambhajinagar / Aurangabad', slug: 'chhatrapati-sambhajinagar--aurangabad', image: null };
  assert.deepEqual(plain(schema.parse({ ...state, stateCities: [aurangabad] }).stateCities), [aurangabad]);
  rejects([{ name: 'Mysuru', slug: 'mysuru', image: { url: 'http://insecure.test/a.jpg', alt: 'A', width: 1, height: 1 } }]);
  rejects(Array.from({ length: 9 }, (_, i) => ({ name: `City ${i}`, slug: null })), /at most 8/);
});

test('state saves store the city list, clear it to the default, and city saves never acquire one', async () => {
  const h = harness({ stored: { ...page, kind: 'STATE' } });
  await assert.rejects(h.actions.updateLocation(undefined, form({ ...state, stateCities: cityList })), redirected);
  assert.deepEqual(plain(h.writes[0].data.stateCities), plain(h.schema.parse({ ...state, stateCities: cityList }).stateCities));
  await assert.rejects(h.actions.updateLocation(undefined, form({ ...state, stateCities: [] })), redirected);
  assert.equal(h.writes[1].data.stateCities, Prisma.DbNull);
  await assert.rejects(h.actions.updateLocation(undefined, form({ ...state, stateCities: null })), redirected);
  assert.equal(h.writes[2].data.stateCities, Prisma.DbNull);
  const invalid = await h.actions.updateLocation(undefined, form({ ...state, stateCities: [cityList[1], { ...cityList[1], name: 'HOSAPETE' }] }));
  assert.match(invalid.error, /stateCities\.1\.name: HOSAPETE is listed twice/);
  assert.equal(h.writes.length, 3);
  const city = harness();
  await assert.rejects(city.actions.updateLocation(undefined, form({ stateCities: cityList })), redirected);
  assert.equal(city.writes[0].data.stateCities, Prisma.DbNull);
});

test('a state city list stages like other content, and old snapshots without one stay published', () => {
  const h = harness();
  const list = h.schema.parse({ ...state, stateCities: cityList }).stateCities;
  const listed = { ...state, stateCities: list };
  const blank = { ...state, complianceHeading: null, complianceProse: null, citiesHeading: null, stateCities: null };
  // Snapshots from before the city list lack the key altogether.
  const v1 = h.staging.contentOf(state); delete v1.stateCities;
  assert.equal(Object.hasOwn(v1, 'stateCities'), false);
  assert.equal(h.staging.stateOf({ ...state, stateCities: null, deployedContent: v1 }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...blank, deployedContent: legacyStateSnapshot(h) }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...listed, deployedContent: v1 }), 'STAGED');
  assert.equal(h.staging.stateOf({ ...listed, deployedContent: plain(h.staging.contentOf(listed)) }), 'PUBLISHED');
  const reordered = [list[1], list[0], list[2]];
  assert.equal(h.staging.stateOf({ ...state, stateCities: reordered, deployedContent: plain(h.staging.contentOf(listed)) }), 'STAGED');
  assert.equal(Object.hasOwn(h.staging.contentOf({ ...page, stateCities: list }), 'stateCities'), false, 'City snapshots never carry a city list.');
});

test('state revert restores the city list and clears it from snapshots without one', async () => {
  const list = plain(harness().schema.parse({ ...state, stateCities: cityList }).stateCities);
  const snapshot = { ...state, stateCities: list };
  const h = harness({ stored: { ...state, stateCities: null, deployedContent: snapshot } });
  await assert.rejects(h.actions.revertLocation(undefined, form()), redirected);
  assert.deepEqual(plain(h.writes[0].data.stateCities), list);
  const legacy = harness({ stored: { ...state, stateCities: list, deployedContent: legacyStateSnapshot(h) } });
  await assert.rejects(legacy.actions.revertLocation(undefined, form()), redirected);
  assert.equal(legacy.writes[0].data.stateCities, Prisma.DbNull);
  const stray = harness({ stored: { ...page, deployedContent: { ...page, stateCities: list } } });
  await assert.rejects(stray.actions.revertLocation(undefined, form()), redirected);
  assert.equal(stray.writes[0].data.stateCities, Prisma.DbNull);
});

test('authentication and stale-save protections still apply to city content', async () => {
  const denied = harness({ denied: true });
  await assert.rejects(denied.actions.updateLocation(undefined, form()), /unauthenticated/);
  assert.equal(denied.writes.length, 0);
  const stale = harness({ count: 0 });
  assert.match((await stale.actions.updateLocation(undefined, form())).error, /changed somewhere else/);
});

const stock = (listings, extra = {}) => ({
  listings, measured: listings, rent: { min: 20, median: 25, max: 30 }, size: { min: 1000, median: 50000, max: 200000 },
  clearHeight: null, docksMedian: null, construction: [{ label: 'PEB', count: listings, share: 100 }], flooring: [],
  fireNoc: 0, commercialClu: 0, listingIds: [], peers: [], ...extra,
});
const city = (slug, name, listings, extra = {}) => ({ kind: 'CITY', slug, name, path: `/listings/${slug}`,
  parentState: 'Karnataka', stateSlug: 'karnataka', hasPage: true, ...stock(listings), ...extra });
const region = (slug, name, extra = {}) => ({ kind: 'STATE', slug, name, path: `/listings/state/${slug}`,
  parentState: null, stateSlug: null, hasPage: true, ...stock(100), ...extra });
const hero = { url: 'https://images.example.test/bengaluru.webp', alt: 'Bengaluru warehouse', width: 1200, height: 900 };

test('default state cities show the four busiest cities with published figures where available', () => {
  const { overview, noOverrides } = harness();
  const pages = overview.summarisePages([
    { kind: 'CITY', slug: 'bengaluru', status: 'PUBLISHED', heroImage: hero, statOverrides: { rent: { median: 26 } } },
    { kind: 'CITY', slug: 'hubli', status: 'PUBLISHED', heroImage: { url: 'not a url' }, statOverrides: 'not overrides' },
    { kind: 'CITY', slug: 'kolar', status: 'PUBLISHED', heroImage: null, statOverrides: null },
    { kind: 'CITY', slug: 'mysuru', status: 'DRAFT', heroImage: hero, statOverrides: null },
    { kind: 'STATE', slug: 'belagavi', status: 'PUBLISHED', heroImage: null, statOverrides: null },
    { kind: 'CITY', slug: 'pune', status: 'PUBLISHED', heroImage: null, statOverrides: null },
  ]);
  assert.equal(Object.hasOwn(pages[0], 'heroImage'), false, 'City cards do not inherit the city overview hero photo.');
  assert.deepEqual(plain(pages[1].statOverrides), plain(noOverrides));
  const cities = [
    city('kolar', 'Kolar', 40, { rent: null, size: null, construction: [] }),
    city('mysuru', 'Mysuru', 30),
    city('bengaluru', 'Bengaluru', 400, { cityOverview: { summary: stock(380, { rent: { min: 18, median: 24, max: 40 } }) } }),
    city('belagavi', 'Belagavi', 50),
    city('tumakuru', 'Tumakuru', 3, { hasPage: false }),
    city('hubli', 'Hubli', 40),
    city('pune', 'Pune', 300, { stateSlug: 'maharashtra' }),
  ];
  const { rows, others } = overview.stateCities('karnataka', cities, pages);
  assert.deepEqual(rows.map(r => r.slug), ['bengaluru', 'belagavi', 'hubli', 'kolar']);
  assert.deepEqual(rows.map(r => r.link), ['overview', 'listings', 'overview', 'overview']);
  assert.equal(rows[0].stats.listings, 380);
  assert.deepEqual(plain(rows[0].stats.rent), { min: 18, median: 26, max: 40 });
  assert.ok(rows.every(row => row.image === null), 'Default city photos are chosen from listings at build.');
  assert.equal(rows[3].stats.rent, null);
  assert.deepEqual(plain(others), [{ slug: 'mysuru', name: 'Mysuru' }]);
  const chosen = overview.stateCities('karnataka', cities, pages, [
    { name: 'Mysuru', slug: 'mysuru', image: hero },
    { name: 'An unlisted city', slug: null, image: null },
    { name: 'Bengaluru', slug: 'bengaluru', image: null },
  ]).rows;
  assert.deepEqual(chosen.map(row => row.slug), ['mysuru', null, 'bengaluru']);
  assert.deepEqual(chosen.map(row => row.link), ['listings', null, 'overview']);
  assert.equal(chosen[0].image.url, hero.url, 'An explicitly chosen card photo is preserved.');
  assert.equal(chosen[1].stats, null, 'Unlisted cities must not acquire unrelated inventory figures.');
  assert.deepEqual(plain(overview.stateCities('goa', cities, pages)), { rows: [], others: [] });
});

test('a custom state city list keeps its names, skips unnamed entries and resolves stale slugs as unlisted', () => {
  const { overview } = harness();
  const pages = overview.summarisePages([{ kind: 'CITY', slug: 'bengaluru', status: 'PUBLISHED', statOverrides: null }]);
  const cities = [city('bengaluru', 'Bengaluru', 400), city('mysuru', 'Mysuru', 30), city('hubli', 'Hubli', 40, { hasPage: false })];
  const { rows, others } = overview.stateCities('karnataka', cities, pages, [
    { name: 'Bangalore', slug: 'bengaluru', image: null },
    { name: '  ', slug: null, image: null },
    { name: 'Old town', slug: 'gone-from-listings', image: null },
    { name: 'Hosapete', slug: null, image: null },
  ]);
  assert.deepEqual(rows.map(r => [r.name, r.slug, r.link]), [['Bangalore', 'bengaluru', 'overview'], ['Old town', null, null], ['Hosapete', null, null]]);
  assert.equal(new Set(rows.map(r => r.key)).size, rows.length);
  assert.deepEqual(plain(others), [{ slug: 'mysuru', name: 'Mysuru' }], 'Only cities with listing pages, and none already listed.');
  // A list still being typed has no named entry yet, so the page shows the default.
  const typing = overview.stateCities('karnataka', cities, pages, [{ name: '', slug: null, image: null }, { name: '', slug: null, image: null }]);
  assert.deepEqual(typing.rows.map(r => r.slug), ['bengaluru', 'hubli', 'mysuru']);
  const long = overview.stateCities('karnataka', cities, pages, Array.from({ length: 10 }, (_, i) => ({ name: `City ${i}`, slug: null, image: null })));
  assert.equal(long.rows.length, 8);
});

test('nearby states link only published neighbours, and fall back when the backend omits them', () => {
  const { overview } = harness();
  const pages = overview.summarisePages([
    { kind: 'STATE', slug: 'maharashtra', status: 'PUBLISHED', heroImage: null, statOverrides: null },
    { kind: 'STATE', slug: 'tamil-nadu', status: 'DRAFT', heroImage: null, statOverrides: null },
    { kind: 'CITY', slug: 'goa', status: 'PUBLISHED', heroImage: null, statOverrides: null },
    { kind: 'STATE', slug: 'kerala', status: 'PUBLISHED', heroImage: null, statOverrides: null },
  ]);
  const karnataka = region('karnataka', 'Karnataka', { nearbyStates: [
    { name: 'Maharashtra', slug: 'maharashtra' }, { name: 'Tamil Nadu', slug: 'tamil-nadu' },
    { name: 'Goa', slug: 'goa' }, { name: 'Kerala', slug: 'kerala' },
  ] });
  const states = [karnataka, region('maharashtra', 'Maharashtra'), region('tamil-nadu', 'Tamil Nadu'),
    region('goa', 'Goa'), region('kerala', 'Kerala', { hasPage: false })];
  assert.deepEqual(plain(overview.nearbyStates(karnataka, states, pages)), [{ name: 'Maharashtra', slug: 'maharashtra', path: '/overview/maharashtra' }]);
  assert.deepEqual(plain(overview.nearbyStates({ ...karnataka, nearbyStates: [] }, states, pages)), []);
  assert.equal(overview.nearbyStates({ ...karnataka, nearbyStates: undefined }, states, pages), null);
  assert.equal(overview.nearbyStates(null, states, pages), null);
});

test('other cities read as one plain list', () => {
  const { overview } = harness();
  assert.deepEqual([[], ['A'], ['A', 'B'], ['A', 'B', 'C']].map(overview.listText), ['', 'A', 'A and B', 'A, B and C']);
});
