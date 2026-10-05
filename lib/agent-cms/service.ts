import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CmsError,
  canonical,
  csvRows,
  digest,
  pageRef,
  pageTypes,
  parseContent,
  schemaFor,
  targetSchema,
  type Content,
  type Target,
  type PageType,
} from './schema';
import {
  inventory,
  nativeContent,
  nativeState,
  transaction,
  type Repository,
  type Draft,
  type NativePage,
} from './repository';

type Change = {
  row: number;
  target: Target;
  ref: string;
  base_version: string;
  draft_revision: string | null;
  empty: boolean;
  before: Content;
  after: Content;
  diff: Array<{ field: string; before: unknown; after: unknown }>;
};
type Plan = {
  page_type: PageType;
  schema_version: string;
  changes: Change[];
  mode: 'empty' | 'edit';
};
export type Dependencies = {
  transaction: <T>(work: (repo: Repository) => Promise<T>) => Promise<T>;
  inventory: typeof inventory;
  now: () => number;
};
const defaults: Dependencies = { transaction, inventory, now: Date.now };
const version = (row: unknown) => digest(row ?? null);
const writeArgs = z
  .object({
    preview_id: z.uuid(),
    preview_hash: z.string().regex(/^[a-f0-9]{64}$/),
    operation_id: z.uuid(),
    review_url: z.string().url(),
  })
  .strict();
const origin = () => {
  let url: URL;
  try {
    url = new URL(process.env.CMS_PUBLIC_ORIGIN ?? '');
  } catch {
    throw new CmsError(
      'CMS_CONFIGURATION',
      'CMS origin is not configured.',
      503,
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new CmsError(
      'CMS_CONFIGURATION',
      'CMS origin is not configured.',
      503,
    );
  return url.origin;
};
const reviewUrl = (id: string) => `${origin()}/imports/${id}`;
function nonempty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(nonempty);
  if (typeof value === 'object') return Object.values(value).some(nonempty);
  return true;
}
function entirelyEmpty(
  type: PageType,
  row: NativePage | null,
  draft: Draft | null,
) {
  if (
    draft ||
    (row && 'status' in row && row.status === 'PUBLISHED') ||
    (row && 'publishedContent' in row && nonempty(row.publishedContent)) ||
    nonempty(row?.deployedContent)
  )
    return false;
  const content = nativeContent(type, row);
  return !nonempty(
    Object.fromEntries(
      Object.entries(content).filter(
        ([key]) =>
          !['sortOrder', 'dateModified', 'datePublished'].includes(key),
      ),
    ),
  );
}
const planOf = (record: { payload: unknown }) => record.payload as Plan;
function publicPlan(record: {
  id: string;
  hash: string;
  state: string;
  expires_at: Date;
  payload: unknown;
}) {
  return {
    preview_id: record.id,
    preview_hash: record.hash,
    state: record.state,
    expires_at: record.expires_at,
    review_url: reviewUrl(record.id),
    ...planOf(record),
  };
}
async function ownPlan(
  repo: Repository,
  id: string,
  actor: string,
  lock = false,
) {
  const record = await repo.import(id, lock);
  if (!record || record.actor !== actor)
    throw new CmsError(
      'IMPORT_NOT_FOUND',
      'This import is not available to your identity.',
      404,
    );
  return record;
}
async function knownTargets(type: PageType, deps: Dependencies) {
  const values = await deps.inventory(type);
  if (values.length > 10000)
    throw new CmsError(
      'INVENTORY_LIMIT',
      'Inventory exceeds the import discovery limit.',
      503,
    );
  // Geography inventory can contain legacy, noncanonical slugs. They cannot
  // be addressed by the import protocol and must not break every valid page.
  // Preserve canonical identities exactly; never invent a replacement slug.
  const valid = values.filter((value) =>
    targetSchema.safeParse({
      page_type: value.page_type,
      slug: value.slug,
      ...(value.city_slug ? { city_slug: value.city_slug } : {}),
    }).success,
  );
  return new Map(valid.map((value) => [pageRef(value), value]));
}
function assertTarget(target: Target, known: Map<string, unknown>) {
  if (target.page_type !== 'blog' && !known.has(pageRef(target)))
    throw new CmsError(
      'UNKNOWN_PAGE',
      `Unknown CMS target ${pageRef(target)}.`,
    );
}

export async function cmsOperation(
  action: string,
  args: unknown,
  actor: string,
  overrides: Partial<Dependencies> = {},
) {
  const deps = { ...defaults, ...overrides };
  if (action === 'schema') {
    const input = z
      .object({ page_type: z.enum(pageTypes).optional() })
      .strict()
      .parse(args);
    return input.page_type
      ? schemaFor(input.page_type)
      : {
          page_types: [...pageTypes],
          instructions:
            'Request one page_type for its current JSON schema and CSV template.',
        };
  }
  if (action === 'read_import') {
    const input = z.object({ preview_id: z.uuid() }).strict().parse(args);
    return deps.transaction(async (repo) =>
      publicPlan(await ownPlan(repo, input.preview_id, actor)),
    );
  }
  if (action === 'read_page') {
    const target = targetSchema.parse(args),
      known = await knownTargets(target.page_type, deps);
    return deps.transaction(async (repo) => {
      const row = await repo.native(target),
        draft = await repo.draft(pageRef(target));
      if (!row && !draft) assertTarget(target, known);
      const approved =
        row && 'publishedContent' in row
          ? row.publishedContent
          : row && 'status' in row && row.status === 'PUBLISHED'
            ? nativeContent(target.page_type, row)
            : null;
      return {
        target,
        ref: pageRef(target),
        base_version: version(row),
        state: nativeState(target.page_type, row),
        has_import_draft: Boolean(draft),
        draft_revision: draft?.revision ?? null,
        content: draft?.content ?? nativeContent(target.page_type, row),
        approved_content: approved,
        deployed_snapshot: row?.deployedContent ?? null,
        live_verification: 'not_checked',
      };
    });
  }
  if (action === 'list_pages') {
    const input = z
      .object({
        page_type: z.enum(pageTypes),
        state: z
          .enum(['no_content', 'draft', 'published', 'staged'])
          .optional(),
        has_import_draft: z.boolean().optional(),
        after: z.string().max(400).optional(),
        limit: z.number().int().min(1).max(25).default(10),
      })
      .strict()
      .parse(args);
    const known = await knownTargets(input.page_type, deps);
    return deps.transaction(async (repo) => {
      const rows = await repo.all(input.page_type),
        drafts = await repo.drafts(input.page_type);
      if (rows.length > 5000 || drafts.length > 5000)
        throw new CmsError(
          'PAGE_LIMIT',
          'Page catalogue exceeds its discovery limit.',
          503,
        );
      const merged = new Map<
        string,
        {
          ref: string;
          target: Target;
          name: string;
          state: string;
          has_import_draft: boolean;
        }
      >(
        [...known].map(([ref, item]) => [
          ref,
          {
            ref,
            target: targetSchema.parse({
              page_type: item.page_type,
              slug: item.slug,
              ...(item.city_slug ? { city_slug: item.city_slug } : {}),
            }),
            name: item.name,
            state: 'no_content',
            has_import_draft: false,
          },
        ]),
      );
      for (const row of rows) {
        const target = {
          page_type: input.page_type,
          slug: row.slug,
          ...('citySlug' in row ? { city_slug: row.citySlug } : {}),
        };
        merged.set(pageRef(target), {
          ref: pageRef(target),
          target,
          name:
            'name' in row ? row.name : 'title' in row ? row.title : row.slug,
          state: nativeState(input.page_type, row),
          has_import_draft: false,
        });
      }
      for (const draft of drafts) {
        const segments = draft.ref.split('/');
        const item = merged.get(draft.ref) ?? {
          ref: draft.ref,
          target: targetSchema.parse({
            page_type: input.page_type,
            slug: segments.at(-1),
            ...(input.page_type === 'micromarket'
              ? { city_slug: segments[1] }
              : {}),
          }),
          name: String(
            draft.content.name ?? draft.content.title ?? segments.at(-1),
          ),
          state: 'no_content',
        };
        merged.set(draft.ref, { ...item, has_import_draft: true });
      }
      const items = [...merged.values()]
        .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
        .filter(
          (item) =>
            (!input.state || item.state === input.state) &&
            (input.has_import_draft === undefined ||
              item.has_import_draft === input.has_import_draft) &&
            (!input.after || item.ref > input.after),
        );
      return {
        items: items.slice(0, input.limit),
        nextCursor:
          items.length > input.limit ? items[input.limit - 1].ref : null,
        live_verification: 'not_checked',
        note: 'Published means a deploy was started with that snapshot; it does not verify the running website. Import drafts are separate from native publication state.',
      };
    });
  }
  if (action === 'prepare_import') {
    const input = z
      .object({
        page_type: z.enum(pageTypes),
        schema_version: z.string().regex(/^[a-f0-9]{64}$/),
        csv_text: z.string().max(24000),
      })
      .strict()
      .parse(args);
    if (schemaFor(input.page_type).schema_version !== input.schema_version)
      throw new CmsError(
        'SCHEMA_CHANGED',
        'Fetch the current schema and validate again.',
        409,
      );
    const rows = csvRows(input.page_type, input.csv_text),
      known = await knownTargets(input.page_type, deps);
    return deps.transaction(async (repo) => {
      const changes: Change[] = [],
        errors: Array<{ row: number; message: string }> = [];
      for (const item of rows)
        try {
          const current = await repo.native(item.target),
            ref = pageRef(item.target),
            draft = await repo.draft(ref);
          if (!current) assertTarget(item.target, known);
          if (draft && draft.base_version !== version(current))
            throw new CmsError(
              'STALE_DRAFT',
              'Existing import draft conflicts with the CMS. Review or discard it first.',
              409,
            );
          const before =
            draft?.content ?? nativeContent(input.page_type, current);
          const after = parseContent(item.target, { ...before, ...item.patch });
          const diff = Object.keys(after)
            .filter(
              (field) =>
                canonical(before[field] ?? null) !==
                canonical(after[field] ?? null),
            )
            .map((field) => ({
              field,
              before: before[field] ?? null,
              after: after[field] ?? null,
            }));
          if (!diff.length)
            throw new CmsError('NO_CHANGE', 'This row contains no change.');
          changes.push({
            row: item.row,
            target: item.target,
            ref,
            base_version: version(current),
            draft_revision: draft?.revision ?? null,
            empty: entirelyEmpty(input.page_type, current, draft),
            before,
            after,
            diff,
          });
        } catch (error) {
          if (error instanceof CmsError)
            errors.push({ row: item.row, message: error.message });
          else if (error instanceof z.ZodError)
            errors.push({
              row: item.row,
              message: error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; '),
            });
          else throw error;
        }
      if (errors.length) return { valid: false, errors, saved_drafts: 0 };
      const payload: Plan = {
        page_type: input.page_type,
        schema_version: input.schema_version,
        changes,
        mode: changes.every((c) => c.empty) ? 'empty' : 'edit',
      };
      if (Buffer.byteLength(canonical(payload)) > 75000)
        throw new CmsError(
          'PREVIEW_TOO_LARGE',
          'Split this CSV into smaller batches for complete diffs.',
        );
      const id = randomUUID(),
        hash = digest(payload);
      await repo.saveImport(id, actor, hash, payload);
      return {
        valid: true,
        ...publicPlan({
          id,
          hash,
          payload,
          state: 'PREPARED',
          expires_at: new Date(deps.now() + 86400000),
        }),
      };
    });
  }
  if (action === 'fill_empty_drafts' || action === 'edit_drafts') {
    const input = writeArgs.parse(args);
    return deps.transaction(async (repo) => {
      const record = await ownPlan(repo, input.preview_id, actor, true),
        plan = planOf(record);
      if (
        record.hash !== input.preview_hash ||
        input.review_url !== reviewUrl(record.id)
      )
        throw new CmsError(
          'PREVIEW_MISMATCH',
          'Use the exact preview hash and review URL.',
          409,
        );
      if ((action === 'fill_empty_drafts') !== (plan.mode === 'empty'))
        throw new CmsError(
          'WRONG_WRITE_MODE',
          'Use the execution mode from the preview.',
          409,
        );
      if (record.operation_id) {
        if (record.operation_id !== input.operation_id)
          throw new CmsError(
            'IDEMPOTENCY_CONFLICT',
            'Reuse the original operation ID.',
            409,
          );
        return { ...(record.receipt as Content), outcome: 'replayed' };
      }
      if (
        record.state !== 'PREPARED' ||
        new Date(record.expires_at).getTime() <= deps.now()
      )
        throw new CmsError('PREVIEW_EXPIRED', 'Prepare a fresh preview.', 409);
      if (await repo.operation(actor, input.operation_id))
        throw new CmsError(
          'IDEMPOTENCY_CONFLICT',
          'This operation ID belongs to another import.',
          409,
        );
      if (schemaFor(plan.page_type).schema_version !== plan.schema_version)
        throw new CmsError('SCHEMA_CHANGED', 'Prepare a fresh preview.', 409);
      for (const change of [...plan.changes].sort((a, b) =>
        a.ref < b.ref ? -1 : 1,
      )) {
        await repo.lock(change.target);
        const current = await repo.native(change.target),
          draft = await repo.draft(change.ref);
        if (
          version(current) !== change.base_version ||
          (draft?.revision ?? null) !== change.draft_revision
        )
          throw new CmsError(
            'STALE_PAGE',
            'A target or import draft changed. Prepare a new preview.',
            409,
          );
        if (
          action === 'fill_empty_drafts' &&
          !entirelyEmpty(plan.page_type, current, draft)
        )
          throw new CmsError(
            'PAGE_NOT_EMPTY',
            'Existing content requires confirmed editing.',
            409,
          );
        const content = parseContent(change.target, change.after);
        await repo.saveDraft({
          ref: change.ref,
          revision: randomUUID(),
          content,
          base_version: change.base_version,
          actor,
          import_id: record.id,
        });
      }
      const receipt = {
        operation_id: input.operation_id,
        outcome: 'updated',
        code: 'CMS_DRAFTS_SAVED',
        message:
          'Private import drafts saved. Publication requires approval in the CMS.',
        data: {
          preview_id: record.id,
          review_url: reviewUrl(record.id),
          pages: plan.changes.map((c) => c.ref),
          published: false,
        },
      };
      await repo.complete(record.id, input.operation_id, receipt);
      return receipt;
    });
  }
  throw new CmsError(
    'UNKNOWN_ACTION',
    'This integration exposes only schema, read, preview and draft operations.',
    404,
  );
}

/** Browser-authenticated CMS approval only. No integration action can call this. */
export async function reviewImport(
  id: string,
  expectedHash: string,
  actor: string,
  approve: boolean,
  overrides: Partial<Dependencies> = {},
) {
  z.uuid().parse(id);
  const deps = { ...defaults, ...overrides };
  const initial = await deps.transaction((repo) => repo.import(id));
  if (!initial)
    throw new CmsError('IMPORT_NOT_FOUND', 'Import not found.', 404);
  const known = approve
    ? await knownTargets(planOf(initial).page_type, deps)
    : new Map();
  return deps.transaction(async (repo) => {
    const record = await repo.import(id, true);
    if (!record || record.state !== 'DRAFT' || record.hash !== expectedHash)
      throw new CmsError(
        'STALE_IMPORT',
        'This review changed. Reload it.',
        409,
      );
    const plan = planOf(record);
    for (const change of [...plan.changes].sort((a, b) =>
      a.ref < b.ref ? -1 : 1,
    )) {
      await repo.lock(change.target);
      if (!approve) continue; // Discard only this import's remaining drafts; never newer ones.
      const draft = await repo.draft(change.ref);
      if (
        !draft ||
        draft.import_id !== id ||
        digest(draft.content) !== digest(change.after)
      )
        throw new CmsError(
          'STALE_DRAFT',
          'A draft was superseded. Review the latest import.',
          409,
        );
      const current = await repo.native(change.target);
      if (version(current) !== draft.base_version)
        throw new CmsError(
          'STALE_PAGE',
          'The CMS page changed. Prepare a new import before approval.',
          409,
        );
      const content = parseContent(change.target, draft.content, true);
      if (['city', 'state', 'micromarket'].includes(change.target.page_type)) {
        const entry = known.get(change.ref) as
          | { path?: string | null }
          | undefined;
        if (!entry?.path)
          throw new CmsError(
            'PAGE_NOT_ELIGIBLE',
            'Publication requires canonical geography and enough inventory.',
          );
      }
      const related = (content.related ??
        content.relatedBlogs ??
        []) as string[];
      for (const slug of related)
        if (
          (change.target.page_type === 'blog' && slug === change.target.slug) ||
          !(await repo.native({ page_type: 'blog', slug }))
        )
          throw new CmsError(
            'RELATED_BLOG_MISSING',
            'A related blog is missing or refers to itself.',
          );
      await repo.approveNative(change.target, content, current);
    }
    await repo.finishReview(id, actor, approve);
    return { state: approve ? 'APPROVED' : 'DISCARDED', builds_triggered: 0 };
  });
}
