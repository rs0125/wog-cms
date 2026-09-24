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
    vm.runInNewContext(compiled, { exports, module: { exports }, Date, Object, Error, console,
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
  return { writes, actions: load('app/(authed)/locations/actions.ts'), staging: load('lib/location-staging.ts'), schema: load('lib/location-schema.ts').locationSchema };
}
const form = (extra = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...page, id: 1, expectedUpdatedAt: '2026-09-22T00:00:00.000Z', ...extra })) {
    data.set(key, value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return data;
};
const redirected = error => error.location?.startsWith('/locations');

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

test('state saves cannot acquire city-only fields', async () => {
  const h = harness({ stored: { ...page, kind: 'STATE' } });
  await assert.rejects(h.actions.updateLocation(undefined, form({ kind: 'STATE' })), redirected);
  for (const field of ['corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse']) assert.equal(h.writes[0].data[field], null);
});

test('old content and old deployed snapshots remain compatible until a real city edit', () => {
  const h = harness();
  const old = { ...page };
  for (const field of ['corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse']) delete old[field];
  assert.equal(h.schema.parse(old).corridorProse, null);
  const snapshot = h.staging.contentOf(old);
  for (const field of ['corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse']) delete snapshot[field];
  assert.equal(h.staging.stateOf({ ...old, deployedContent: snapshot }), 'PUBLISHED');
  assert.equal(h.staging.stateOf({ ...old, corridorProse: 'New paragraph', deployedContent: snapshot }), 'STAGED');
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
});

test('authentication and stale-save protections still apply to city content', async () => {
  const denied = harness({ denied: true });
  await assert.rejects(denied.actions.updateLocation(undefined, form()), /unauthenticated/);
  assert.equal(denied.writes.length, 0);
  const stale = harness({ count: 0 });
  assert.match((await stale.actions.updateLocation(undefined, form())).error, /changed somewhere else/);
});
