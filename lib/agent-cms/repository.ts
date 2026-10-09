import {
  Prisma,
  type Blog,
  type LocationPage,
  type MicromarketPage,
  type ServicePage,
  type LegalPage,
  type AdPage,
} from '@prisma/client';
import { prisma } from '../prisma';
import { contentOf as blogContent } from '../staging';
import {
  contentOf as locationContent,
  stateOf as locationState,
} from '../location-staging';
import { contentOf as marketContent } from '../micromarket-staging';
import { sameContent, stateOf as blogState } from '../staging';
import { editorialStateOf } from '../editorial-staging';
import { fetchLocations, locationOverviewPath } from '../locations-api';
import {
  fetchMicromarkets,
  micromarketOverviewPath,
} from '../micromarkets-api';
import { SERVICE_PAGES } from '../service-schema';
import { LEGAL_PAGES } from '../legal-schema';
import { AD_PAGES } from '../ad-page-schema';
import { pruneOverrides } from '../editorial-schema';
import {
  CmsError,
  contentFields,
  pageRef,
  type Content,
  type Target,
  type PageType,
} from './schema';

export type Draft = {
  ref: string;
  revision: string;
  content: Content;
  base_version: string;
  actor: string;
  import_id: string;
};
export type ImportRecord = {
  id: string;
  actor: string;
  hash: string;
  payload: unknown;
  state: string;
  operation_id: string | null;
  expires_at: Date;
  receipt: unknown;
};
export type NativePage =
  | Blog
  | LocationPage
  | MicromarketPage
  | ServicePage
  | LegalPage
  | AdPage;
type Model = {
  findFirst: (args: object) => Promise<NativePage | null>;
  findMany: (args: object) => Promise<NativePage[]>;
  create: (args: object) => Promise<NativePage>;
  updateMany: (args: object) => Promise<{ count: number }>;
};
const models = {
  blog: 'blog',
  city: 'locationPage',
  state: 'locationPage',
  micromarket: 'micromarketPage',
  service: 'servicePage',
  legal: 'legalPage',
  ad: 'adPage',
} as const;
const tables = {
  blog: 'Blog',
  city: 'LocationPage',
  state: 'LocationPage',
  micromarket: 'MicromarketPage',
  service: 'ServicePage',
  legal: 'LegalPage',
  ad: 'AdPage',
} as const;
export const whereTarget = (t: Target) => ({
  slug: t.slug,
  ...(t.page_type === 'city' || t.page_type === 'state'
    ? { kind: t.page_type.toUpperCase() }
    : {}),
  ...(t.city_slug ? { citySlug: t.city_slug } : {}),
});
export const isSplit = (type: PageType) =>
  ['service', 'legal', 'ad'].includes(type);
export function nativeContent(type: PageType, row: NativePage | null): Content {
  if (!row) return {};
  const value = isSplit(type)
    ? (row as ServicePage).draftContent
    : type === 'blog'
      ? blogContent(row as Blog)
      : type === 'micromarket'
        ? marketContent(row as MicromarketPage)
        : locationContent(row as LocationPage);
  return contentFields(type, JSON.parse(JSON.stringify(value ?? {})));
}
export function nativeState(type: PageType, row: NativePage | null) {
  if (!row) return 'no_content';
  if (!isSplit(type))
    return (
      type === 'blog'
        ? blogState(row as Blog)
        : type === 'micromarket'
          ? editorialStateOf(
              row as MicromarketPage,
              marketContent(row as MicromarketPage),
            )
          : locationState(row as LocationPage)
    ).toLowerCase();
  const split = row as ServicePage;
  if (!split.publishedContent && !split.deployedContent) return 'draft';
  if (!sameContent(split.publishedContent, split.deployedContent))
    return 'staged';
  return split.publishedContent ? 'published' : 'draft';
}
export async function inventory(
  type: PageType,
): Promise<Array<Target & { name: string; path?: string | null }>> {
  if (type === 'blog') return [];
  if (type === 'city' || type === 'state') {
    const all = await fetchLocations();
    return (type === 'city' ? all.cities : all.states).map((l) => ({
      page_type: type,
      slug: l.slug,
      name: l.name,
      path: locationOverviewPath(l),
    }));
  }
  if (type === 'micromarket')
    return (await fetchMicromarkets()).data
      .filter((m) => m.citySlug)
      .map((m) => ({
        page_type: type,
        slug: m.slug,
        city_slug: m.citySlug!,
        name: m.name,
        path: micromarketOverviewPath(m),
      }));
  const fixed =
    type === 'service'
      ? SERVICE_PAGES
      : type === 'legal'
        ? LEGAL_PAGES
        : AD_PAGES;
  return Object.entries(fixed).map(([slug, name]) => ({
    page_type: type,
    slug,
    name,
  }));
}

/** All preview and draft records are private; no public website query reads these tables. */
export class CmsRepository {
  constructor(readonly db: Prisma.TransactionClient) {}
  model(type: PageType) {
    return this.db[models[type]] as unknown as Model;
  }
  async lock(target: Target) {
    await this.db
      .$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pageRef(target)}, 0))::text`;
    // The native CMS uses ordinary row updates. Row locks synchronize those with
    // the final version check; the advisory lock also covers missing targets.
    const extra = target.city_slug
      ? Prisma.sql`AND "citySlug" = ${target.city_slug}`
      : target.page_type === 'city' || target.page_type === 'state'
        ? Prisma.sql`AND kind::text = ${target.page_type.toUpperCase()}`
        : Prisma.empty;
    await this.db.$queryRaw(
      Prisma.sql`SELECT slug FROM ${Prisma.raw(`public."${tables[target.page_type]}"`)} WHERE slug = ${target.slug} ${extra} FOR UPDATE`,
    );
  }
  native(target: Target) {
    return this.model(target.page_type).findFirst({
      where: whereTarget(target),
    });
  }
  all(type: PageType) {
    return this.model(type).findMany({
      where:
        type === 'city' || type === 'state' ? { kind: type.toUpperCase() } : {},
      take: 5001,
    });
  }
  async draft(ref: string): Promise<Draft | null> {
    return (
      (
        await this.db.$queryRaw<
          Draft[]
        >`SELECT * FROM cms_agent_private.drafts WHERE ref = ${ref}`
      )[0] ?? null
    );
  }
  drafts(type: PageType) {
    return this.db.$queryRaw<
      Draft[]
    >`SELECT * FROM cms_agent_private.drafts WHERE ref LIKE ${`${type}/%`} ORDER BY ref LIMIT 5001`;
  }
  async import(id: string, lock = false): Promise<ImportRecord | null> {
    return (
      (
        await this.db.$queryRaw<ImportRecord[]>(
          Prisma.sql`SELECT * FROM cms_agent_private.imports WHERE id = ${id}::uuid ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
        )
      )[0] ?? null
    );
  }
  async saveImport(id: string, actor: string, hash: string, payload: unknown) {
    await this.db
      .$executeRaw`INSERT INTO cms_agent_private.imports (id, actor, hash, payload, expires_at) VALUES (${id}::uuid, ${actor}, ${hash}, ${JSON.stringify(payload)}::jsonb, now() + interval '24 hours')`;
  }
  async saveDraft(draft: Draft) {
    await this.db
      .$executeRaw`INSERT INTO cms_agent_private.drafts (ref, revision, content, base_version, actor, import_id)
      VALUES (${draft.ref}, ${draft.revision}::uuid, ${JSON.stringify(draft.content)}::jsonb, ${draft.base_version}, ${draft.actor}, ${draft.import_id}::uuid)
      ON CONFLICT (ref) DO UPDATE SET revision = EXCLUDED.revision, content = EXCLUDED.content, base_version = EXCLUDED.base_version, actor = EXCLUDED.actor, import_id = EXCLUDED.import_id, updated_at = now()`;
  }
  async complete(id: string, operationId: string, receipt: unknown) {
    await this.db
      .$executeRaw`UPDATE cms_agent_private.imports SET state = 'DRAFT', operation_id = ${operationId}::uuid, receipt = ${JSON.stringify(receipt)}::jsonb WHERE id = ${id}::uuid`;
  }
  async operation(actor: string, id: string) {
    return (
      await this.db.$queryRaw<
        ImportRecord[]
      >`SELECT * FROM cms_agent_private.imports WHERE actor = ${actor} AND operation_id = ${id}::uuid`
    )[0];
  }
  async approveNative(
    target: Target,
    content: Content,
    current: NativePage | null,
  ) {
    const model = this.model(target.page_type);
    let data: Record<string, unknown>;
    if (isSplit(target.page_type)) {
      const page = { ...content, slug: target.slug };
      data = { draftContent: page, publishedContent: page };
    } else {
      data = { ...content, ...whereTarget(target), status: 'PUBLISHED' };
      if (target.page_type === 'blog') {
        data.thumbnail = content.thumbnail ?? Prisma.DbNull;
        data.dateModified = new Date(`${content.dateModified}T00:00:00Z`);
        data.datePublished = content.datePublished
          ? new Date(`${content.datePublished}T00:00:00Z`)
          : null;
      } else {
        data.heroImage = content.heroImage ?? Prisma.DbNull;
        data.marketImage = content.marketImage ?? Prisma.DbNull;
        if (target.page_type === 'state')
          data.stateCities = content.stateCities ?? Prisma.DbNull;
        data.statOverrides =
          pruneOverrides(
            content.statOverrides as Parameters<typeof pruneOverrides>[0],
          ) ?? Prisma.DbNull;
      }
    }
    if (!current)
      await model.create({ data: { ...data, ...whereTarget(target) } });
    else if (
      (
        await model.updateMany({
          where: { ...whereTarget(target), updatedAt: current.updatedAt },
          data,
        })
      ).count !== 1
    )
      throw new CmsError(
        'STALE_PAGE',
        'The page changed. Prepare a fresh import.',
        409,
      );
  }
  async finishReview(id: string, actor: string, approved: boolean) {
    await this.db
      .$executeRaw`DELETE FROM cms_agent_private.drafts WHERE import_id = ${id}::uuid`;
    await this.db
      .$executeRaw`UPDATE cms_agent_private.imports SET state = ${approved ? 'APPROVED' : 'DISCARDED'}, reviewed_by = ${actor}, reviewed_at = now() WHERE id = ${id}::uuid`;
  }
  queue() {
    return this.db.$queryRaw<
      Array<
        Pick<ImportRecord, 'id' | 'actor' | 'state'> & {
          page_type: string;
          page_count: number;
          created_at: Date;
        }
      >
    >`SELECT id, actor, state, payload->>'page_type' AS page_type, jsonb_array_length(payload->'changes') AS page_count, created_at FROM cms_agent_private.imports WHERE state = 'DRAFT' ORDER BY created_at DESC LIMIT 100`;
  }
}
export type Repository = Pick<CmsRepository, keyof CmsRepository>;
export const transaction = <T>(work: (repo: CmsRepository) => Promise<T>) =>
  prisma.$transaction((db) => work(new CmsRepository(db)), {
    timeout: 15000,
    maxWait: 5000,
  });
