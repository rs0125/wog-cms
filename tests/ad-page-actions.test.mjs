import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const content = JSON.parse(fs.readFileSync(path.join(root, 'content/ad-pages/bangalore.json'), 'utf8'));
const stamp = '2026-09-26T00:00:00.000Z';
function harness({ denied = false, count = 1, failure = false, current = null } = {}) {
  const writes = [];
  const reads = [];
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const loaded = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Object, Error, SyntaxError, console: { error() {} }, require(id) {
      if (id === 'next/navigation') return { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } };
      if (id === '@/lib/auth') return { requireUser: async () => { if (denied) throw new Error('unauthenticated'); } };
      if (id === '@/lib/prisma') return { prisma: { adPage: {
        updateMany: async args => { writes.push(args); if (failure) throw new Error('private database detail'); return { count }; },
        findUnique: async args => { reads.push(args); return current; },
      } } };
      if (id.endsWith('.mjs')) return require(path.resolve(root, path.dirname(file), id));
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
      if (id.startsWith('./')) return load(path.join(path.dirname(file), `${id.slice(2)}.ts`));
      throw new Error(`Unexpected dependency ${id}`);
    } });
    cache[file] = loaded.exports;
    return loaded.exports;
  }
  return { writes, reads, save: load('app/(authed)/ad-pages/actions.ts').saveAdPage, state: load('lib/ad-page-staging.ts').adPageStateOf };
}
function form(overrides = {}, page = content) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ slug: 'bangalore', intent: 'draft', expectedUpdatedAt: stamp, content: JSON.stringify(page), ...overrides })) result.set(key, value);
  return result;
}
const saved = intent => error => error.location === `/ad-pages/bangalore?saved=${intent}`;

test('direct ad-page actions require a CMS session', async () => {
  const h = harness({ denied: true });
  await assert.rejects(h.save(undefined, form()), /unauthenticated/);
  assert.equal(h.writes.length, 0);
});
test('unfinished drafts never overwrite approved content', async () => {
  const h = harness();
  const draft = structuredClone(content);
  draft.services[0].mobileBody = '';
  draft.images.services.url = '';
  await assert.rejects(h.save(undefined, form({}, draft)), saved('draft'));
  assert.equal(h.writes[0].data.publishedContent, undefined);
  assert.equal(h.writes[0].data.draftContent.services[0].mobileBody, '');
  assert.equal(h.writes[0].where.updatedAt.toISOString(), stamp);
});
test('approval stores the complete page and omits unknown private fields', async () => {
  const h = harness();
  await assert.rejects(h.save(undefined, form({ intent: 'publish' }, { ...content, privateNote: 'private' })), saved('publish'));
  assert.equal(JSON.stringify(h.writes[0].data.publishedContent), JSON.stringify(content));
  assert.equal(JSON.stringify(h.writes[0].data.draftContent), JSON.stringify(content));
});
test('stale editor revisions cannot overwrite newer work', async () => {
  const h = harness({ count: 0 });
  const result = await h.save(undefined, form({ intent: 'publish' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /changed after you opened/);
});
for (const intent of ['draft', 'publish']) test(`a matching ${intent} retry acknowledges a committed save without another write`, async () => {
  const h = harness({ count: 0, current: { draftContent: content, publishedContent: intent === 'publish' ? content : { copy: 'Other approved content' } } });
  await assert.rejects(h.save(undefined, form({ intent })), saved(intent));
  assert.equal(h.writes.length, 1, 'Only the original conditional update is attempted');
  assert.equal(h.reads.length, 1);
  assert.equal(h.writes[0].where.updatedAt.toISOString(), stamp);
});
test('matching a draft cannot approve different published content through a stale tab', async () => {
  const h = harness({ count: 0, current: { draftContent: content, publishedContent: { copy: 'Newer approved content' } } });
  assert.match((await h.save(undefined, form({ intent: 'publish' }))).error, /changed after you opened/);
  assert.equal(h.writes.length, 1);
});
test('a newer draft is never overwritten by a retry', async () => {
  const changed = structuredClone(content);
  changed.copy.heroHeading = 'Another editor’s draft';
  const h = harness({ count: 0, current: { draftContent: changed, publishedContent: content } });
  assert.match((await h.save(undefined, form())).error, /changed after you opened/);
  assert.equal(h.writes.length, 1);
});
for (const overrides of [{ slug: 'unknown' }, { expectedUpdatedAt: 'invalid' }, { intent: 'unpublish' }, { content: '{' }]) {
  test(`invalid action input is rejected: ${JSON.stringify(overrides)}`, async () => {
    const h = harness();
    assert.equal((await h.save(undefined, form(overrides))).ok, false);
    assert.equal(h.writes.length, 0);
  });
}
test('publishing refuses incomplete copy, unsafe image URLs and broken card identities', async () => {
  for (const change of [p => { p.copy.heroHeading = ''; }, p => { p.images.services.url = 'javascript:alert(1)'; }, p => { p.services[0].id = 'unknown'; }, p => { p.areaGroups[0].rows = []; }]) {
    const page = structuredClone(content); change(page);
    const h = harness();
    assert.equal((await h.save(undefined, form({ intent: 'publish' }, page))).ok, false);
    assert.equal(h.writes.length, 0);
  }
});
test('database failures preserve edits and hide private errors', async () => {
  const h = harness({ failure: true });
  const result = await h.save(undefined, form());
  assert.equal(result.ok, false);
  assert.match(result.error, /edits are still here/);
  assert.doesNotMatch(result.error, /private database detail/);
});
test('multibyte text is bounded by request bytes, not JavaScript character count', async () => {
  const page = structuredClone(content);
  for (const key of Object.keys(page.copy).slice(0, 20)) page.copy[key] = '漢'.repeat(9000);
  assert.ok(JSON.stringify(page).length < 500000);
  assert.ok(Buffer.byteLength(JSON.stringify(page), 'utf8') > 500000);
  const h = harness();
  const result = await h.save(undefined, form({ intent: 'draft' }, page));
  assert.equal(result.ok, false);
  assert.match(result.error, /too large/);
  assert.equal(h.writes.length, 0);
});
test('staging distinguishes private drafts from content ready for the next build', () => {
  const h = harness();
  assert.equal(h.state({ draftContent: { copy: 'new draft' }, publishedContent: content, deployedContent: content }).hasDraft, true);
  assert.equal(h.state({ draftContent: { copy: 'new draft' }, publishedContent: content, deployedContent: content }).staged, false);
  assert.equal(h.state({ draftContent: content, publishedContent: content, deployedContent: null }).staged, true);
});
