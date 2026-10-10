import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loader, fixtures, editorial } from './helpers/agent-cms.mjs';

const load = loader();
const { default: Preview, WebsitePreviewProvider } = load('components/WebsitePreview.tsx');
for (const name of ['Blog', 'Service', 'Legal']) test(`${name} uses the website frame without serializing the draft into its HTML`, () => {
  const Component = load(`components/${name}Preview.tsx`).default;
  const content = { ...fixtures[name.toLowerCase()].content, title: 'Private unsaved title' };
  const child = createElement(Component, name === 'Blog' ? { blog: content } : { content });
  const html = renderToStaticMarkup(createElement(WebsitePreviewProvider, { value: 'https://preview.example.test' }, child));
  assert.match(html, /src="https:\/\/preview.example.test\/preview\/cms"/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
  assert.doesNotMatch(html, /Private unsaved title/);
});
test('editorial previews use the same real renderer and expose no draft in the URL', () => {
  const html = renderToStaticMarkup(createElement(Preview, { content: { type: 'city', content: { ...editorial, h1: 'Private heading' } } }));
  assert.match(html, /src="https:\/\/wareongo.com\/preview\/cms"/);
  assert.doesNotMatch(html, /Private heading|warehouse-card|city-corridor-table/);
});
test('backend canonical city slugs work in the editor, links, AI templates and agent import targets', () => {
  const slug = 'chhatrapati-sambhajinagar--aurangabad';
  const content = load('lib/location-schema.ts').locationSchema.parse({ ...editorial, kind: 'CITY', slug, status: 'DRAFT' });
  assert.equal(content.slug, slug);
  assert.equal(load('lib/locations-api.ts').locationOverviewPath({ kind: 'CITY', slug, stateSlug: 'maharashtra', hasPage: true }), `/overview/maharashtra/${slug}`);
  assert.equal(load('lib/ai-writing.ts').writingTargetSchema.safeParse({ type: 'city', slug }).success, true);
  const { targetSchema } = load('lib/agent-cms/schema.ts');
  assert.equal(targetSchema.safeParse({ page_type: 'city', slug }).success, true);
  for (const bad of ['../city', 'city/', 'city?x=1', 'city#fragment', '-city', 'city-']) {
    assert.equal(targetSchema.safeParse({ page_type: 'city', slug: bad }).success, false);
  }
  assert.equal(targetSchema.safeParse({ page_type: 'blog', slug: 'bad--blog' }).success, false);
});
