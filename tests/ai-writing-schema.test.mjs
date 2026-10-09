import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { loader, fixtures } from './helpers/agent-cms.mjs';

const load = loader();
const writing = load('lib/ai-writing.ts');
const blog = load('lib/blog-schema.ts');
const location = load('lib/location-schema.ts');
const micromarket = load('lib/micromarket-schema.ts');
const service = load('lib/service-schema.ts');
const legal = load('lib/legal-schema.ts');
const ad = load('content/ad-pages/bangalore.json');
const adRules = load('lib/ad-page-content.mjs');
const overview = ['seoTitle', 'metaDescription', 'h1', 'heroEyebrow', 'heroProse', 'marketHeading', 'marketProse', 'rentsHeading', 'rentsProse', 'specHeading', 'specProse', 'inventoryHeading', 'faqs'];
const managedOverview = ['slug', 'name', 'heroImage', 'marketImage', 'relatedBlogs', 'statOverrides', 'status'];
const cases = {
  blog: { source: blog.blogSchema, fields: ['title', 'seoTitle', 'description', 'summary', 'author', 'keywords', 'blocks', 'faqs'],
    managed: ['slug', 'related', 'thumbnail', 'datePublished', 'dateModified', 'sortOrder', 'status'] },
  city: { source: location.locationSchema.in, fields: [...overview, 'corridorHeading', 'corridorProse', 'complianceHeading', 'complianceProse'],
    managed: [...managedOverview, 'kind', 'citiesHeading', 'stateCities'] },
  state: { source: location.locationSchema.in, fields: [...overview, 'citiesHeading', 'complianceHeading', 'complianceProse'],
    managed: [...managedOverview, 'kind', 'corridorHeading', 'corridorProse', 'stateCities'] },
  micromarket: { source: micromarket.micromarketSchema, fields: overview, managed: [...managedOverview, 'citySlug'] },
  service: { source: service.serviceDraftSchema, fields: ['title', 'seoTitle', 'description', 'summary', 'keywords', 'blocks', 'faqs'], managed: ['slug'] },
  legal: { source: legal.legalContentSchema, fields: ['title', 'seoTitle', 'description', 'blocks', 'notice'], managed: ['slug', 'effectiveDate', 'updated'] },
  ad: { fields: ['copy', 'heroSteps', 'benefits', 'services', 'audiences', 'areaRows', 'overviewParagraphs'], managed: ['version', 'slug', 'name', 'images', 'overviewStats'] },
};
const sorted = items => [...items].sort();
const jsonSchema = schema => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
function assertNativeConstraints(actual, expected, path = '') {
  for (const [key, value] of Object.entries(expected)) {
    if (key === '$schema') continue;
    const at = `${path}.${key}`;
    if (value && typeof value === 'object') {
      assert.ok(actual[key], `Missing native schema at ${at}`);
      assertNativeConstraints(actual[key], value, at);
    } else assert.equal(actual[key], key === 'maxItems' ? Math.min(300, value) : value, at);
  }
}

for (const [type, spec] of Object.entries(cases)) test(`${type}: export classifies every native field and preserves its schema constraints`, () => {
  const nativeFields = Object.keys(spec.source?.shape ?? ad);
  // New source fields must be deliberately classified as writing or CMS-managed.
  // This catches silently missing template fields without exposing new controls.
  assert.deepEqual(sorted([...spec.fields, ...spec.managed]), sorted(nativeFields));
  const target = { type, slug: fixtures[type].target.slug, ...(type === 'micromarket' ? { citySlug: fixtures[type].target.city_slug } : {}) };
  const exported = writing.writingTemplate(target, fixtures[type].content);
  assert.deepEqual(sorted(Object.keys(exported.schema.properties)), sorted(spec.fields));
  assert.deepEqual(sorted(Object.keys(exported.content)), sorted(spec.fields));
  assert.deepEqual(exported.page, target);
  assert.equal(exported.schema.additionalProperties, false);
  assert.equal(writing.parseWritingJson(JSON.stringify(exported), target).issues.length, 0);
  const guidanceFields = spec.fields.flatMap(field => field === 'copy' ? Object.keys(ad.copy).map(key => `copy.${key}`) : field);
  assert.deepEqual(sorted(Object.keys(exported.guidance)), sorted(guidanceFields));
  assert.ok(Object.values(exported.guidance).every(field => field.guidance.length > 20));
  if (spec.source) {
    const native = jsonSchema(spec.source);
    for (const field of spec.fields) assertNativeConstraints(exported.schema.properties[field], native.properties[field], `${type}.${field}`);
  }
});

for (const [type, moduleId, exportName, module] of [
  ['blog', './blog-schema', 'blogSchema', blog],
  ['city', './location-schema', 'locationSchema', location],
  ['state', './location-schema', 'locationSchema', location],
  ['micromarket', './micromarket-schema', 'micromarketSchema', micromarket],
  ['legal', './legal-schema', 'legalContentSchema', legal],
  ['service', './service-schema', 'serviceDraftSchema', service],
]) test(`${type}: changing a native field constraint changes the generated JSON`, () => {
  const original = module[exportName];
  const source = original.in ?? original;
  const changed = z.object(source.shape).extend({ seoTitle: source.shape.seoTitle.max(73) });
  const updated = original.in ? changed.pipe(original.out) : changed;
  const isolated = loader({ [moduleId]: { ...module, [exportName]: updated } })('lib/ai-writing.ts');
  assert.equal(isolated.writingJsonSchema(type).properties.seoTitle.maxLength, 73);
});

test('service export includes completion constraints as well as draft limits, for every service', () => {
  const schema = writing.writingJsonSchema('service');
  const published = jsonSchema(service.servicePublishSchema.out);
  for (const field of cases.service.fields) assertNativeConstraints(schema.allOf[0].properties[field], published.properties[field], field);
  assert.equal(schema.allOf[0].properties.title.minLength, 1);
  assert.equal(schema.allOf[0].properties.blocks.minItems, 1);
  assert.equal(schema.properties.faqs.maxItems, 100);
  for (const slug of Object.keys(service.SERVICE_PAGES)) {
    const target = { type: 'service', slug };
    const exported = writing.writingTemplate(target, service.emptyService(slug));
    assert.equal(exported.page.slug, slug);
    assert.equal(exported.content.title, service.SERVICE_PAGES[slug]);
    assert.equal(writing.parseWritingJson(JSON.stringify(exported), target).issues.length, 0);
  }
});

test('ad export follows native required text, fixed step count, card identities and optional fields', () => {
  const schema = writing.writingJsonSchema('ad').properties;
  assert.ok(writing.writingTemplate({ type: 'ad', slug: 'bangalore' }, ad).instructions.some(text => text.startsWith('All ad-page copy uses plain text.')));
  assert.equal(schema.heroSteps.minItems, adRules.AD_HERO_STEP_COUNT);
  assert.equal(schema.heroSteps.maxItems, adRules.AD_HERO_STEP_COUNT);
  for (const [key, field] of Object.entries(schema.copy.properties)) {
    assert.equal(field.minLength, adRules.AD_REQUIRED_COPY_FIELDS.includes(key) ? 1 : undefined, key);
    assert.equal(field.maxLength, adRules.AD_TEXT_LIMIT);
  }
  for (const [group, required] of Object.entries(adRules.AD_REQUIRED_CARD_FIELDS)) {
    assert.equal(schema[group].minItems, ad[group].length);
    assert.equal(schema[group].maxItems, ad[group].length);
    const cards = schema[group].items.anyOf;
    assert.deepEqual(sorted(cards.map(card => card.properties.id.const)), sorted(ad[group].map(card => card.id)));
    for (const card of cards) for (const key of required) assert.equal(card.properties[key].minLength, 1, `${group}.${key}`);
  }
  assert.equal(schema.areaRows.minItems, 1);
  assert.equal(schema.areaRows.items.properties.areas.minItems, 1);
  assert.equal(schema.overviewParagraphs.minItems, 1);
  const triplePl = schema.audiences.items.anyOf.find(card => card.properties.id.const === '3pls');
  assert.equal(triplePl.properties.secondaryCta.minLength, 1);
  assert.deepEqual(writing.validateWriting('ad', ad), []);
  for (const path of adRules.AD_REQUIRED_COPY_FIELDS) {
    const content = structuredClone(ad); content.copy[path] = '';
    assert.throws(() => adRules.parseAdPage(content), new RegExp(`copy.${path}`));
    assert.ok(writing.validateWriting('ad', content).some(issue => issue.path === `copy.${path}`));
  }
});

test('ad structural limits are read from the native rules rather than duplicated constants', () => {
  const isolated = loader({ './ad-page-content.mjs': { ...adRules, AD_TEXT_LIMIT: 12345, AD_HERO_STEP_COUNT: 5, AD_LIST_LIMIT: 12 } })('lib/ai-writing.ts');
  const schema = isolated.writingJsonSchema('ad').properties;
  assert.equal(schema.copy.properties.seoTitle.maxLength, 12345);
  assert.equal(schema.heroSteps.minItems, 5);
  assert.equal(schema.areaRows.maxItems, 12);
});

test('both legal pages export their current copy using the legal block schema', () => {
  for (const slug of Object.keys(legal.LEGAL_PAGES)) {
    const target = { type: 'legal', slug };
    const exported = writing.writingTemplate(target, { ...fixtures.legal.content, title: legal.LEGAL_PAGES[slug] });
    assert.equal(exported.page.slug, slug);
    assert.equal(exported.content.title, legal.LEGAL_PAGES[slug]);
    assert.deepEqual(exported.schema.properties.blocks.items.oneOf.map(block => block.properties.kind.const), ['h2', 'h3', 'p', 'ul', 'ol']);
    assert.equal(exported.content.effectiveDate, undefined);
  }
});

test('nested object and collection rules in the download match import restrictions', () => {
  const schema = writing.writingJsonSchema('blog');
  assert.equal(schema.properties.faqs.items.additionalProperties, false);
  assert.equal(schema.properties.blocks.items.oneOf[0].additionalProperties, false);
  assert.equal(schema.properties.blocks.maxItems, 300);
});
