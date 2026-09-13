import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { Prisma } = require('@prisma/client');
const stamp = '2026-09-13T00:00:00.000Z';
const content = { slug: 'warehouse-search', title: 'Warehouse Search', seoTitle: 'Search | WareOnGo',
  description: 'Find warehouse space.', summary: 'We help you find a warehouse.', keywords: [],
  blocks: [{ kind: 'p', text: 'Service copy written in the CMS.' }], faqs: [] };

function harness({ denied = false, count = 1, failure } = {}) {
  const writes = [];
  const modules = {};
  function load(file) {
    if (modules[file]) return modules[file];
    const exports = {};
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(compiled, { exports, module: { exports }, Date, Object, Error, console: { error() {} },
      require(id) {
        if (['zod', '@prisma/client'].includes(id)) return require(id);
        if (id === 'next/navigation') return { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } };
        if (id === '@/lib/auth') return { requireUser: async () => { if (denied) throw new Error('unauthenticated'); } };
        if (id === '@/lib/prisma') return { prisma: { servicePage: Object.fromEntries(['create', 'updateMany'].map(method => [method, async query => {
          writes.push({ method, ...query }); if (failure) throw failure; return { count };
        }])) } };
        if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
        if (id.startsWith('./')) return load(path.join(path.dirname(file), `${id.slice(2)}.ts`));
        throw new Error(`Unexpected import: ${id}`);
      },
    }, { filename: file });
    modules[file] = exports; return exports;
  }
  return { writes, save: load('app/(authed)/services/actions.ts').saveServicePage, state: load('lib/service-staging.ts').serviceStateOf };
}
function form(overrides = {}, page = content) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ slug: page.slug, content: JSON.stringify(page), expectedUpdatedAt: stamp, intent: 'draft', ...overrides })) data.set(key, value);
  return data;
}
const saved = intent => e => e.location === `/services/warehouse-search?saved=${intent}`;

test('authentication protects direct server action calls', async () => {
  const h = harness({ denied: true });
  await assert.rejects(h.save(undefined, form()), /unauthenticated/); assert.equal(h.writes.length, 0);
});
test('an unfinished first draft can be saved without publishing a page', async () => {
  const h = harness();
  await assert.rejects(h.save(undefined, form({ expectedUpdatedAt: 'new' }, { ...content, description: '', summary: '', blocks: [{ kind: 'p', text: '' }] })), saved('draft'));
  assert.equal(h.writes[0].method, 'create'); assert.equal(h.writes[0].data.publishedContent, undefined);
});
test('private edits to a published page do not change its approved revision', async () => {
  const h = harness(); await assert.rejects(h.save(undefined, form()), saved('draft'));
  assert.equal(h.writes[0].data.publishedContent, undefined);
  assert.equal(h.writes[0].where.updatedAt.toISOString(), stamp);
});
test('publishing saves only service fields in the approved revision', async () => {
  const h = harness(); await assert.rejects(h.save(undefined, form({ intent: 'publish' }, { ...content, author: 'Private byline', dateModified: '2026-09-13', related: ['blog'] })), saved('publish'));
  assert.equal(JSON.stringify(h.writes[0].data.publishedContent), JSON.stringify(content));
});
for (const [label, extra] of [
  ['oversized paragraph', { blocks: [{ kind: 'p', text: 'x'.repeat(20001) }] }],
  ['oversized list item', { blocks: [{ kind: 'ul', items: ['x'.repeat(20001)] }] }],
  ['too many list items', { blocks: [{ kind: 'ul', items: Array(101).fill('Text') }] }],
  ['oversized FAQ answer', { faqs: [{ q: 'Question?', a: 'x'.repeat(20001) }] }],
  ['too many FAQs', { faqs: Array(101).fill({ q: 'Question?', a: 'Answer.' }) }],
  ['oversized keyword', { keywords: ['x'.repeat(301)] }],
]) test(`publishing rejects ${label} that the draft editor cannot reopen`, async () => {
  const h = harness();
  const result = await h.save(undefined, form({ intent: 'publish' }, { ...content, ...extra }));
  assert.equal(result.ok, false); assert.equal(h.writes.length, 0);
});
for (const blocks of [[], [{ kind: 'p', text: '  ' }], [{ kind: 'h2', text: 'A heading' }],
  [{ kind: 'images', images: [{ url: 'https://example.com/image.webp', alt: 'Image', width: 20, height: 20 }], caption: 'Caption' }],
]) test(`no writing cannot be published: ${JSON.stringify(blocks)}`, async () => {
  const h = harness(); const result = await h.save(undefined, form({ intent: 'publish' }, { ...content, blocks }));
  assert.equal(result.ok, false); assert.equal(h.writes.length, 0);
});
test('unpublish queues removal and preserves the draft', async () => {
  const h = harness(); await assert.rejects(h.save(undefined, form({ intent: 'unpublish' })), saved('unpublish'));
  assert.equal(h.writes[0].data.publishedContent, Prisma.DbNull);
  assert.equal(h.writes[0].data.draftContent.title, content.title);
});
test('stale saves and concurrent first saves cannot overwrite content', async () => {
  const h = harness({ count: 0 }); assert.match((await h.save(undefined, form())).error, /changed after you opened/);
  const collision = harness({ failure: new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6' }) });
  assert.match((await collision.save(undefined, form({ expectedUpdatedAt: 'new' }))).error, /another editor/);
});
for (const overrides of [{ slug: 'manpower-services' }, { slug: 'unknown' }, { intent: 'delete' }, { expectedUpdatedAt: '' }, { expectedUpdatedAt: 'bad' }, { content: '{' }]) {
  test(`invalid action is rejected: ${JSON.stringify(overrides)}`, async () => {
    const h = harness(); assert.equal((await h.save(undefined, form(overrides))).ok, false); assert.equal(h.writes.length, 0);
  });
}
test('draft and publication states remain separate through build and unpublish', () => {
  const h = harness();
  const initial = h.state({ draftContent: content, publishedContent: null, deployedContent: null });
  assert.equal(initial.published, false); assert.equal(initial.staged, false);
  const edited = h.state({ draftContent: { ...content, title: 'Private edit' }, publishedContent: content, deployedContent: content });
  assert.equal(edited.hasDraft, true); assert.equal(edited.staged, false);
  const removal = h.state({ draftContent: content, publishedContent: null, deployedContent: content });
  assert.equal(removal.staged, true); assert.equal(removal.published, false);
});
