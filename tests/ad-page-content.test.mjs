import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAdPage } from '../lib/ad-page-content.mjs';

const page = JSON.parse(fs.readFileSync(new URL('../content/ad-pages/bangalore.json', import.meta.url), 'utf8'));
test('old saved revisions gain process steps without retaining the removed hero copy', () => {
  const old = structuredClone(page);
  delete old.heroSteps;
  old.copy.heroIntro = 'Previous introduction';
  old.heroPoints = [{ value: '611', label: 'live listings' }];
  assert.deepEqual(parseAdPage(old), page);
  assert.equal(old.heroSteps, undefined, 'Reading must not mutate a saved revision');
});
test('edited process steps survive, unfinished labels stay draft-only', () => {
  const edited = structuredClone(page);
  edited.heroSteps[0] = 'Get in touch';
  assert.deepEqual(parseAdPage(edited).heroSteps, edited.heroSteps);
  edited.heroSteps[0] = '';
  assert.equal(parseAdPage(edited, { draft: true }).heroSteps[0], '');
  assert.throws(() => parseAdPage(edited), /Name each process step/);
  for (const steps of [null, [], ['Enquire'], [...page.heroSteps, 'Extra']]) {
    assert.throws(() => parseAdPage({ ...page, heroSteps: steps }, { draft: true }));
  }
});

test('older benefits keep edited copy while gaining three cards and the section image', () => {
  const old = structuredClone(page);
  old.benefits = old.benefits.slice(0, 3);
  old.benefits[0].title = 'A saved benefit title';
  old.benefits[0].body = 'Copy that must survive the layout update.';
  delete old.images.why;
  const before = structuredClone(old);
  const result = parseAdPage(old);
  assert.deepEqual(result.benefits.slice(0, 3), old.benefits);
  assert.deepEqual(result.benefits.slice(3), page.benefits.slice(3));
  assert.deepEqual(result.images.why, page.images.why);
  assert.deepEqual(old, before, 'Reading must not mutate a saved revision');

  result.benefits[3] = { ...result.benefits[3], title: 'New benefit', body: 'New supporting copy.' };
  result.images.why = { ...result.images.why, url: 'https://images.example.test/why.webp', alt: 'An edited section image' };
  assert.deepEqual(parseAdPage(result), result);
  for (const benefits of [[], page.benefits.slice(0, 4), Array(3).fill(page.benefits[0])]) {
    assert.throws(() => parseAdPage({ ...page, benefits }));
  }
});
