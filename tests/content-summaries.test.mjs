import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { loader, blog, editorial } from './helpers/agent-cms.mjs';

const load = loader({ 'server-only': {}, './prisma': { prisma: { $queryRaw: query => query } } });
const summaries = load('lib/content-summaries.ts');
const models = [
  ['Blog', 'getBlogSummaries', 'lib/staging.ts'],
  ['LocationPage', 'getLocationSummaries', 'lib/location-staging.ts'],
  ['MicromarketPage', 'getMicromarketSummaries', 'lib/micromarket-staging.ts'],
  ['ServicePage', 'getServiceSummaries', 'lib/service-staging.ts', 'serviceStateOf'],
  ['LegalPage', 'getLegalSummaries', 'lib/legal-staging.ts', 'legalStateOf'],
  ['AdPage', 'getAdPageSummaries', 'lib/ad-page-staging.ts', 'adPageStateOf'],
];

test('summary queries bind filters and return metadata without content snapshots', () => {
  const kind = "CITY' OR true --";
  const filtered = summaries.getLocationSummaries(kind);
  assert.deepEqual(filtered.values, [kind]);
  assert.ok(!filtered.sql.includes(kind));
  for (const [, method] of models) {
    const query = summaries[method]();
    assert.match(query.sql, /SELECT/);
    assert.doesNotMatch(query.sql, /SELECT\s+\*|AS "(?:deployedContent|draftContent|publishedContent)"/);
  }
});

// Opt in against an existing PostgreSQL database. Every statement is a SELECT;
// synthetic rows live in CTEs and never create tables or write CMS content.
test('PostgreSQL summaries match editor status for every field and legacy snapshot', {
  skip: process.env.CMS_SUMMARY_DATABASE_TEST !== 'true',
}, async () => {
  const { loadEnvConfig } = (await import('@next/env')).default;
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const db = new PrismaClient();
  try {
    for (const [table, method, module, helper] of models) {
      const staging = load(module);
      const rows = [];
      if (!helper) {
        const kinds = table === 'LocationPage' ? ['CITY', 'STATE'] : [null];
        for (const kind of kinds) {
          const base = table === 'Blog'
            ? { ...blog, thumbnail: null, dateModified: new Date('2026-10-05T00:00:00Z'), datePublished: null }
            : { ...editorial, corridorHeading: null, corridorProse: null, complianceHeading: null, complianceProse: null };
          const row = { ...base, kind, citySlug: 'city', slug: 'test', status: 'PUBLISHED' };
          const snapshot = staging.contentOf(row);
          const add = value => rows.push({ ...value, id: rows.length + 1 });
          add({ ...row, deployedContent: snapshot });
          add({ ...row, status: 'DRAFT', deployedContent: snapshot });
          for (const status of ['DRAFT', 'PUBLISHED']) {
            for (const deployedContent of [null, { ...snapshot, status: 'DRAFT' }]) add({ ...row, status, deployedContent });
          }
          // Each newly added content field must participate in the SQL compare.
          for (const key of Object.keys(snapshot)) {
            const value = row[key];
            const changed = key === 'status' ? 'DRAFT' : key === 'kind' ? (kind === 'CITY' ? 'STATE' : 'CITY')
              : key.startsWith('date') ? new Date('2026-10-06T00:00:00Z')
              : Array.isArray(value) ? [...value, 'changed']
                : typeof value === 'number' ? value + 1 : 'changed';
            add({ ...row, [key]: changed, deployedContent: snapshot });
          }
          add({ ...row, deployedContent: { ...snapshot, extra: 'unexpected key' } });
          add({ ...row, deployedContent: Object.fromEntries(Object.entries(snapshot).reverse()) });
          const legacy = { ...snapshot };
          for (const key of ['thumbnail', 'corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse', 'citiesHeading', 'stateCities']) delete legacy[key];
          add({ ...row, deployedContent: legacy });
          if (table !== 'Blog') {
            const nested = { ...row, statOverrides: { nested: { a: 1, b: 2 } }, relatedBlogs: ['one', 'two'] };
            add({ ...nested, deployedContent: { ...staging.contentOf(nested), statOverrides: { nested: { b: 2, a: 1 } } } });
            add({ ...nested, deployedContent: { ...staging.contentOf(nested), relatedBlogs: ['two', 'one'] } });
          }
        }
      } else {
        for (const draftContent of [null, { a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }, { a: 2 }]) {
          for (const publishedContent of [null, { a: 1, b: [1, 2] }]) {
            for (const deployedContent of [null, { a: 1, b: [1, 2] }]) rows.push({ slug: `test-${rows.length}`, draftContent, publishedContent, deployedContent });
          }
        }
      }
      const query = summaries[method]();
      const result = await db.$queryRaw(Prisma.sql`WITH ${Prisma.raw(`"${table}"`)} AS (
        SELECT * FROM jsonb_populate_recordset(NULL::${Prisma.raw(`"${table}"`)}, ${JSON.stringify(rows)}::jsonb)
      ) ${query}`);
      for (const row of rows) {
        const summary = result.find(r => helper ? r.slug === row.slug : r.id === row.id);
        assert.ok(summary, `${table}: missing summary`);
        if (!helper) {
          assert.equal(summary.state, staging.stateOf(row), `${table} row ${row.id}`);
          assert.equal(summary.revertable, row.deployedContent !== null);
        } else {
          for (const [key, value] of Object.entries(staging[helper](row))) assert.equal(summary[key], value, `${table} ${row.slug}.${key}`);
        }
      }
      if (helper) {
        const [empty] = await db.$queryRaw(Prisma.sql`WITH ${Prisma.raw(`"${table}"`)} AS (
          SELECT 'test' AS slug, 'null'::jsonb AS "draftContent", NULL::jsonb AS "publishedContent", 'null'::jsonb AS "deployedContent"
        ) ${query}`);
        assert.deepEqual(empty, { slug: 'test', hasDraft: false, staged: false, published: false, deployed: false });
      }
      if (table === 'LocationPage') {
        const filtered = await db.$queryRaw(Prisma.sql`WITH "LocationPage" AS (
          SELECT * FROM jsonb_populate_recordset(NULL::"LocationPage", ${JSON.stringify(rows)}::jsonb)
        ) ${summaries.getLocationSummaries('CITY')}`);
        assert.equal(filtered.length, rows.filter(row => row.kind === 'CITY').length);
        assert.ok(filtered.every(row => row.kind === 'CITY'));
      }
      console.log(`${table}: ${rows.length} status cases agree`);
    }
  } finally { await db.$disconnect(); }
});
