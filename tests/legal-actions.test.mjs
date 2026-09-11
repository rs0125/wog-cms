import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const stamp = '2026-09-11T00:00:00.000Z';
const content = { slug: 'privacy-policy', title: 'Policy', seoTitle: 'Policy | WareOnGo', description: 'Description',
  effectiveDate: '2025-11-01', updated: '2025-11-22', blocks: [{ kind: 'p', text: 'New policy copy' }], notice: '' };

function harness({ denied = false, count = 1, failure = false } = {}) {
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
        if (id === 'zod') return require('zod');
        if (id === 'next/navigation') return { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } };
        if (id === '@/lib/auth') return { requireUser: async () => { if (denied) throw new Error('unauthenticated'); } };
        if (id === '@/lib/prisma') return { prisma: { legalPage: { updateMany: async query => {
          writes.push(query); if (failure) throw new Error('private error'); return { count };
        } } } };
        if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
        if (id.startsWith('./')) return load(path.join(path.dirname(file), `${id.slice(2)}.ts`));
        throw new Error(`Unexpected import: ${id}`);
      },
    }, { filename: file });
    modules[file] = exports; return exports;
  }
  return { writes, save: load('app/(authed)/legal/actions.ts').saveLegalPage, state: load('lib/legal-staging.ts').legalStateOf };
}

function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...content, blocks: JSON.stringify(content.blocks), expectedUpdatedAt: stamp, intent: 'draft', ...overrides })) data.set(key, value);
  return data;
}

test('unauthenticated direct action calls cannot save', async () => {
  const h = harness({ denied: true });
  await assert.rejects(h.save(undefined, form()), /unauthenticated/); assert.equal(h.writes.length, 0);
});

test('save draft writes only the draft and uses an atomic revision condition', async () => {
  const h = harness();
  await assert.rejects(h.save(undefined, form()), e => e.location === '/legal/privacy-policy?saved=draft');
  const query = h.writes[0];
  assert.equal(query.where.slug, 'privacy-policy'); assert.equal(query.where.updatedAt.toISOString(), stamp);
  assert.equal(query.data.draftContent.title, content.title); assert.equal(query.data.publishedContent, undefined);
});

test('save for next build copies the validated draft into the approved revision', async () => {
  const h = harness();
  await assert.rejects(h.save(undefined, form({ intent: 'publish' })), e => e.location.endsWith('?saved=publish'));
  assert.equal(JSON.stringify(h.writes[0].data.publishedContent), JSON.stringify(h.writes[0].data.draftContent));
});

test('a stale editor cannot overwrite another save', async () => {
  const h = harness({ count: 0 }); const result = await h.save(undefined, form({ intent: 'publish' }));
  assert.equal(result.ok, false); assert.match(result.error, /changed after you opened/);
});

for (const overrides of [
  { slug: 'unknown' }, { intent: 'delete' }, { expectedUpdatedAt: '' }, { expectedUpdatedAt: 'not-a-date' },
  { blocks: '{' }, { blocks: '[]' }, { title: ' ' }, { effectiveDate: '2025-02-31' }, { updated: '2024-01-01' },
  { blocks: JSON.stringify([{ kind: 'images', images: [] }]) },
]) test(`rejects invalid save: ${JSON.stringify(overrides)}`, async () => {
  const h = harness(); const result = await h.save(undefined, form(overrides));
  assert.equal(result.ok, false); assert.equal(h.writes.length, 0);
});

test('database failures return a useful error without internal details', async () => {
  const h = harness({ failure: true }); const result = await h.save(undefined, form());
  assert.equal(result.ok, false); assert.match(result.error, /edits are still here/); assert.doesNotMatch(result.error, /private error/);
});

test('draft and queued badges distinguish revisions even after a build snapshots approved copy', () => {
  const h = harness();
  const approved = { ...content, title: 'Approved copy' };
  const state = h.state({ draftContent: content, publishedContent: approved, deployedContent: approved });
  assert.equal(state.hasDraft, true); assert.equal(state.staged, false);
  const queued = h.state({ draftContent: content, publishedContent: content, deployedContent: approved });
  assert.equal(queued.hasDraft, false); assert.equal(queued.staged, true);
});
