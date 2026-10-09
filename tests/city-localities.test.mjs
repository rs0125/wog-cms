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
      assert.ok(target, 'Unresolved component import: ' + id);
      return load(target);
    },
  }, { filename: fullPath });
  return loaded.exports;
}

const { CorridorPanel } = load('components/city/CityPanels.tsx');
const stats = (listings = 3) => ({ listings, rent: { min: 20, median: 25, max: 30 },
  size: { min: 1000, median: 2000, max: 3000 }, construction: [{ label: 'PEB', count: listings, share: 100 }] });
const locality = listings => ({ ...stats(listings), slug: 'north-belt', name: 'North Belt', direction: '', share: 12 });
const data = (extra = {}) => ({
  corridorMode: 'localities',
  localityTable: { eligible: true, minTaggedListings: 25, taggedListings: 25, baseListings: 25, grouping: 'micromarkets' },
  corridors: [locality(3)],
  segments: { large: stats(12), small: stats(18) },
  ...extra,
});
const render = value => renderToStaticMarkup(createElement(CorridorPanel, { data: value }));
const tableCells = html => [...html.matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)].map(([, cell]) => cell.replace(/<[^>]+>/g, ''));

test('an ineligible city has no locality table or table note but retains both size summaries', () => {
  const value = data({ localityTable: { ...data().localityTable, eligible: false, taggedListings: 24, baseListings: 24 } });
  const html = render(value);
  assert.doesNotMatch(html, /<table\b|city-corridor-table|distinct tagged listings|rows can overlap/);
  assert.match(html, /20,000 sq ft and up/);
  assert.match(html, /Under 20,000 sq ft/);
  assert.equal((html.match(/class="city-corridor-segment /g) ?? []).length, 2);
  assert.match(html, /12 listings/);
  assert.match(html, /18 listings/);
});

test('eligible localities render all six columns, with a three-listing row fully populated', () => {
  const html = render(data());
  assert.match(html, /<table\b/);
  assert.match(html, />Locality<\/th>/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 6);
  assert.deepEqual(tableCells(html), ['3', '₹25', '₹20–30', '2,000', 'PEB']);
  assert.match(html, /25 distinct tagged listings/);
  assert.doesNotMatch(html, /unassigned|Each listing is counted once in this table/);
});

test('one- and two-listing rows have genuinely empty statistic cells even if old figures are supplied', () => {
  for (const count of [1, 2]) {
    const html = render(data({ corridors: [locality(count)] }));
    assert.deepEqual(tableCells(html), [String(count), '', '', '', '']);
    assert.match(html, /North Belt/);
  }
});

test('unavailable statistics on larger rows still show missing-data markers', () => {
  const html = render(data({ corridors: [{ ...locality(3), rent: null, size: null, construction: [] }] }));
  assert.deepEqual(tableCells(html), ['3', '—', '—', '—', '—']);
});

test('Bengaluru explains its covered-listing base independently of the city tagged count', () => {
  const html = render(data({ localityTable: { ...data().localityTable, taggedListings: 520, baseListings: 489, grouping: 'areas' } }));
  assert.match(html, /489 distinct tagged listings in the areas shown/);
  assert.doesNotMatch(html, /520 distinct tagged listings/);
});

test('no rows or an older backend without gate metadata cannot render an empty or ungated table', () => {
  for (const extra of [{ corridors: [] }, { localityTable: undefined, corridorMode: 'corridors' }]) {
    const html = render(data(extra));
    assert.doesNotMatch(html, /<table\b|distinct tagged listings/);
    assert.match(html, /Under 20,000 sq ft/);
  }
});

