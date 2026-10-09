import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { ContentSource as BlogContent, ContentState } from './staging';
import type { EditorialFields } from './editorial-staging';
import type { LocationKind } from './location-schema';

// Lists need identity and publication state, not two or three copies of each
// page's copy. Compare JSONB in Postgres and return only those small summaries.
// These reads deliberately have no cross-request cache: saves and deploys must
// appear immediately. Parity tests compare these expressions with *StateOf.
const blogFields = [
  'slug', 'title', 'seoTitle', 'description', 'summary', 'keywords', 'blocks',
  'faqs', 'related', 'author', 'thumbnail', 'sortOrder', 'status',
] as const satisfies readonly (keyof BlogContent)[];
const editorialFields = [
  'name', 'seoTitle', 'metaDescription', 'h1', 'heroEyebrow', 'heroProse',
  'heroImage', 'marketHeading', 'marketProse', 'marketImage', 'rentsHeading',
  'rentsProse', 'specHeading', 'specProse', 'inventoryHeading', 'faqs',
  'relatedBlogs', 'statOverrides', 'status',
] as const satisfies readonly (keyof EditorialFields)[];
const cityFields = ['corridorHeading', 'corridorProse'] as const;
const stateFields = ['citiesHeading', 'stateCities'] as const;

// Only module-owned identifiers enter raw SQL; all request values are bound.
function content(fields: readonly string[]) {
  return Prisma.sql`jsonb_build_object(${Prisma.join(fields.map(field => Prisma.raw(`'${field}', "${field}"`)))})`;
}

function state(current: Prisma.Sql, snapshot = Prisma.sql`"deployedContent"`) {
  return Prisma.sql`CASE
    WHEN COALESCE("deployedContent"->>'status' = 'PUBLISHED', false) THEN
      CASE WHEN ${current} = ${snapshot} THEN 'PUBLISHED' ELSE 'STAGED' END
    WHEN "status" = 'DRAFT' THEN 'DRAFT'
    ELSE 'STAGED'
  END AS "state"`;
}

const revertable = Prisma.sql`("deployedContent" IS NOT NULL AND "deployedContent" <> 'null'::jsonb) AS "revertable"`;
const blogContent = Prisma.sql`${content(blogFields)} || jsonb_build_object(
  'datePublished', to_char("datePublished", 'YYYY-MM-DD'),
  'dateModified', to_char("dateModified", 'YYYY-MM-DD'))`;
const blogSnapshot = Prisma.sql`'{"thumbnail":null}'::jsonb || "deployedContent"`;
const locationContent = Prisma.sql`${content(['kind', 'slug', ...editorialFields, 'complianceHeading', 'complianceProse'])} ||
  CASE WHEN "kind" = 'CITY' THEN ${content(cityFields)} ELSE ${content(stateFields)} END`;
const locationSnapshot = Prisma.sql`'{"complianceHeading":null,"complianceProse":null}'::jsonb ||
  CASE WHEN "deployedContent"->>'kind' = 'CITY'
    THEN '{"corridorHeading":null,"corridorProse":null}'::jsonb
    ELSE '{"citiesHeading":null,"stateCities":null}'::jsonb
  END || "deployedContent"`;

type EditorialSummary = {
  id: number;
  slug: string;
  name: string;
  state: ContentState;
  revertable: boolean;
};
export type BlogSummary = {
  id: number;
  slug: string;
  title: string;
  dateModified: string;
  sortOrder: number;
  state: ContentState;
  revertable: boolean;
};
export type LocationSummary = EditorialSummary & { kind: LocationKind };
export type MicromarketSummary = EditorialSummary & { citySlug: string };
export type SnapshotSummary = {
  slug: string;
  hasDraft: boolean;
  staged: boolean;
  published: boolean;
  deployed: boolean;
};

export function getBlogSummaries() {
  return prisma.$queryRaw<BlogSummary[]>(Prisma.sql`
    SELECT "id", "slug", "title", "sortOrder", to_char("dateModified", 'YYYY-MM-DD') AS "dateModified",
      ${state(blogContent, blogSnapshot)}, ${revertable}
    FROM "Blog" ORDER BY "sortOrder", "id"`);
}

export function getLocationSummaries(kind?: LocationKind) {
  return prisma.$queryRaw<LocationSummary[]>(Prisma.sql`
    SELECT "id", "kind", "slug", "name", ${state(locationContent, locationSnapshot)}, ${revertable}
    FROM "LocationPage" ${kind ? Prisma.sql`WHERE "kind"::text = ${kind}` : Prisma.empty}`);
}

export function getMicromarketSummaries() {
  return prisma.$queryRaw<MicromarketSummary[]>(Prisma.sql`
    SELECT "id", "citySlug", "slug", "name", ${state(content(['citySlug', 'slug', ...editorialFields]))}, ${revertable}
    FROM "MicromarketPage"`);
}

function snapshotSummaries(table: 'ServicePage' | 'LegalPage' | 'AdPage') {
  // Prisma reads both SQL NULL and JSON null as JS null. Normalize them before
  // comparing so an unwritten page never acquires a phantom draft/staged badge.
  return prisma.$queryRaw<SnapshotSummary[]>(Prisma.sql`
    SELECT "slug",
      COALESCE("draftContent", 'null'::jsonb) <> COALESCE("publishedContent", 'null'::jsonb) AS "hasDraft",
      COALESCE("publishedContent", 'null'::jsonb) <> COALESCE("deployedContent", 'null'::jsonb) AS "staged",
      ("publishedContent" IS NOT NULL AND "publishedContent" <> 'null'::jsonb) AS "published",
      ("deployedContent" IS NOT NULL AND "deployedContent" <> 'null'::jsonb) AS "deployed"
    FROM ${Prisma.raw(`"${table}"`)} ORDER BY "slug"`);
}

export const getServiceSummaries = () => snapshotSummaries('ServicePage');
export const getLegalSummaries = () => snapshotSummaries('LegalPage');
export const getAdPageSummaries = () => snapshotSummaries('AdPage');
