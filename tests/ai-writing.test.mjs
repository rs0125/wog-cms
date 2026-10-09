import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loader, editorial } from './helpers/agent-cms.mjs';

const load = loader();
const w = load('lib/ai-writing.ts');
const { blogSchema } = load('lib/blog-schema.ts');
const target = { type: 'blog', slug: 'warehouse-guide' };
const blank = { slug: target.slug, title: '', seoTitle: '', description: '', summary: '', author: null,
  blocks: [{ kind: 'p', text: '' }], faqs: [], keywords: [], thumbnail: null, related: [], status: 'DRAFT',
  dateModified: '2026-10-08', datePublished: null, sortOrder: 0 };
const complete = { ...blank, title: 'Warehouse guide', seoTitle: 'A useful warehouse guide', description: 'Choosing space for your operations.',
  summary: 'Compare access, specifications and lease terms.', blocks: [{ kind: 'p', text: 'Check the access roads before selecting a building.' }] };
const file = (content, page = target) => JSON.stringify({ ...w.writingTemplate(page, blank), content });

for (const type of w.writingTypes) test(`${type}: exported template is readable and contains only writing fields`, () => {
  const page = { type, slug: type === 'ad' ? 'bangalore' : 'sample', ...(type === 'micromarket' ? { citySlug: 'bengaluru' } : {}) };
  const template = w.writingTemplate(page, {});
  assert.equal(w.parseWritingJson(JSON.stringify(template), page).issues.length, 0);
  assert.ok(template.instructions.length > 5);
  for (const key of ['slug', 'status', 'id', 'updatedAt', 'images', 'heroImage', 'statOverrides', 'dateModified']) assert.equal(Object.hasOwn(template.content, key), false);
});
test('templates follow current city and state schemas and include existing prose as reference', () => {
  const city = w.writingTemplate({ type: 'city', slug: 'bengaluru' }, { heroProse: 'Keep this introduction.' });
  const state = w.writingTemplate({ type: 'state', slug: 'karnataka' }, {});
  assert.ok(city.schema.properties.corridorProse);
  assert.equal(city.schema.properties.citiesHeading, undefined);
  assert.ok(state.schema.properties.citiesHeading);
  assert.ok(state.schema.properties.complianceProse);
  assert.equal(state.schema.properties.corridorProse, undefined);
  assert.deepEqual(city.guidance.marketProse.suggestedWords, { min: 130, max: 160 });
  assert.equal(city.content.heroProse, 'Keep this introduction.');
  assert.match(city.guidance.marketProse.guidance, /freight routes/);
  assert.match(state.guidance.complianceProse.guidance, /dated authoritative/);
  assert.equal(city.reference, undefined, 'Do not duplicate long copy in the export.');
});
test('valid blog round trip keeps status, images and URL out of import control', () => {
  const incoming = w.parseWritingJson(file(w.writingContent('blog', complete)), target);
  assert.deepEqual(incoming.issues, []);
  const changes = w.writingChanges('blog', blank, incoming.content);
  const applied = w.applyWritingChanges(blank, changes.filter(c => !c.replacement));
  assert.deepEqual(blogSchema.parse(applied), complete);
  assert.deepEqual(w.validateWriting('blog', applied), []);
  assert.equal(w.writingComplete('blog', applied), true);
});
test('partial import fills empty fields and leaves existing text and arrays intact by default', () => {
  const current = { ...blank, title: 'Human title', faqs: [{ q: 'Existing?', a: 'Keep this.' }] };
  const input = { title: 'AI title', summary: 'New summary', faqs: [{ q: 'New?', a: 'Replace?' }] };
  const changes = w.writingChanges('blog', current, input);
  assert.equal(changes.filter(c => c.replacement).length, 2);
  const filled = w.applyWritingChanges(current, changes.filter(c => !c.replacement));
  assert.equal(filled.title, current.title);
  assert.deepEqual(filled.faqs, current.faqs);
  assert.equal(filled.summary, input.summary);
  const replaced = w.applyWritingChanges(current, changes.filter(c => c.path !== 'faqs'));
  assert.equal(replaced.title, input.title);
  assert.deepEqual(replaced.faqs, current.faqs);
});
test('empty scaffolding is fillable; optional emptiness does not reopen a complete page', () => {
  assert.equal(w.emptyWriting([{ kind: 'p', text: '  ' }]), true);
  assert.equal(w.emptyWriting([{ q: '', a: '' }]), true);
  assert.equal(w.emptyWriting([{ q: 'Typed question', a: '' }]), false);
  assert.equal(w.writingComplete('blog', blank), false);
  assert.equal(w.writingComplete('blog', complete), true);
  assert.equal(w.writingComplete('city', { h1: 'Heading', heroProse: 'Copy', seoTitle: 'Title', metaDescription: 'Description' }), true);
  assert.equal(w.writingComplete('service', { title: 'Prefilled title', seoTitle: 'Prefilled SEO', description: '', blocks: [] }), false);
});
test('unknown keys, unsafe shapes, protected fields, multiple pages and mismatched targets fail before editing', () => {
  for (const content of [{ status: 'PUBLISHED' }, { heroImage: { url: 'https://example.com/a.jpg' } }, { blocks: [{ kind: 'script', text: 'x' }] },
    { title: { text: 'Wrong' } }, { faqs: [{ question: 'Wrong keys', answer: 'Wrong keys' }] }, { blocks: [{ kind: 'p', text: 'Text', unknown: true }] }]) {
    assert.ok(w.parseWritingJson(file(content), target).issues.length, JSON.stringify(content));
  }
  assert.ok(w.parseWritingJson(JSON.stringify([JSON.parse(file({ title: 'Title' }))]), target).issues.length);
  assert.ok(w.parseWritingJson(file({ title: 'Title' }, { type: 'city', slug: target.slug }), target).issues.length);
  assert.ok(w.parseWritingJson(file({ title: 'Title' }, { type: 'blog', slug: 'different' }), target).issues.length);
  assert.ok(w.parseWritingJson('{"content":', target).issues[0].message.includes('quotes'));
  assert.ok(w.parseWritingJson(JSON.stringify({ ...JSON.parse(file({})), version: 999 }), target).issues.length);
});
test('common AI code fences and UTF-8 BOM are accepted without repairing ambiguous JSON', () => {
  assert.deepEqual(w.parseWritingJson(`\uFEFF\n\`\`\`json\n${file({ title: 'Title' })}\n\`\`\``, target).issues, []);
  assert.ok(w.parseWritingJson(file({ title: 'Title' }).replace('"Title"', '"Title",'), target).issues.length);
  assert.ok(w.parseWritingJson('x'.repeat(w.MAX_WRITING_BYTES + 1), target).issues[0].message.includes('too large'));
});
test('malformed deeply nested page identities return a correction without crashing', () => {
  const raw = '{"format":"wareongo-ai-writing","version":1,"page":' + '['.repeat(8000) + '0' + ']'.repeat(8000) + ',"content":{}}';
  assert.match(w.parseWritingJson(raw, target).issues[0].message, /page/);
});
test('collection limits and a total entry limit prevent unusable editor imports', () => {
  const service = { type: 'service', slug: 'warehouse-search' };
  const tooManyFaqs = file({ faqs: Array.from({ length: 101 }, () => ({ q: 'Q?', a: 'A.' })) }, service);
  assert.match(w.parseWritingJson(tooManyFaqs, service).issues[0].message, /100 entries/);
  const tooManyInputs = file({ blocks: Array.from({ length: 300 }, () => ({ kind: 'ul', items: Array(300).fill('x') })) });
  assert.ok(tooManyInputs.length < w.MAX_WRITING_BYTES);
  assert.match(w.parseWritingJson(tooManyInputs, target).issues[0].message, /too many editable entries/);
});
test('incomplete fields load safely and produce exact FAQ and table row corrections', () => {
  const content = { ...w.writingContent('blog', complete), faqs: [{ q: 'Question?', a: '' }], blocks: [{ kind: 'table', table: { headers: ['A', 'B'], rows: [['one']] } }] };
  const parsed = w.parseWritingJson(file(content), target);
  assert.deepEqual(parsed.issues, []);
  const issues = w.validateWriting('blog', { ...complete, ...parsed.content });
  assert.ok(issues.some(i => i.path === 'faqs.0.a' && i.label.includes('Answer')));
  assert.ok(issues.some(i => i.path === 'blocks.0.table.rows.0' && i.message.includes('Expected 2 cells; found 1')));
});
test('one-step undo preserves subsequent human edits and restores original blank values', () => {
  const changes = w.writingChanges('blog', blank, { title: 'AI title', summary: 'AI summary', author: 'Writer' });
  const applied = w.applyWritingChanges(blank, changes);
  const undone = w.undoWritingChanges({ ...applied, title: 'Human revision' }, changes);
  assert.equal(undone.title, 'Human revision'); assert.equal(undone.summary, ''); assert.equal(undone.author, null);
  assert.deepEqual(w.writingChanges('blog', applied, { title: 'AI title', summary: 'AI summary' }), []);
});
test('media cannot be added, removed or rewritten via copy imports', () => {
  const images = { kind: 'images', images: [{ url: 'https://example.com/photo.webp', alt: 'Warehouse', width: 100, height: 100 }], caption: '' };
  assert.ok(w.protectedWritingIssues('blog', blank, { ...blank, blocks: [images] }).length);
  assert.ok(w.protectedWritingIssues('blog', { blocks: [images] }, { blocks: [] }).length);
  assert.deepEqual(w.protectedWritingIssues('blog', { blocks: [images] }, { blocks: [{ kind: 'p', text: 'New text' }, images] }), []);
});
test('undo across corrected uploads preserves a human revision explicitly replaced later', () => {
  const first = w.writingChanges('blog', blank, { summary: 'First import' });
  const updated = w.writingChanges('blog', { ...blank, summary: 'First import' }, { summary: 'Corrected import' });
  const tracked = w.trackWritingChanges(first, updated);
  assert.equal(w.undoWritingChanges({ ...blank, summary: 'Corrected import' }, tracked).summary, '');
  const humanReplacement = w.writingChanges('blog', { ...blank, summary: 'Human revision' }, { summary: 'Third import' });
  const afterHuman = w.trackWritingChanges(tracked, humanReplacement);
  assert.equal(w.undoWritingChanges({ ...blank, summary: 'Third import' }, afterHuman).summary, 'Human revision');
});

test('save guard rejects changed destinations and rechecks page eligibility', async () => {
  const guard = loader({ '@/lib/auth': { requireUser: async () => ({}) }, './prisma': { prisma: { blog: { findUnique: async () => ({ ...complete, updatedAt: new Date('2026-10-08T00:00:00.000Z'), deployedContent: null }) } } } })('lib/ai-writing-guard.ts');
  const form = new FormData();
  assert.equal(await guard.writingSaveError(form, target), undefined);
  form.set('aiWritingImport', 'true'); form.set('aiWritingPage', JSON.stringify({ ...target, slug: 'wrong-page' }));
  assert.match(await guard.writingSaveError(form, target), /URL changed/);
  form.set('aiWritingPage', JSON.stringify(target)); form.set('expectedUpdatedAt', '2026-10-08T00:00:00.000Z');
  assert.match(await guard.writingSaveError(form, target), /required writing/);
});

const timestamp = '2026-10-08T00:00:00.000Z';
function serverHarness(row, { denied = false, pending = false } = {}) {
  let reads = 0;
  const model = { findUnique: async () => { reads++; return row; } };
  const imported = loader({
    './prisma': { prisma: { blog: model, servicePage: model, locationPage: model, micromarketPage: model, legalPage: model, adPage: model,
      $queryRaw: async () => pending ? [{ ref: 'blog/warehouse-guide' }] : [],
    } },
    '@/lib/auth': { requireUser: async () => { if (denied) throw new Error('unauthenticated'); } },
  });
  return { action: imported('app/(authed)/writing-actions.ts').checkWritingImport, reads: () => reads };
}
test('server allows new or partial pages and never mutates content', async () => {
  assert.deepEqual(await serverHarness(null).action(target, 'new'), { ok: true });
  assert.deepEqual(await serverHarness({ ...blank, title: 'Existing', updatedAt: new Date(timestamp), deployedContent: null }).action(target, timestamp), { ok: true });
});
test('server rejects completed, approved, deployed, stale and pending-import pages', async () => {
  const base = { ...blank, updatedAt: new Date(timestamp), deployedContent: null };
  for (const row of [{ ...base, ...complete }, { ...base, status: 'PUBLISHED' }, { ...base, deployedContent: complete }]) {
    assert.equal((await serverHarness(row).action(target, timestamp)).ok, false);
  }
  assert.equal((await serverHarness(base).action(target, 'new')).ok, false);
  assert.equal((await serverHarness(null).action(target, timestamp)).ok, false);
  const previous = process.env.CMS_CONTEXT_ENABLED;
  process.env.CMS_CONTEXT_ENABLED = 'true';
  try { assert.match((await serverHarness(base, { pending: true }).action(target, timestamp)).error, /Content imports/); }
  finally { if (previous === undefined) delete process.env.CMS_CONTEXT_ENABLED; else process.env.CMS_CONTEXT_ENABLED = previous; }
});
test('server authenticates before reading a page', async () => {
  const h = serverHarness(null, { denied: true });
  await assert.rejects(h.action(target, 'new'), /unauthenticated/);
  assert.equal(h.reads(), 0);
});
test('server reports invalid destinations clearly and hides infrastructure details', async () => {
  assert.match((await serverHarness(null).action({ ...target, slug: 'Bad Slug' }, 'new')).error, /address is invalid/);
  const imported = loader({ '@/lib/auth': { requireUser: async () => {} }, './prisma': { prisma: { blog: {
    findUnique: async () => { throw new Error('This page database password=secret'); },
  } } } });
  const result = await imported('app/(authed)/writing-actions.ts').checkWritingImport(target, 'new');
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /secret|database/);
});

function nativeHarness(row = null, count = 1) {
  const writes = [];
  let authentications = 0;
  const model = {
    findUnique: async () => row, findMany: async () => [],
    create: async query => { writes.push(query); return { id: 42 }; },
    updateMany: async query => { writes.push(query); return { count }; },
  };
  const database = { prisma: Object.fromEntries(['blog', 'locationPage', 'micromarketPage', 'servicePage', 'legalPage', 'adPage'].map(key => [key, model])) };
  const locations = { fetchLocations: async () => ({}), listFor: () => [], findLocation: () => ({ slug: 'sample' }) };
  const markets = { fetchMicromarkets: async () => ({ data: [] }), findMicromarket: () => ({ slug: 'sample' }) };
  return { writes, authentications: () => authentications, load: loader({
    './prisma': database, '@/lib/prisma': database,
    './locations-api': locations, '@/lib/locations-api': locations,
    './micromarkets-api': markets, '@/lib/micromarkets-api': markets,
    '@/lib/auth': { requireUser: async () => { authentications++; } },
    'next/navigation': { redirect: path => { throw Object.assign(new Error('redirect'), { path }); } },
    'next/cache': { refresh() {} },
  }) };
}
function nativeForm(page, content, stamp = 'new') {
  const data = new FormData();
  for (const [key, value] of Object.entries(content)) data.set(key, value === null ? key === 'thumbnail' ? 'null' : ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value));
  data.set('content', JSON.stringify(content)); data.set('id', '42'); data.set('intent', 'draft');
  data.set('expectedUpdatedAt', stamp); data.set('aiWritingImport', 'true'); data.set('aiWritingPage', JSON.stringify(page));
  return data;
}
const nativeCases = [
  { type: 'blog', content: complete, route: 'blogs', create: 'createBlog', update: 'updateBlog' },
  { type: 'city', content: { ...editorial, kind: 'CITY', slug: 'sample', status: 'DRAFT' }, route: 'locations', create: 'createLocation', update: 'updateLocation' },
  { type: 'state', content: { ...editorial, kind: 'STATE', slug: 'sample', status: 'DRAFT' }, route: 'locations', create: 'createLocation', update: 'updateLocation' },
  { type: 'micromarket', content: { ...editorial, citySlug: 'bengaluru', slug: 'sample', status: 'DRAFT' }, route: 'micromarkets', create: 'createMicromarket', update: 'updateMicromarket' },
  { type: 'service', content: { ...w.writingContent('service', complete), slug: 'warehouse-search' }, route: 'services', create: 'saveServicePage', update: 'saveServicePage' },
];
for (const item of nativeCases) test(`${item.type}: imported content reaches the real save action and completed saved pages reject further imports`, async () => {
  const page = { type: item.type, slug: item.content.slug, ...(item.type === 'micromarket' ? { citySlug: item.content.citySlug } : {}) };
  const path = `app/(authed)/${item.route}/actions.ts`;
  const h = nativeHarness();
  await assert.rejects(h.load(path)[item.create](undefined, nativeForm(page, item.content)), e => e.path.startsWith(`/${item.route}/`));
  assert.equal(h.writes.length, 1); assert.equal(h.authentications(), 1);
  const saved = item.type === 'service' ? { draftContent: item.content, publishedContent: null } : item.content;
  const blocked = nativeHarness({ ...saved, updatedAt: new Date(timestamp), deployedContent: null });
  const result = await blocked.load(path)[item.update](undefined, nativeForm(page, item.content, timestamp));
  assert.equal(result.ok, false); assert.match(result.error, /required writing/); assert.equal(blocked.writes.length, 0);
});
test('service imports can save an unfinished private draft but cannot approve it', async () => {
  const page = { type: 'service', slug: 'warehouse-search' };
  const content = { ...w.writingContent('service', blank), slug: page.slug, summary: 'An unfinished service introduction.' };
  const h = nativeHarness();
  const save = h.load('app/(authed)/services/actions.ts').saveServicePage;
  await assert.rejects(save(undefined, nativeForm(page, content)), e => e.path.endsWith('?saved=draft'));
  assert.equal(h.writes[0].data.publishedContent, undefined);
  const publish = nativeForm(page, content); publish.set('intent', 'publish');
  assert.equal((await save(undefined, publish)).ok, false); assert.equal(h.writes.length, 1);
});
test('an imported save still uses the native atomic revision check after eligibility succeeds', async () => {
  const row = { ...blank, updatedAt: new Date(timestamp), deployedContent: null };
  const h = nativeHarness(row, 0);
  const result = await h.load('app/(authed)/blogs/actions.ts').updateBlog(undefined, nativeForm(target, complete, timestamp));
  assert.equal(result.ok, false); assert.match(result.error, /changed somewhere else/);
  assert.equal(h.writes[0].where.updatedAt.toISOString(), timestamp);
});
