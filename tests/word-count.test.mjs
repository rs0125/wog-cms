import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const fullPath = path.resolve(root, file);
  if (cache.has(fullPath)) return cache.get(fullPath);
  const loaded = { exports: {} };
  cache.set(fullPath, loaded.exports);
  const compiled = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports: loaded.exports, module: loaded, require(id) {
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(fullPath), id);
    return id.endsWith('.mjs') ? require(base) : load(`${base}.ts`);
  } }, { filename: fullPath });
  return loaded.exports;
}
const { countWords, countBlockWords, blockWordSections, totalWords } = load('lib/word-count.ts');
const { articleWordSections, legalWordSections, editorialWordSections, adPageWordSections } = load('lib/page-word-counts.ts');
const plain = value => JSON.parse(JSON.stringify(value));

test('empty copy, whitespace and punctuation count as zero', () => {
  for (const text of ['', ' \t\n\u00a0', null, undefined, '— & *** …']) assert.equal(countWords(text), 0);
  assert.equal(countWords('one\ttwo\nthree\u00a0four'), 4);
});

test('counts readable emphasis, numbers and international copy without splitting contractions', () => {
  assert.equal(countWords('**Ready _right now_** at 10,000 sq-ft — it’s open'), 8);
  assert.equal(countWords('गोदाम किराए के लिए'), 4);
  assert.equal(countWords('ware*house* space'), 2);
  assert.equal(countWords('**unfinished copy'), 2);
});

test('legal links count their labels, including adjacent labels, rather than destinations', () => {
  assert.equal(countWords('[support](https://example.test/a)[team](mailto:a@example.test)', { links: true }), 1);
  assert.equal(countWords('Contact [**our team**](mailto:a@example.test) today', { links: true }), 4);
});

const blocks = [
  { kind: 'p', text: 'Opening copy' },
  { kind: 'h2', text: '**Storage options**' },
  { kind: 'p', text: 'Ready for occupancy' },
  { kind: 'h3', text: 'Small units' },
  { kind: 'ul', items: ['Easy access', 'Loading docks'] },
  { kind: 'ol', items: ['Book now'] },
  { kind: 'table', table: { headers: ['Unit size', 'Rent'], rows: [['10,000 sq-ft', '20'], ['', '30']] } },
  { kind: 'images', caption: '*Loading area*', images: [{ url: 'https://example.test/photo.webp', alt: 'Do not count this description', width: 100, height: 100 }] },
  { kind: 'h2', text: 'Next steps' },
  { kind: 'p', text: 'Contact us' },
];

test('counts every supported block, including table cells and captions, once', () => {
  assert.deepEqual(blocks.map(block => countBlockWords(block)), [2, 2, 3, 2, 4, 2, 7, 2, 2, 2]);
  assert.equal(countBlockWords({ kind: 'images', images: [], caption: '' }), 0);
});

test('section totals include H3 subsections without double-counting or changing source blocks', () => {
  const before = structuredClone(blocks);
  const sections = blockWordSections(blocks);
  assert.deepEqual(plain(sections), [
    { id: 'content-0', label: 'Opening content', words: 2 },
    { id: 'content-1', label: 'Storage options', words: 22 },
    { id: 'content-8', label: 'Next steps', words: 4 },
  ]);
  assert.equal(totalWords(sections), 28);
  assert.deepEqual(blocks, before);
});

test('empty drafts, missing H2 headings and duplicate headings retain separate sections', () => {
  assert.equal(totalWords(blockWordSections([])), 0);
  const sections = blockWordSections([
    { kind: 'h3', text: '' }, { kind: 'p', text: 'Draft copy' },
    { kind: 'h3', text: 'Details' }, { kind: 'h3', text: 'Details' },
  ]);
  assert.deepEqual(plain(sections).map(({ label, words }) => [label, words]), [['Untitled section', 2], ['Details', 1], ['Details', 1]]);
  assert.equal(new Set(sections.map(section => section.id)).size, 3);
});

test('reordering and deleting content moves words to the correct section', () => {
  const changed = [blocks[1], blocks[2], blocks[8], blocks[0]];
  assert.deepEqual(plain(blockWordSections(changed)).map(section => section.words), [5, 4]);
  changed.pop();
  assert.equal(totalWords(blockWordSections(changed)), 7);
});

test('blogs and services include title, summary and both FAQ fields while excluding metadata', () => {
  const content = {
    title: 'Warehouse guide', summary: '**Quick** answer', blocks,
    faqs: [{ q: 'Where to rent?', a: 'Contact **our team**' }],
    seoTitle: 'Do not count SEO', description: 'Do not count metadata', author: 'Author name',
    keywords: ['more metadata'], related: ['other-blog'],
  };
  assert.equal(totalWords(articleWordSections(content)), 38);
  assert.equal(articleWordSections(content, 'Introduction')[1].label, 'Introduction');
  assert.equal(totalWords(articleWordSections({ ...content, faqs: [] })), 32);
});

test('legal pages include closing notices and exclude dates and SEO', () => {
  const sections = legalWordSections({
    title: 'Privacy policy', blocks: [{ kind: 'p', text: 'Contact [our team](mailto:a@example.test)' }],
    notice: '**Please** read carefully', seoTitle: 'Do not count', updated: '2026-09-28',
  });
  assert.equal(totalWords(sections), 8);
});

test('location totals include authored headings and FAQs, with city-only copy scoped correctly', () => {
  const content = {
    h1: 'Warehouse guide', heroEyebrow: 'Bangalore', heroProse: 'Ready to rent',
    marketHeading: 'Local market', marketProse: 'Industrial area',
    rentsHeading: null, rentsProse: '', specProse: null,
    corridorHeading: 'Main corridors', corridorProse: 'Nearby transport',
    complianceHeading: 'Local approvals', complianceProse: 'Check documents',
    inventoryHeading: 'Available warehouses', faqs: [{ q: 'Where?', a: 'Near Bangalore' }],
    name: 'Internal display name', seoTitle: 'Metadata', metaDescription: 'More metadata',
    heroImage: { alt: 'Image description' }, statOverrides: { docksMedian: 10 },
  };
  assert.equal(totalWords(editorialWordSections(content, false)), 15);
  assert.equal(totalWords(editorialWordSections(content, true)), 23);
  assert.equal(editorialWordSections(content, false).some(section => section.id === 'corridors'), false);
});

test('ad pages count nested card, table, process and figure copy but exclude settings and image metadata', () => {
  const content = JSON.parse(fs.readFileSync(path.join(root, 'content/ad-pages/bangalore.json'), 'utf8'));
  content.copy = Object.fromEntries(Object.keys(content.copy).map(key => [key, '']));
  content.copy.seoTitle = 'Do not count this title';
  content.copy.metaDescription = 'Do not count this metadata';
  content.copy.heroHeading = 'Warehouse space';
  content.heroSteps = ['Step one', '', '', ''];
  content.benefits = [{ id: 'test', title: 'Benefit title', body: 'Benefit copy' }];
  content.services = [{ id: 'test', title: 'Service title', body: 'Service copy', cta: 'Learn more' }];
  content.audiences = [
    { id: '3pls', title: 'Audience title', body: 'Audience copy', primaryCta: 'Talk now', secondaryCta: 'Learn more' },
    { id: 'others', title: '', body: '', primaryCta: '', secondaryCta: 'Not rendered' },
  ];
  content.areaRows = [{ need: 'Near airport', areas: ['North Bangalore', 'Devanahalli'] }];
  content.overviewParagraphs = ['Overview copy'];
  content.overviewStats = [{ value: '500+', label: 'Available warehouses' }];
  const sections = adPageWordSections(content);
  assert.equal(totalWords(sections), 32);
  assert.deepEqual(plain(sections).filter(section => section.words).map(({ id, words }) => [id, words]), [
    ['hero', 4], ['areas', 5], ['why', 4], ['services', 6], ['audiences', 8], ['overview', 5],
  ]);
  assert.equal(sections.some(section => section.id === 'settings'), false);
});
