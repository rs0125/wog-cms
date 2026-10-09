// Isolated real-form audit. Uses the workspace's existing esbuild/Playwright
// installations. No authentication, database access, uploads or deployments.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const { build } = createRequire(path.resolve(root, '../wareongo-website/package.json'))('esbuild');
const { chromium } = createRequire(path.resolve(root, '../wareongo-cms-evals/package.json'))('playwright');
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'wareongo-ai-writing-'));
await build({ entryPoints: [path.join(root, 'tests/fixtures/ai-writing-browser.tsx')], outfile: path.join(out, 'app.js'), bundle: true,
  platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, plugins: [{ name: 'isolate-network', setup(build) {
    build.onResolve({ filter: /^@\/lib\/image-upload$/ }, () => ({ path: 'image-upload', namespace: 'image-upload' }));
    build.onLoad({ filter: /.*/, namespace: 'image-upload' }, () => ({ contents: `export function uploadImage(){return new Promise(resolve=>{window.resolveImageUpload=()=>resolve({url:'/test-image.webp',alt:'Warehouse',width:100,height:100});});}` }));
    build.onResolve({ filter: /^@\/app\/\(authed\)\// }, args => ({ path: args.path, namespace: 'actions' }));
    build.onLoad({ filter: /.*/, namespace: 'actions' }, () => ({ contents: `export async function checkWritingImport(){window.checks++; await new Promise(r=>setTimeout(r,window.checkDelay)); return window.checkResult;} export async function triggerSiteBuild(){throw new Error('Deployment forbidden in browser audit');}` }));
    build.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'next' }));
    build.onLoad({ filter: /.*/, namespace: 'next' }, args => ({ contents: args.path === 'next/link'
      ? `import React from 'react'; export default function Link(props){return React.createElement('a',props,props.children);} export const useLinkStatus=()=>({pending:false});`
      : `export const useRouter=()=>({refresh(){},push(){}}); export function unstable_rethrow(){};`, resolveDir: root }));
  } }] });
const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(await fs.readFile(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
await fs.writeFile(path.join(out, 'app.css'), css.css);
const server = createServer(async (req, res) => {
  if (req.url.split('?')[0] === '/app.js' || req.url === '/app.css') {
    res.setHeader('Content-Type', req.url === '/app.css' ? 'text/css' : 'text/javascript'); res.end(await fs.readFile(path.join(out, req.url.split('?')[0].slice(1))));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
  page.setDefaultTimeout(10000);
  const open = async (query = '') => { await page.goto(base + '/?' + query); await page.locator('[data-ai-writing] > summary').click(); };
  const upload = async (changes = {}, full = true) => {
    // Build uploads independently of the production exporter to test its contract.
    const text = await page.evaluate(({ changes, full }) => JSON.stringify({ format: 'wareongo-ai-writing', version: 1, page: window.target,
      content: { ...(full ? window.sample : {}), ...changes } }), { changes, full });
    await page.getByLabel('Choose page JSON').setInputFiles({ name: 'page.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  };
  const apply = () => page.getByRole('button', { name: /Apply (selected changes|to editor and fix fields)/ }).click();
  const value = (id) => page.locator(`#${id}`).inputValue();
  const applied = () => page.getByRole('button', { name: 'Undo import', exact: true }).waitFor();

  await open();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download writing template' }).click();
  const downloaded = await downloadPromise;
  assert.match(downloaded.suggestedFilename(), /blog-warehouse-guide-writing.json/);
  const template = JSON.parse(await fs.readFile(await downloaded.path(), 'utf8'));
  assert.ok(template.schema.properties.blocks); assert.match(template.guidance.summary.guidance, /self-contained answer/);
  assert.equal(template.content.status, undefined); assert.equal(template.reference, undefined);
  await upload(); await apply(); await applied();
  assert.equal(await value('title'), 'AI heading');
  assert.equal(await page.locator('input[name="aiWritingImport"]').inputValue(), 'true');
  assert.equal(await page.evaluate(() => window.saves), 0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByText('Simulated save failure; your edits are kept.').waitFor();
  assert.equal(await value('title'), 'AI heading');
  await upload({ summary: 'Corrected summary' }); await apply();
  await page.waitForFunction(() => document.getElementById('summary').value === 'Corrected summary');
  await page.locator('#title').fill('Human revision');
  await page.getByRole('button', { name: 'Undo import', exact: true }).click();
  assert.equal(await value('title'), 'Human revision'); assert.equal(await value('summary'), '');
  console.log('PASS: download, import, failed-save retention, corrected reupload and undo');

  await open('partial=1'); await upload();
  await page.getByText('Review replacements (1)', { exact: true }).click();
  const replace = page.getByRole('checkbox', { name: 'Replace Page heading', exact: true });
  assert.equal(await replace.isChecked(), false);
  await page.locator('[data-ai-writing]').screenshot({ path: path.join(out, 'review-desktop.png') });
  await apply(); await applied(); assert.equal(await value('title'), 'Human heading');
  await upload(); await page.getByText('Review replacements (1)', { exact: true }).click(); await replace.check(); await apply();
  await page.waitForFunction(() => document.getElementById('title').value === 'AI heading');
  console.log('PASS: existing copy preserved by default; selected replacement applies');

  await open('partial=1'); await upload(); await page.getByText('Review replacements (1)', { exact: true }).click(); await replace.check();
  await page.locator('#title').fill('Changed during review');
  assert.equal(await replace.isChecked(), false);
  await page.evaluate(() => { window.checkDelay = 250; });
  await apply(); await page.locator('#summary').fill('Typed during server check');
  await page.getByText('The editor changed while this import was being checked.', { exact: false }).waitFor();
  assert.equal(await value('summary'), 'Typed during server check');
  console.log('PASS: stale diff selections and changes during verification cannot overwrite edits');

  await open(); await upload({ faqs: [{ q: 'Question?', a: '' }] }); await apply(); await applied();
  await page.getByRole('region', { name: 'Writing corrections' }).getByRole('button', { name: 'Go to field' }).click();
  await page.waitForFunction(() => document.activeElement?.dataset.writingPath === 'faqs.0.a');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.writingPath), 'faqs.0.a');
  await page.locator('[data-writing-path="faqs.0.a"]').fill('Corrected answer.');
  assert.equal(await page.getByRole('region', { name: 'Writing corrections' }).count(), 0);
  await page.screenshot({ path: path.join(out, 'corrected-desktop.png'), fullPage: true });
  console.log('PASS: invalid FAQ can be fixed in the real editor with focus navigation');

  await open(); await upload({ blocks: [{ kind: 'unknown', text: 'Bad' }] }, false);
  assert.equal(await page.getByRole('button', { name: /Apply (selected|to editor)/ }).count(), 0);
  assert.equal(await value('title'), '');
  await open('complete=1');
  assert.equal(await page.getByRole('button', { name: 'Upload JSON', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Download writing template' }).isEnabled(), true);
  console.log('PASS: malformed blocks rejected and completed pages locked');

  await open('blank-slug=1');
  assert.equal(await page.getByRole('button', { name: 'Download writing template' }).isDisabled(), true);
  await page.locator('#slug').fill('Invalid Slug');
  await page.getByRole('button', { name: 'Set page URL', exact: true }).click();
  await page.waitForFunction(() => document.activeElement.id === 'slug');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'slug');
  await page.locator('#slug').fill('warehouse-guide');
  await page.getByRole('button', { name: 'Paste JSON', exact: true }).click();
  await page.getByLabel('Page JSON', { exact: true }).fill('{"format":');
  await page.getByText('Could not read this JSON.', { exact: false }).waitFor();
  await page.getByLabel('Page JSON', { exact: true }).fill(JSON.stringify({ format: 'wareongo-ai-writing', version: 1, page: { type: 'blog', slug: 'another-page' }, content: { title: 'Wrong page' } }));
  await page.getByText('This file does not identify this page.', { exact: false }).waitFor();
  assert.equal(await value('title'), '');
  console.log('PASS: new-page setup, invalid slug focus, malformed paste and wrong-page recovery');

  await open(); await upload({ summary: 'Previous upload' }, false);
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.fileReads = [];
    File.prototype.text = function() {
      return new Promise((resolve, reject) => window.fileReads.push({
        resolve: () => original.call(this).then(resolve), reject: () => reject(new Error('Unreadable file')),
      }));
    };
  });
  await upload({ summary: 'Cancelled upload' }, false);
  await page.getByText('Reading JSON…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Apply (selected|to editor)/ }).count(), 0);
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await upload({ summary: 'Newest upload' }, false);
  await page.evaluate(() => window.fileReads[1].resolve());
  await page.getByRole('button', { name: /Apply (selected|to editor)/ }).waitFor();
  await page.evaluate(() => window.fileReads[0].resolve());
  await apply(); await applied(); assert.equal(await value('summary'), 'Newest upload');
  await page.waitForFunction(() => document.activeElement.getAttribute('role') === 'status');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'status');
  await upload({ title: 'Cannot read' }, false);
  await page.evaluate(() => window.fileReads[2].reject());
  await page.getByText('Could not read that file.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Apply (selected|to editor)/ }).count(), 0);
  console.log('PASS: cancelled/failed file reads cannot revive an old upload; focus survives applying');

  await open(); await upload();
  await page.evaluate(() => { window.checkResult = { ok: false, error: 'This page changed after you opened it.' }; });
  await apply(); await page.getByText('This page changed after you opened it.', { exact: true }).waitFor();
  assert.equal(await value('title'), '');
  const recoveryDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download uploaded JSON', exact: true }).click();
  const recovered = JSON.parse(await fs.readFile(await (await recoveryDownload).path(), 'utf8'));
  assert.equal(recovered.content.title, 'AI heading');
  await page.evaluate(() => { window.checkResult = { ok: true }; });
  await apply(); await applied(); assert.equal(await value('title'), 'AI heading');
  console.log('PASS: failed eligibility checks preserve recoverable JSON and allow retry');

  await open(); await upload({ blocks: [{ kind: 'table', table: { headers: ['A', 'B'], rows: [['one'], ['two', 'three', 'extra']] } }] });
  await apply(); await applied();
  await page.getByRole('region', { name: 'Writing corrections' }).getByRole('button', { name: 'Go to field' }).first().click();
  await page.waitForFunction(() => document.activeElement.dataset.writingPath === 'blocks.0.table.rows.0.0');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.writingPath), 'blocks.0.table.rows.0.0');
  await page.getByRole('button', { name: 'Add 1 empty cell', exact: true }).click();
  await page.getByRole('button', { name: 'Remove 1 extra cell', exact: true }).click();
  assert.deepEqual(JSON.parse(await page.locator('input[name="blocks"]').inputValue())[0].table.rows, [['one', ''], ['two', 'three']]);
  assert.equal(await page.getByRole('region', { name: 'Writing corrections' }).count(), 0);
  for (const [block, field] of [[{ kind: 'ul', items: ['Good', ''] }, 'blocks.0.items.1'],
    [{ kind: 'table', table: { headers: ['A', ''], rows: [['one', 'two']] } }, 'blocks.0.table.headers.1']]) {
    await open(); await upload({ blocks: [block] }); await apply(); await applied();
    await page.getByRole('region', { name: 'Writing corrections' }).getByRole('button', { name: 'Go to field' }).click();
    await page.waitForFunction(path => document.activeElement.dataset.writingPath === path, field);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.writingPath), field);
    await page.locator(`[data-writing-path="${field}"]`).fill('Corrected');
    assert.equal(await page.getByRole('region', { name: 'Writing corrections' }).count(), 0);
  }
  console.log('PASS: uneven table rows repair in place; list and header corrections focus the exact input');

  for (const kind of ['blog', 'service']) {
    await open(`kind=${kind}`);
    await page.getByRole('button', { name: '+ Images', exact: true }).click();
    const imageBlock = page.locator('[data-writing-path^="blocks."]').filter({ has: page.locator('input[type="file"]') });
    await imageBlock.locator('input[type="file"]').setInputFiles({ name: 'warehouse.png', mimeType: 'image/png', buffer: Buffer.from('synthetic mocked upload') });
    await page.getByRole('button', { name: 'Uploading image…', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Upload JSON', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '+ Paragraph', exact: true }).click();
    const paragraphs = page.locator('textarea[data-writing-path$=".text"]');
    await paragraphs.last().fill('Typed while the photo was uploading');
    await imageBlock.locator('textarea').fill('Caption typed during upload');
    await page.evaluate(() => window.resolveImageUpload());
    await page.getByRole('button', { name: 'Save draft', exact: true }).waitFor();
    const content = kind === 'blog' ? JSON.parse(await page.locator('input[name="blocks"]').inputValue())
      : JSON.parse(await page.locator('input[name="content"]').inputValue()).blocks;
    assert.equal(content.at(-1).text, 'Typed while the photo was uploading');
    assert.equal(content.find(b => b.kind === 'images').caption, 'Caption typed during upload');
    assert.equal(content.find(b => b.kind === 'images').images.length, 1);
  }
  console.log('PASS: pending photo uploads block imports/saves and preserve concurrent block and caption edits');

  for (const kind of ['blog', 'city', 'state', 'micromarket', 'service', 'legal', 'ad']) {
    await open(`kind=${kind}`);
    if (kind === 'legal' || kind === 'ad') assert.equal(await page.getByRole('button', { name: 'Upload JSON', exact: true }).isDisabled(), true);
    const field = kind === 'ad' ? 'copy-heroHeading' : ['city', 'state', 'micromarket'].includes(kind) ? 'h1' : 'title';
    const currentCopy = `Unsaved ${kind} heading`;
    await page.locator(`#${field}`).fill(currentCopy);
    const exportPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download writing template' }).click();
    const exported = JSON.parse(await fs.readFile(await (await exportPromise).path(), 'utf8'));
    assert.equal(exported.page.type, kind);
    assert.equal(kind === 'ad' ? exported.content.copy.heroHeading : exported.content[field], currentCopy);
    assert.equal(exported.schema.additionalProperties, false);
    assert.equal(exported.content.status, undefined);
    if (kind === 'city') { assert.ok(exported.schema.properties.corridorProse); assert.equal(exported.schema.properties.citiesHeading, undefined); }
    if (kind === 'state') { assert.equal(exported.schema.properties.citiesHeading, undefined); assert.equal(exported.schema.properties.corridorProse, undefined); }
    if (kind === 'micromarket') assert.equal(exported.page.citySlug, 'bengaluru');
    if (kind === 'service') assert.equal(exported.schema.allOf[0].properties.title.minLength, 1);
    if (kind === 'ad') assert.equal(exported.schema.properties.heroSteps.maxItems, 4);
  }
  console.log('PASS: all seven page types download their own schema and latest unsaved copy, including import-locked pages');

  for (const kind of ['city', 'state', 'micromarket', 'service']) {
    await open(`kind=${kind}`);
    await upload(kind === 'service' ? { summary: 'A service introduction.', blocks: [{ kind: 'p', text: 'Useful service copy.' }] }
      : { h1: 'Location heading', heroProse: 'Location introduction.', complianceProse: kind === 'city' ? 'Check the relevant documents.' : undefined }, false);
    await apply(); await applied();
    assert.equal(await value(kind === 'service' ? 'summary' : 'heroProse'), kind === 'service' ? 'A service introduction.' : 'Location introduction.');
  }
  console.log('PASS: city, state, micromarket and service form adapters');

  await page.setViewportSize({ width: 390, height: 844 });
  await open('partial=1'); await upload(); await page.getByText('Review replacements (1)', { exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('[data-ai-writing]').screenshot({ path: path.join(out, 'review-mobile.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await apply(); await applied();
  assert.equal(await value('title'), 'Human heading');
  assert.equal(await value('summary'), 'AI summary');
  assert.deepEqual(errors, []);
  console.log(`PASS: mobile 390/320px, no browser errors. Screenshots: ${out}`);
} finally { await browser?.close(); server.close(); }
