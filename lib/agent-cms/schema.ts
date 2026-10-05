/** CMS-owned import schemas; clients fetch these rather than copying field lists. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { blogSchema } from '../blog-schema';
import { editorialFields, optionalProse } from '../editorial-schema';
import {
  serviceDraftSchema,
  servicePublishSchema,
  SERVICE_PAGES,
} from '../service-schema';
import { legalContentSchema, LEGAL_PAGES } from '../legal-schema';
import { readAdPage, AD_PAGES } from '../ad-page-schema';
import adTemplate from '../../content/ad-pages/bangalore.json';

export const pageTypes = [
  'blog',
  'city',
  'state',
  'micromarket',
  'service',
  'legal',
  'ad',
] as const;
export type PageType = (typeof pageTypes)[number];
export type Content = Record<string, unknown>;
export class CmsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}
export const canonical = (v: unknown): string =>
  JSON.stringify(v, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
export const digest = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
const slug = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const targetSchema = z
  .object({ page_type: z.enum(pageTypes), slug, city_slug: slug.optional() })
  .strict()
  .refine(
    (t) => (t.page_type === 'micromarket') === Boolean(t.city_slug),
    'Only micromarkets require city_slug.',
  );
export type Target = z.infer<typeof targetSchema>;
export const pageRef = (target: Target) =>
  [target.page_type, target.city_slug, target.slug].filter(Boolean).join('/');
const overview = z.object(editorialFields).omit({ status: true }).strict();
function inferred(example: unknown): z.ZodType {
  if (typeof example === 'string') return z.string().max(20000);
  if (typeof example === 'number') return z.number().finite();
  if (Array.isArray(example)) return z.array(inferred(example[0])).max(30);
  return z
    .object(
      Object.fromEntries(
        Object.entries(example as Content).map(([key, value]) => [
          key,
          inferred(value),
        ]),
      ),
    )
    .strict();
}
const schemas = {
  blog: blogSchema.omit({ slug: true, status: true }).strict().extend({
    datePublished: z.iso.date().nullable(),
    dateModified: z.iso.date(),
  }),
  city: overview.extend({
    corridorHeading: optionalProse.optional().default(null),
    corridorProse: optionalProse.optional().default(null),
    complianceHeading: optionalProse.optional().default(null),
    complianceProse: optionalProse.optional().default(null),
  }),
  state: overview,
  micromarket: overview,
  service: serviceDraftSchema.omit({ slug: true }).strict(),
  legal: z.object(legalContentSchema.shape).omit({ slug: true }).strict(),
  ad: (inferred(adTemplate) as z.ZodObject).omit({ slug: true }),
} satisfies Record<PageType, z.ZodType>;

export function schemaFor(type: PageType) {
  const json = z.toJSONSchema(schemas[type], {
    io: 'input',
    unrepresentable: 'any',
  });
  const properties = json.properties ?? {};
  const identity = type === 'micromarket' ? ['city_slug', 'slug'] : ['slug'];
  const columns = [...identity, ...Object.keys(properties)];
  return {
    page_type: type,
    schema_version: digest({ protocol: 1, type, json }),
    json_schema: json,
    columns,
    csv_template: `${columns.join(',')}\r\n`,
    csv_rules:
      'UTF-8 CSV; one page per row. Identity columns are mandatory. Missing columns and empty cells preserve existing fields. Use JSON null to clear nullable fields, JSON "" to clear text, and [] to clear arrays. Arrays/objects/numbers use JSON. No status, publication, IDs or timestamps. Maximum 20 rows and 24,000 UTF-8 bytes per request; split larger files at parsed row boundaries.',
    fixed_slugs:
      type === 'service'
        ? Object.keys(SERVICE_PAGES)
        : type === 'legal'
          ? Object.keys(LEGAL_PAGES)
          : type === 'ad'
            ? Object.keys(AD_PAGES)
            : undefined,
  };
}
function assertKeysPreserved(input: unknown, output: unknown, path = '') {
  if (!input || typeof input !== 'object') return;
  for (const [key, value] of Object.entries(input)) {
    if (!output || typeof output !== 'object' || !Object.hasOwn(output, key))
      throw new CmsError('UNKNOWN_FIELD', `Unsupported field: ${path}${key}`);
    assertKeysPreserved(value, (output as Content)[key], `${path}${key}.`);
  }
}
export function parseContent(
  target: Target,
  value: Content,
  publish = false,
): Content {
  let parsed: unknown;
  if (target.page_type === 'service')
    parsed = (publish ? servicePublishSchema : serviceDraftSchema).parse({
      ...value,
      slug: target.slug,
    });
  else if (target.page_type === 'legal')
    parsed = legalContentSchema.parse({ ...value, slug: target.slug });
  else if (target.page_type === 'ad') {
    try {
      parsed = readAdPage({ ...value, slug: target.slug }, !publish);
    } catch (error) {
      throw new CmsError(
        'INVALID_CONTENT',
        error instanceof Error
          ? error.message.slice(0, 2000)
          : 'Invalid ad page content.',
      );
    }
  } else parsed = schemas[target.page_type].parse(value);
  const content = { ...(parsed as Content) };
  delete content.slug;
  assertKeysPreserved(value, content);
  if (Buffer.byteLength(canonical(content)) > 40000)
    throw new CmsError(
      'CONTENT_TOO_LARGE',
      'Page content exceeds 40,000 bytes. Use the CMS editor for larger pages.',
    );
  return content;
}
export function contentFields(type: PageType, value: Content): Content {
  const fields = schemaFor(type).json_schema.properties ?? {};
  return Object.fromEntries(
    Object.keys(fields)
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  );
}

/** Strict CSV grammar, including escaped quotes, quoted newlines and CRLF. */
export function parseCsv(text: string): string[][] {
  if (Buffer.byteLength(text) > 24000 || text.includes('\0'))
    throw new CmsError(
      'CSV_SIZE',
      'CSV must contain at most 24,000 UTF-8 bytes and no NUL.',
    );
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, '');
  const cell = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const line = () => {
    cell();
    rows.push(row);
    row = [];
    if (rows.length > 21)
      throw new CmsError('CSV_ROWS', 'Use at most 20 data rows.');
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      if (c === ',') cell();
      else {
        line();
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (closed || c === '"')
      throw new CmsError('CSV_QUOTES', 'Malformed CSV quoting.');
    else field += c;
  }
  if (quoted) throw new CmsError('CSV_QUOTES', 'Unclosed quoted CSV cell.');
  if (field || closed || row.length) line();
  if (rows.length < 2)
    throw new CmsError(
      'CSV_EMPTY',
      'Supply a header and at least one data row.',
    );
  if (
    new Set(rows[0]).size !== rows[0].length ||
    rows[0].some((x) => !x || x.trim() !== x)
  )
    throw new CmsError(
      'CSV_HEADERS',
      'Headers must be unique, nonempty and exact.',
    );
  if (rows.slice(1).some((r) => r.length !== rows[0].length))
    throw new CmsError(
      'CSV_COLUMNS',
      'Each row must have exactly the header column count.',
    );
  return rows;
}
export function csvRows(type: PageType, csv: string) {
  const [headers, ...rows] = parseCsv(csv),
    schema = schemaFor(type);
  if (
    headers.some((h) => !schema.columns.includes(h)) ||
    !headers.includes('slug') ||
    (type === 'micromarket' && !headers.includes('city_slug'))
  )
    throw new CmsError(
      'CSV_HEADERS',
      'Use the identity and content columns returned by cms_schema; unknown columns are rejected.',
    );
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const raw = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    const target = targetSchema.parse({
      page_type: type,
      slug: raw.slug,
      ...(raw.city_slug ? { city_slug: raw.city_slug } : {}),
    });
    const ref = pageRef(target);
    if (seen.has(ref))
      throw new CmsError(
        'CSV_DUPLICATE_TARGET',
        `Row ${index + 2} duplicates ${ref}.`,
      );
    seen.add(ref);
    const patch: Content = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'slug' || key === 'city_slug' || value === '') continue;
      const property = schema.json_schema.properties![key] as {
        type?: string;
        anyOf?: Array<{ type?: string }>;
      };
      const stringType =
        property.type === 'string' ||
        property.anyOf?.some((option) => option.type === 'string');
      if (stringType && value !== 'null' && value !== '""') patch[key] = value;
      else
        try {
          patch[key] = JSON.parse(value);
        } catch {
          throw new CmsError(
            'CSV_JSON',
            `Row ${index + 2}, ${key}: use valid JSON.`,
          );
        }
    }
    if (!Object.keys(patch).length)
      throw new CmsError(
        'CSV_NO_CHANGES',
        `Row ${index + 2} contains no content.`,
      );
    return { row: index + 2, target, patch };
  });
}
