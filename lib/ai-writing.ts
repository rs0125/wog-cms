import { z } from 'zod';
import { blogSchema } from './blog-schema';
import { PROSE_BANDS } from './editorial-schema';
import { locationSchema } from './location-schema';
import { micromarketSchema } from './micromarket-schema';
import { serviceDraftSchema, servicePublishSchema, hasServiceWriting } from './service-schema';
import { legalContentSchema } from './legal-schema';
import { AD_COPY_GROUPS } from './ad-page-schema';
import { AD_TEXT_LIMIT, AD_LIST_LIMIT, AD_REQUIRED_TEXT_PATHS, AD_REQUIRED_LIST_PATHS, AD_REQUIRED_COPY_FIELDS, AD_REQUIRED_CARD_FIELDS } from './ad-page-content.mjs';
import adTemplate from '../content/ad-pages/bangalore.json';

export const WRITING_VERSION = 1;
export const MAX_WRITING_BYTES = 750_000;
// A byte limit alone still admits thousands of tiny inputs that freeze the editor.
const MAX_WRITING_ENTRIES = 2_000;
export const writingTypes = ['blog', 'city', 'state', 'micromarket', 'service', 'legal', 'ad'] as const;
export type WritingType = typeof writingTypes[number];
export type WritingValues = Record<string, unknown>;
const slug = z.string().regex(/^[a-z0-9]+(?:-+[a-z0-9]+)*$/, 'Enter the page slug first.');
export const writingTargetSchema = z.object({ type: z.enum(writingTypes), slug, citySlug: slug.optional() }).strict()
  .refine(t => (t.type === 'micromarket') === Boolean(t.citySlug), 'A micromarket needs its city slug.')
  .refine(t => t.type !== 'blog' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug), 'Blog slugs use single hyphens.');
export type WritingTarget = z.infer<typeof writingTargetSchema>;
export type WritingIssue = { path: string; label: string; message: string };
export type WritingChange = { path: string; label: string; before: unknown; after: unknown; replacement: boolean };

const overviewFields = {
  seoTitle: true, metaDescription: true, h1: true, heroEyebrow: true, heroProse: true,
  marketHeading: true, marketProse: true, rentsHeading: true, rentsProse: true,
  specHeading: true, specProse: true, inventoryHeading: true, faqs: true,
} as const;
const adRequiredText = z.string().trim().min(1, 'required').max(AD_TEXT_LIMIT);
// The ad editor's native validator is template-based rather than Zod. Use that
// same template and its shared rules, including per-card identities.
function adShape(example: unknown, path: string): z.ZodType {
  const [group, field] = path.split('.');
  const cardFields = AD_REQUIRED_CARD_FIELDS[group as keyof typeof AD_REQUIRED_CARD_FIELDS];
  if (typeof example === 'string') return (group === 'copy' && AD_REQUIRED_COPY_FIELDS.includes(field))
    || cardFields?.includes(field) || AD_REQUIRED_TEXT_PATHS.includes(path)
    ? adRequiredText : z.string().max(AD_TEXT_LIMIT);
  if (Array.isArray(example)) {
    if (cardFields) return z.array(z.union(example.map(item => adShape(item, path)))).length(example.length);
    if (path === 'areaGroups') return z.tuple(example.map(item => adShape(item, path)) as [z.ZodType, ...z.ZodType[]]);
    const array = z.array(adShape(example[0], path)).max(AD_LIST_LIMIT);
    return AD_REQUIRED_LIST_PATHS.includes(path) ? array.min(1) : array;
  }
  const item = example as WritingValues;
  return z.object(Object.fromEntries(Object.entries(item).map(([key, value]) => [key,
    (cardFields && key === 'id') || (path === 'areaGroups' && ['id', 'scope'].includes(key)) ? z.literal(value as string)
      : group === 'audiences' && item.id === '3pls' && key === 'secondaryCta' ? adRequiredText
        : adShape(value, `${path}.${key}`),
  ]))).strict();
}
const schemas = {
  blog: blogSchema.pick({ title: true, seoTitle: true, description: true, summary: true, author: true, keywords: true, blocks: true, faqs: true }),
  city: locationSchema.in.pick({ ...overviewFields, corridorHeading: true, corridorProse: true, complianceHeading: true, complianceProse: true }),
  state: locationSchema.in.pick({ ...overviewFields, citiesHeading: true, complianceHeading: true, complianceProse: true }),
  micromarket: micromarketSchema.pick(overviewFields),
  service: serviceDraftSchema.omit({ slug: true }),
  legal: z.object(legalContentSchema.shape).pick({ title: true, seoTitle: true, description: true, blocks: true, notice: true }),
  ad: z.object(Object.fromEntries(['copy', 'benefits', 'services', 'audiences', 'areaGroups', 'rentGuide', 'faqs']
    .map(k => [k, adShape(adTemplate[k as keyof typeof adTemplate], k)]))),
};
const labels: Record<string, string> = {
  title: 'Page heading', h1: 'On-page H1', seoTitle: 'SEO title', description: 'Meta description', metaDescription: 'Meta description',
  summary: 'Introduction', author: 'Byline', keywords: 'Keywords', blocks: 'Content blocks', faqs: 'FAQs',
  heroEyebrow: 'Eyebrow', heroProse: 'Lead paragraph', marketHeading: 'Market heading', marketProse: 'Market paragraph',
  rentsHeading: 'Pricing heading', rentsProse: 'Pricing paragraph', specHeading: 'Specification heading', specProse: 'Specification paragraph',
  inventoryHeading: 'Listings heading', corridorHeading: 'Corridor heading', corridorProse: 'Corridor paragraph',
  complianceHeading: 'Compliance heading', complianceProse: 'Compliance paragraph', citiesHeading: 'Cities heading',
  notice: 'Closing notice', benefits: 'Benefits', services: 'Service cards', audiences: 'Audience cards',
  areaGroups: 'Area recommendations', rentGuide: 'Rent guide', mobileTitle: 'Mobile heading', mobileBody: 'Mobile description', q: 'Question', a: 'Answer', text: 'Text',
  items: 'List items', table: 'Table', headers: 'Headers', rows: 'Rows', kind: 'Block type',
  ...Object.fromEntries(AD_COPY_GROUPS.flatMap(g => g.fields.map(f => [`copy.${f.key}`, `${g.title} → ${f.label}`]))),
};
export function writingLabel(path: string): string {
  if (labels[path]) return labels[path];
  return path.split('.').map((part, i, parts) => /^\d+$/.test(part)
    ? `${parts[i - 1] === 'faqs' ? 'FAQ' : parts[i - 1] === 'blocks' ? 'Block' : 'Item'} ${Number(part) + 1}`
    : labels[part] ?? part).join(' → ');
}
export const canonicalWriting = (value: unknown): string => JSON.stringify(value, (_k, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v) ?? 'null';
export const sameWriting = (a: unknown, b: unknown) => canonicalWriting(a) === canonicalWriting(b);
export function emptyWriting(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.every(emptyWriting);
  if (typeof value === 'object') return Object.entries(value).every(([k, v]) => ['kind', 'id', 'compact'].includes(k) || emptyWriting(v));
  return false;
}
export function writingPaths(type: WritingType): string[] {
  const keys = Object.keys(schemas[type].shape);
  return keys.flatMap(k => k === 'copy' ? Object.keys(adTemplate.copy).map(f => `copy.${f}`) : [k]);
}
export function getWriting(values: WritingValues, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => v && typeof v === 'object' ? (v as WritingValues)[key] : undefined, values);
}
export function setWriting(values: WritingValues, path: string, value: unknown): WritingValues {
  const [key, ...rest] = path.split('.');
  return { ...values, [key]: rest.length ? setWriting((values[key] ?? {}) as WritingValues, rest.join('.'), value) : value };
}
export function writingContent(type: WritingType, values: WritingValues): WritingValues {
  const empty = (schema: JsonSchema): unknown => schema.type === 'object'
    ? Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, child]) => [key, empty(child)]))
    : schema.type === 'array' ? [] : schema.anyOf?.some(s => s.type === 'null') ? null : '';
  return writingPaths(type).reduce((out, path) => {
    const v = getWriting(values, path);
    const schema = fieldJsonSchema(type, path);
    const nullable = schema.anyOf?.some((s: JsonSchema) => s.type === 'null');
    const fallback = empty(schema);
    return setWriting(out, path, (nullable && emptyWriting(v)) ? null : v ?? fallback);
  }, {});
}
type JsonSchema = { type?: string | string[]; const?: unknown; enum?: unknown[]; properties?: Record<string, JsonSchema>;
  required?: string[]; items?: JsonSchema; prefixItems?: JsonSchema[]; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; [key: string]: unknown };
const schemaCache = new Map<WritingType, JsonSchema>();
function exportSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', override: ({ jsonSchema }) => {
    // The import allowlist is stricter than native schemas that strip unknown
    // keys. Advertise the actual import rules in every nested object/array.
    if (jsonSchema.type === 'object') jsonSchema.additionalProperties = false;
    if (jsonSchema.type === 'array') {
      jsonSchema.maxItems = Math.min(300, jsonSchema.maxItems ?? 300);
      if (jsonSchema.prefixItems) {
        jsonSchema.minItems = jsonSchema.prefixItems.length;
        jsonSchema.maxItems = jsonSchema.prefixItems.length;
        jsonSchema.items = false;
      }
    }
  } }) as JsonSchema;
}
export function writingJsonSchema(type: WritingType): JsonSchema {
  if (!schemaCache.has(type)) {
    const schema = exportSchema(schemas[type]);
    if (type === 'service') {
      // A publishable service must satisfy both halves of the native pipeline:
      // draft size limits AND required writing. Keep those contracts intact.
      schema.allOf = [exportSchema(z.object(servicePublishSchema.out.shape).omit({ slug: true }))];
    }
    schemaCache.set(type, schema);
  }
  return schemaCache.get(type)!;
}
function fieldJsonSchema(type: WritingType, path: string): JsonSchema {
  return path.split('.').reduce((s, key) => s.properties?.[key] ?? {}, writingJsonSchema(type));
}
export function writingComplete(type: WritingType, values: WritingValues): boolean {
  const v = writingContent(type, values);
  const core = ['city', 'state', 'micromarket'].includes(type) ? ['seoTitle', 'metaDescription', 'h1', 'heroProse']
    : type === 'ad' ? ['copy.seoTitle', 'copy.metaDescription', 'copy.heroHeading', 'rentGuide.intro']
      : ['title', 'seoTitle', 'description', ...(type === 'legal' ? [] : ['summary']), 'blocks'];
  if (core.some(p => emptyWriting(getWriting(v, p)))) return false;
  if (type === 'blog' || type === 'service') {
    const parsed = serviceDraftSchema.shape.blocks.safeParse(v.blocks);
    if (!parsed.success || !hasServiceWriting(parsed.data)) return false;
  }
  return true;
}
export function writingTemplate(target: WritingTarget, values: WritingValues) {
  const content = writingContent(target.type, values);
  const guidance = Object.fromEntries(writingPaths(target.type).map(path => {
    const bandKey = target.type === 'city' && path === 'marketProse' ? 'cityMarketProse' : path;
    const field = path.replace(/^copy\./, '');
    return [path, { label: writingLabel(path), guidance: fieldGuidance(target.type, field),
      ...(PROSE_BANDS[bandKey] ? { suggestedWords: PROSE_BANDS[bandKey] } : {}),
      ...(field === 'seoTitle' ? { suggestedCharacters: 60 } : {}),
      ...(['description', 'metaDescription'].includes(field) ? { suggestedCharacters: 160 } : {}),
      existingContent: !emptyWriting(getWriting(content, path)),
    }];
  }));
  return {
    format: 'wareongo-ai-writing', version: WRITING_VERSION, page: target,
    instructions: [
      'Write content for this one page. The content object contains its current writing. Return this JSON object with only content changed. Keep format, version and page unchanged.',
      'The schema describes content. Do not add comments, Markdown fences, HTML or unsupported fields to the JSON.',
      'Existing copy is preserved by default. Replacements require the editor to select them in a before/after review.',
      'Use clear, specific prose for warehouse occupiers. Avoid filler, repetition, unsupported claims and invented facts.',
      'Inventory counts, rents, dimensions, compliance counts and charts come from live data. Do not invent them or repeat changing figures in prose.',
      'Verify locality and legal claims against reliable, dated sources. If evidence is missing, leave the relevant optional content blank.',
      'Word and SEO length targets are guidance. Do not pad copy to hit a target.',
      target.type === 'ad' ? 'All ad-page copy uses plain text. Do not add Markdown emphasis, links or headings; preserve placeholders such as {listings}.'
        : 'Titles, headings, SEO fields, labels, keywords and bylines use plain text. Use **bold** and *italic* only in prose, FAQ answers and content blocks. Legal blocks also support [link text](https://...) and mailto links. Other fields do not support Markdown links.',
      'Where the schema includes blocks, use those for headings, paragraphs, lists and tables. Each table row must match its header count. Each FAQ needs q and a.',
      'Omit optional sections with nothing useful to say. Remove entirely blank FAQ entries. Never write placeholder instructions as final copy.',
      'Photos, dates, URL slugs, related-page selections and publishing settings are managed in the CMS. Preserve existing image blocks exactly; add photos in the editor.',
      ...(target.type === 'city' ? ['Market copy explains demand and routes; corridor copy compares locations; compliance copy covers local approvals. Avoid repeating the same explanation.'] : []),
      ...(target.type === 'state' ? ['Describe the state and its cities. City selections and images are managed in the CMS; city figures come from inventory. Compliance is state-specific; corridors are not a state-page field.'] : []),
      ...(target.type === 'service' ? ['The schema includes both draft limits and completion requirements (allOf). Before publishing, fill the required writing and include meaningful body text in a paragraph, list or table. Unfinished drafts can still be saved privately.'] : []),
      ...(target.type === 'ad' ? ['Keep every existing card ID exactly once. Process steps, required card text and optional copy follow the ad page validator.'] : []),
    ],
    limits: { maxFileBytes: MAX_WRITING_BYTES, maxEntries: MAX_WRITING_ENTRIES },
    guidance, schema: writingJsonSchema(target.type),
    content,
  };
}
function fieldGuidance(type: WritingType, field: string): string {
  const descriptions: Record<string, string> = {
    title: 'State the page topic clearly in one heading. Plain text; no Markdown or trailing brand slogan.',
    h1: 'Name the location and the warehouse need this page addresses. Plain text.',
    seoTitle: 'A specific search title that matches the page. Plain text; avoid repetitive keywords.',
    description: 'Summarize the page and its usefulness in a natural search snippet. Plain text.',
    metaDescription: 'Summarize the location and who this page helps. Plain text; avoid changing inventory figures.',
    summary: type === 'blog' ? 'A self-contained answer to the article topic, shown in the “In short” box. Do not just announce what the article covers.'
      : 'Explain who this service helps, the problem it solves and what the reader can expect.',
    author: 'An actual author or team name, without “By”. Use null to credit WareOnGo by default.',
    keywords: 'A short array of relevant phrases. Use [] if none are needed; do not stuff variations of the same keyword.',
    blocks: 'Structure the body with h2 sections, h3 subsections, p paragraphs, ul or ol lists, and tables where supported by the schema. Do not embed Markdown headings or lists inside paragraph text. Every table row needs one cell per header. Preserve existing image blocks.',
    faqs: (type === 'ad' ? 'Keep at least one complete FAQ. ' : '') + 'Use entries shaped {"q":"Question?","a":"Direct answer."}. Answer real reader questions, avoiding repetition of the main copy. For pages other than ads, use [] if no useful FAQs; never leave a half-written entry.',
    heroEyebrow: 'A short location label above the main heading. Use null to keep the automatic location label.',
    heroProse: 'Explain why this location works as a warehouse market and which occupiers it suits. Live count, rent and size tiles sit beside this paragraph, so leave those figures out.',
    marketProse: type === 'city' ? 'Explain the city’s freight routes, industries and demand. Mention three to five relevant localities; reserve detailed comparisons for corridorProse.'
      : type === 'state' ? 'Explain the state’s freight routes, industries and demand, and the cities that carry its warehouse stock. City figures are shown separately.'
        : 'Describe the sub-localities and estates inside this belt, where stock sits, and practical access considerations.',
    rentsProse: 'Explain what drives rent here: unit size, grade, access and compliance. The chart supplies current figures; do not invent or restate them.',
    specProse: 'Explain what building heights, docks and unit sizes mean for occupiers. The adjoining table supplies measured inventory specifications.',
    corridorProse: 'Compare which corridors or localities suit different operations. Explain tradeoffs in access and location rather than repeating marketProse or the automatic comparison table.',
    complianceProse: 'Explain locally relevant zoning, land use, fire NOC and building approvals. Verify legal claims against dated authoritative sources. Leave null if you cannot support them; avoid repeating FAQ answers.',
    notice: 'A short closing policy notice. Preserve its legal meaning; do not invent obligations or promises.',
    benefits: 'Explain each existing benefit concisely. Preserve every card ID.',
    services: 'Explain each existing service and its action button. Preserve every card ID.',
    audiences: 'Describe the needs of each existing audience and the next action. Preserve every card ID.',
    areaGroups: 'Keep the two highway and city groups, their IDs and scopes in order. Edit their headings and rows; areas is plain text. Do not invent locality claims.',
    rentGuide: 'Explain the local rent market. Preserve approved rent ranges unless supplied with verified replacements. Rows contain area and rent text.',
    mobileTitle: 'Short mobile heading, separate from the desktop heading.',
    mobileBody: 'Short mobile description, separate from the desktop description.',
    availableFooter: 'Keep the {listings} placeholder where a current listing count is needed; never replace it with a fixed number.',
  };
  return descriptions[field] ?? (/Heading$/.test(field) ? `A short, specific section heading in plain text.${['city', 'state', 'micromarket'].includes(type) ? ' Leave optional headings null to use the site’s default.' : ''}`
    : 'Write concise plain text appropriate to this labeled slot. Preserve placeholders and the meaning of buttons or confirmation messages.');
}
function issue(path: string, message: string): WritingIssue { return { path, label: writingLabel(path) || 'JSON', message }; }
// Structural validation is deliberately separate from content validity: empty prose
// is safe to fix in the editor, an unknown block or object in a text field is not.
function shapeIssues(value: unknown, schema: JsonSchema, path: string, partial = false): WritingIssue[] {
  const choices = schema.anyOf ?? schema.oneOf;
  if (choices) {
    const matches = choices.map(s => shapeIssues(value, s, path));
    if (matches.some(errors => !errors.length)) return [];
    const block = value && typeof value === 'object' ? (value as WritingValues).kind : undefined;
    const selected = choices.find(s => s.properties?.kind?.const === block);
    return selected ? shapeIssues(value, selected, path) : [issue(path, 'Use one of the field shapes shown in the downloaded template.')];
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) return [issue(path, `Use ${JSON.stringify(schema.const)}.`)];
  if (schema.enum && !schema.enum.includes(value)) return [issue(path, `Use one of: ${schema.enum.join(', ')}.`)];
  if (schema.type === 'null') return value === null ? [] : [issue(path, 'Use null for this empty field.')];
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [issue(path, 'Use a JSON array, as shown in the template.')];
    const limit = Math.min(300, typeof schema.maxItems === 'number' ? schema.maxItems : 300);
    if (value.length > limit) return [issue(path, `Use at most ${limit} entries.`)];
    return value.flatMap((v, i) => shapeIssues(v, schema.prefixItems?.[i] ?? schema.items ?? {}, `${path}.${i}`));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [issue(path, 'Use a JSON object, as shown in the template.')];
    const input = value as WritingValues, properties = schema.properties ?? {};
    return [
      ...Object.keys(input).filter(k => !Object.hasOwn(properties, k)).map(k => issue(path ? `${path}.${k}` : k, 'This field is not supported here. Remove it; use the current template.')),
      ...(!partial ? (schema.required ?? []).filter(k => !Object.hasOwn(input, k)).map(k => issue(`${path}.${k}`, 'This field is missing. Add it using the template shape.')) : []),
      ...Object.keys(input).filter(k => Object.hasOwn(properties, k)).flatMap(k => shapeIssues(input[k], properties[k], path ? `${path}.${k}` : k, partial && k === 'copy')),
    ];
  }
  if (schema.type && typeof value !== schema.type && !(schema.type === 'integer' && Number.isInteger(value)))
    return [issue(path, `Use ${schema.type === 'string' ? 'text in double quotes' : `a ${schema.type}`}.`)];
  return [];
}
export function parseWritingJson(raw: string, target: WritingTarget): { content?: WritingValues; issues: WritingIssue[] } {
  if (new TextEncoder().encode(raw).byteLength > MAX_WRITING_BYTES) return { issues: [issue('', 'This file is too large. Use one page under 750 KB.')] };
  let parsed: unknown;
  try { parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    const position = /position (\d+)/.exec(message);
    const location = position ? `Line ${raw.slice(0, Number(position[1])).split('\n').length}: ` : '';
    return { issues: [issue('', `${location}Could not read this JSON. Check quotes, commas and brackets. ${message}`)] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { issues: [issue('', 'Upload one page object, not a list of pages.')] };
  const file = parsed as WritingValues;
  if (file.format !== 'wareongo-ai-writing' || file.version !== WRITING_VERSION) return { issues: [issue('', 'Use the current AI writing template. Keep its format and version unchanged.')] };
  const page = writingTargetSchema.safeParse(file.page);
  if (!page.success || !sameWriting(page.data, target)) return { issues: [issue('page', `This file does not identify this page. Keep page unchanged from the template for ${[target.type, target.citySlug, target.slug].filter(Boolean).join('/')}.`)] };
  if (!file.content || typeof file.content !== 'object' || Array.isArray(file.content)) return { issues: [issue('content', 'Add a content object using the downloaded template.')] };
  const issues = shapeIssues(file.content, writingJsonSchema(target.type), '', true);
  if (!issues.length) {
    // Count only after validating the bounded, non-recursive content shape.
    const remaining: unknown[] = [file.content];
    let entries = 0;
    while (remaining.length) {
      const value = remaining.pop();
      if (value && typeof value === 'object') remaining.push(...Object.values(value));
      else if (++entries > MAX_WRITING_ENTRIES) return { issues: [issue('content', 'This file has too many editable entries for one page (maximum 2,000). Shorten its lists or tables before uploading.')] };
    }
  }
  return issues.length ? { issues } : { content: file.content as WritingValues, issues: [] };
}
export function writingChanges(type: WritingType, current: WritingValues, incoming: WritingValues): WritingChange[] {
  const normal = writingContent(type, current);
  return writingPaths(type).flatMap(path => {
    let after = getWriting(incoming, path);
    const before = getWriting(normal, path);
    if (after === undefined) return [];
    if (fieldJsonSchema(type, path).anyOf?.some((s: JsonSchema) => s.type === 'null') && emptyWriting(after)) after = null;
    if (sameWriting(before, after) || (emptyWriting(before) && emptyWriting(after))) return [];
    return [{ path, label: writingLabel(path), before, after, replacement: !emptyWriting(before) }];
  });
}
export function applyWritingChanges(current: WritingValues, changes: WritingChange[]): WritingValues {
  return changes.reduce((values, change) => setWriting(values, change.path, change.after), current);
}
export function trackWritingChanges(previous: WritingChange[], changes: WritingChange[]): WritingChange[] {
  const tracked = new Map(previous.map(c => [c.path, c]));
  for (const change of changes) {
    const old = tracked.get(change.path);
    // If a person revised an imported field and then explicitly approved another
    // replacement, Undo restores that human revision, not the first blank value.
    tracked.set(change.path, { ...change, before: old && sameWriting(old.after, change.before) ? old.before : change.before });
  }
  return [...tracked.values()];
}
export function undoWritingChanges(current: WritingValues, changes: WritingChange[]): WritingValues {
  return changes.reduce((values, c) => sameWriting(getWriting(values, c.path), c.after) || (emptyWriting(getWriting(values, c.path)) && emptyWriting(c.after)) ? setWriting(values, c.path, c.before) : values, current);
}
export function validateWriting(type: WritingType, values: WritingValues): WritingIssue[] {
  const content = writingContent(type, values);
  const result = type === 'service' ? servicePublishSchema.safeParse({ ...content, slug: values.slug ?? 'warehouse-search' }) : schemas[type].safeParse(content);
  const issues = result.success ? [] : result.error.issues.map(i => issue(i.path.join('.'), i.message === 'required'
    ? i.path[0] === 'faqs' ? `Add ${i.path.at(-1) === 'a' ? 'an answer' : 'a question'}, or remove this FAQ.`
      : i.path[0] === 'blocks' ? 'Add text to this block, or remove the block.' : 'Add this required text.' : i.message));
  // The canonical block refinement reports the collection. Give the actual row too.
  if (Array.isArray(content.blocks)) content.blocks.forEach((b, i) => {
    if (b.kind === 'table') b.table.rows.forEach((row: unknown[], r: number) => {
      if (row.length !== b.table.headers.length) issues.push(issue(`blocks.${i}.table.rows.${r}`, `Expected ${b.table.headers.length} cells; found ${row.length}. Add or remove cells to match the headers.`));
    });
  });
  return issues.filter(i => !(i.path === 'blocks' && i.message.includes('same number of cells')));
}
export function protectedWritingIssues(type: WritingType, before: WritingValues, after: WritingValues): WritingIssue[] {
  const images = (v: unknown) => Array.isArray(v) ? v.filter(b => b?.kind === 'images') : [];
  if (!sameWriting(images(before.blocks), images(after.blocks))) return [issue('blocks', 'Keep existing image blocks unchanged. Add or edit photos with the CMS image controls.')];
  if (type === 'ad') {
    for (const key of ['benefits', 'services', 'audiences']) {
      const ids = (v: unknown) => Array.isArray(v) ? v.map(x => x.id).sort() : [];
      if (!sameWriting(ids(before[key]), ids(after[key]))) return [issue(key, 'Keep the existing card IDs. Change only their copy.')];
    }
    const groups = (v: unknown) => Array.isArray(v) ? v.map(({ id, scope }) => ({ id, scope })) : [];
    if (!sameWriting(groups(before.areaGroups), groups(after.areaGroups))) return [issue('areaGroups', 'Keep the highway and city groups in their existing order.')];
  }
  return [];
}
export function readableWriting(value: unknown): string {
  if (value == null || value === '') return '(empty)';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? value.map((v, i) => `${i + 1}. ${readableWriting(v)}`).join('\n\n') : '(empty)';
  if (typeof value === 'object') {
    const v = value as WritingValues;
    if ('q' in v) return `Question: ${v.q}\nAnswer: ${v.a}`;
    if ('kind' in v) return `${v.kind}\n${readableWriting(v.text ?? v.items ?? v.table ?? v.images)}`;
    return Object.entries(v).map(([k, v]) => `${writingLabel(k)}: ${readableWriting(v)}`).join('\n');
  }
  return String(value);
}
