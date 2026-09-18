import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const fullPath = path.resolve(root, file);
  if (cache.has(fullPath)) return cache.get(fullPath);
  const loaded = { exports: {} };
  cache.set(fullPath, loaded.exports);
  const compiled = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports: loaded.exports, module: loaded, console,
    require(id) {
      if (!id.startsWith('.') && !id.startsWith('@/')) return require(id);
      const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(fullPath), id);
      const target = ['.ts', '.tsx'].map(ext => base + ext).find(p => fs.existsSync(p));
      return load(target);
    },
  }, { filename: fullPath });
  return loaded.exports;
}

const { toggleTextFormat } = load('lib/text-formatting.ts');
const { plainInlineText } = load('lib/inline-format.ts');
const InlineText = load('components/InlineText.tsx').default;
const { ContentBlock } = load('components/ContentPreview.tsx');
const { LegalInline } = load('components/LegalContent.tsx');
const render = (text, Component = InlineText) => renderToStaticMarkup(createElement(Component, { text }));

test('formatting a selection preserves surrounding text and can be removed', () => {
  for (const format of ['bold', 'italic']) {
    const next = toggleTextFormat('Find warehouse space', 5, 14, format);
    assert.equal(next.value, format === 'bold' ? 'Find **warehouse** space' : 'Find *warehouse* space');
    assert.equal(next.value.slice(next.start, next.end), 'warehouse');
    const removed = toggleTextFormat(next.value, next.start, next.end, format);
    assert.equal(removed.value, 'Find warehouse space');
    assert.equal(removed.start, 5);
    assert.equal(removed.end, 14);
  }
});

test('bold and italic combine and can each be removed independently', () => {
  for (const first of ['bold', 'italic']) {
    const second = first === 'bold' ? 'italic' : 'bold';
    const one = toggleTextFormat('warehouse', 0, 9, first);
    const both = toggleTextFormat(one.value, one.start, one.end, second);
    assert.equal(both.value, '***warehouse***');
    assert.equal(render(both.value), '<strong><em>warehouse</em></strong>');
    const removed = toggleTextFormat(both.value, both.start, both.end, first);
    assert.equal(removed.value, second === 'bold' ? '**warehouse**' : '*warehouse*');
  }
});

test('selection including markers toggles that style without losing the other style', () => {
  assert.equal(toggleTextFormat('**text**', 0, 8, 'bold').value, 'text');
  assert.equal(toggleTextFormat('**text**', 0, 8, 'italic').value, '***text***');
  assert.equal(toggleTextFormat('***text***', 0, 10, 'italic').value, '**text**');
});

test('empty selection inserts replaceable text and whitespace remains outside emphasis', () => {
  const next = toggleTextFormat('', 0, 0, 'bold');
  assert.equal(next.value.slice(next.start, next.end), 'bold text');
  assert.equal(next.value, '**bold text**');
  assert.equal(toggleTextFormat('  ready now \n', 0, 13, 'italic').value, '  *ready now* \n');
});

for (const [text, html, plain] of [
  ['**Bold** and *italic*', '<strong>Bold</strong> and <em>italic</em>', 'Bold and italic'],
  ['**bold _italic_ words**', '<strong>bold <em>italic</em> words</strong>', 'bold italic words'],
  ['**bold *italic***', '<strong>bold <em>italic</em></strong>', 'bold italic'],
  ['*italic **bold** words*', '<em>italic <strong>bold</strong> words</em>', 'italic bold words'],
  ['***both***', '<strong><em>both</em></strong>', 'both'],
  ['ware*house*', 'ware<em>house</em>', 'warehouse'],
  ['**a** *b*', '<strong>a</strong> <em>b</em>', 'a b'],
  ['plain_text_here, 2 * 3, **unfinished', 'plain_text_here, 2 * 3, **unfinished', 'plain_text_here, 2 * 3, **unfinished'],
  ['<img src=x onerror=alert(1)> **safe**', '&lt;img src=x onerror=alert(1)&gt; <strong>safe</strong>', '<img src=x onerror=alert(1)> safe'],
  ['\\*literal\\*', '*literal*', '*literal*'],
]) test('renders stored emphasis safely: ' + text, () => {
  assert.equal(render(text), html);
  assert.equal(plainInlineText(text), plain);
});

test('paragraphs, lists, headings, tables and captions render emphasis', () => {
  for (const block of [
    { kind: 'p', text: '**Bold** *italic*' },
    { kind: 'h2', text: '**Bold** *italic*' },
    { kind: 'h3', text: '**Bold** *italic*' },
    { kind: 'ul', items: ['**Bold** *italic*'] },
    { kind: 'ol', items: ['**Bold** *italic*'] },
    { kind: 'table', table: { headers: ['**Bold**'], rows: [['*italic*']] } },
    { kind: 'images', images: [{ url: '/photo.webp', alt: '**literal alt**', width: 100, height: 100 }], caption: '**Bold** *italic*' },
  ]) {
    const html = renderToStaticMarkup(createElement(ContentBlock, { block }));
    assert.ok(html.includes('<strong>Bold</strong>'));
    assert.ok(html.includes('<em>italic</em>'));
    if (block.kind === 'images') assert.ok(html.includes('alt="**literal alt**"'));
  }
});

test('legal copy keeps safe links and formats their labels and surrounding words', () => {
  const html = render('**Contact [*support*](mailto:sales@wareongo.com)**', LegalInline);
  assert.equal(html, '<strong>Contact <a href="mailto:sales@wareongo.com" class="text-wareongo-blue hover:underline break-words"><em>support</em></a></strong>');
  for (const href of ['javascript:alert', '//evil.example', '/\\evil.example', 'data:text/html,evil']) {
    assert.equal(render('[**link**](' + href + ')', LegalInline), '<strong>link</strong>');
  }
});

test('formatting stays in the existing save payload and word counts use visible text', () => {
  const { blogBlockSchema } = load('lib/blog-schema.ts');
  const { countWords } = load('lib/editorial-schema.ts');
  const stored = JSON.parse(JSON.stringify({ kind: 'p', text: '**Ready** *now*' }));
  assert.deepEqual(JSON.parse(JSON.stringify(blogBlockSchema.parse(stored))), stored);
  assert.equal(countWords(stored.text), 2);
  assert.equal(render(stored.text), '<strong>Ready</strong> <em>now</em>');
});
