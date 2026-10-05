import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { loader, schemas, fixtures, row, csv } from './helpers/agent-cms.mjs';

// Explicit disposable DB only. Never reads DATABASE_URL or the app's .env.
const url = process.env.CMS_TEST_DATABASE_URL;
if (!url)
  test(
    'PostgreSQL CMS integration (set CMS_TEST_DATABASE_URL and CMS_TEST_MIGRATION)',
    { skip: true },
    () => {},
  );
else {
  const parsed = new URL(url);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/cms_agent_test' ||
    parsed.username !== 'cms_test'
  )
    throw new Error(
      'Use a dedicated local cms_agent_test database owned by cms_test.',
    );
  const db = new PrismaClient({ datasources: { db: { url } } });
  const load = loader({
    [path.resolve(import.meta.dirname, '../lib/prisma.ts')]: { prisma: db },
  });
  const { cmsOperation, reviewImport } = load('lib/agent-cms/service.ts');
  const { transaction } = load('lib/agent-cms/repository.ts');
  const inventory = async (type) =>
    Object.values(fixtures)
      .filter((f) => f.target.page_type === type)
      .map((f) => ({
        ...f.target,
        name: 'Synthetic target',
        path: '/synthetic',
      }));
  const deps = { transaction, inventory, now: Date.now },
    actor = 'editor@example.test';
  const call = (action, args) => cmsOperation(action, args, actor, deps);
  const prepare = (type = 'blog', rows) =>
    call('prepare_import', {
      page_type: type,
      schema_version: schemas.schemaFor(type).schema_version,
      csv_text: csv(
        rows ?? [row(fixtures[type].target, fixtures[type].content)],
      ),
    });
  const write = (p) => ({
    preview_id: p.preview_id,
    preview_hash: p.preview_hash,
    review_url: p.review_url,
    operation_id: randomUUID(),
  });
  const q = (name) => `"${name.replaceAll('"', '""')}"`,
    lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const models = Prisma.dmmf.datamodel.models;
  before(async () => {
    for (const model of models)
      await db.$executeRawUnsafe(
        `DROP TABLE IF EXISTS ${q(model.name)} CASCADE`,
      );
    for (const e of Prisma.dmmf.datamodel.enums)
      await db.$executeRawUnsafe(`DROP TYPE IF EXISTS ${q(e.name)}`);
    // The generated CMS model metadata supplies synthetic table fixtures only;
    // production schema changes belong to the backend-owned SQL migration.
    for (const e of Prisma.dmmf.datamodel.enums)
      await db.$executeRawUnsafe(
        `CREATE TYPE ${q(e.name)} AS ENUM (${e.values.map((v) => lit(v.name)).join(',')})`,
      );
    for (const model of models) {
      const fields = model.fields.map((f) => {
        const type =
          f.kind === 'enum'
            ? q(f.type)
            : {
                String: 'text',
                Int: f.default?.name === 'autoincrement' ? 'serial' : 'integer',
                DateTime: 'timestamp(3)',
                Json: 'jsonb',
              }[f.type];
        if (!type) throw new Error(`Unsupported fixture type ${f.type}`);
        const def =
          f.default?.name === 'now'
            ? ' DEFAULT now()'
            : f.hasDefaultValue && !f.default?.name
              ? ` DEFAULT ${f.isList ? "'{}'" : lit(f.default)}`
              : '';
        return `${q(f.name)} ${type}${f.isList ? '[]' : ''}${f.isRequired ? ' NOT NULL' : ''}${f.isId ? ' PRIMARY KEY' : f.isUnique ? ' UNIQUE' : ''}${def}`;
      });
      for (const fieldsList of model.uniqueFields)
        fields.push(`UNIQUE (${fieldsList.map(q).join(',')})`);
      await db.$executeRawUnsafe(
        `CREATE TABLE ${q(model.name)} (${fields.join(',')})`,
      );
    }
    // Prisma raw execution cannot submit multiple commands. The transaction is
    // held on one connection, including the DO block in the additive migration.
    const sql = fs.readFileSync(process.env.CMS_TEST_MIGRATION, 'utf8');
    const blocks = [];
    const statements = sql
      .replace(/--[^\n]*/g, '')
      .replace(
        /DO \$\$[\s\S]*?\$\$;/g,
        (block) => `__BLOCK_${blocks.push(block) - 1}__;`,
      )
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !['BEGIN', 'COMMIT'].includes(s))
      .map((s) =>
        /^__BLOCK_(\d+)__$/.test(s)
          ? blocks[Number(/^__BLOCK_(\d+)__$/.exec(s)[1])]
          : s,
      );
    await db.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      `TRUNCATE cms_agent_private.drafts, cms_agent_private.imports, ${models.map((m) => q(m.name)).join(',')} RESTART IDENTITY CASCADE`,
    );
  });
  after(async () => {
    await db.$disconnect();
  });

  for (const type of schemas.pageTypes)
    test(`PostgreSQL ${type}: draft isolation, durable replay and explicit CMS approval`, async () => {
      const fixture = fixtures[type],
        p = await prepare(type),
        args = write(p);
      assert.equal(p.valid, true, JSON.stringify(p));
      assert.equal(
        (await call('fill_empty_drafts', args)).data.published,
        false,
      );
      const repoModule = load('lib/agent-cms/repository.ts');
      assert.equal(await transaction((r) => r.native(fixture.target)), null);
      assert.equal((await call('fill_empty_drafts', args)).outcome, 'replayed');
      assert.equal(
        (await transaction((r) => r.draft(schemas.pageRef(fixture.target))))
          .import_id,
        p.preview_id,
      );
      assert.equal((await transaction((r) => r.queue()))[0].page_count, 1);
      assert.deepEqual(
        await reviewImport(p.preview_id, p.preview_hash, actor, true, deps),
        { state: 'APPROVED', builds_triggered: 0 },
      );
      const native = await transaction((r) => r.native(fixture.target));
      assert.deepEqual(
        schemas.parseContent(
          fixture.target,
          repoModule.nativeContent(type, native),
        ),
        schemas.parseContent(fixture.target, fixture.content),
      );
      assert.equal(native.deployedContent, null);
      assert.equal(
        (await call('read_import', { preview_id: p.preview_id })).state,
        'APPROVED',
      );
    });
  test('PostgreSQL serializes concurrent first writes and rejects the stale preview', async () => {
    const first = await prepare(),
      second = await prepare();
    const results = await Promise.allSettled([
      call('fill_empty_drafts', write(first)),
      call('fill_empty_drafts', write(second)),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.code,
      'STALE_PAGE',
    );
    assert.equal(
      (await db.$queryRaw`SELECT * FROM cms_agent_private.drafts`).length,
      1,
    );
  });
  test('PostgreSQL rolls back all rows when a later target changed', async () => {
    const first = row({ page_type: 'blog', slug: 'a' }, fixtures.blog.content),
      second = { ...first, slug: 'z' };
    const batch = await prepare('blog', [first, second]),
      competing = await prepare('blog', [second]);
    await call('fill_empty_drafts', write(competing));
    await assert.rejects(
      call('fill_empty_drafts', write(batch)),
      (e) => e.code === 'STALE_PAGE',
    );
    assert.equal(
      (await db.$queryRaw`SELECT * FROM cms_agent_private.drafts`).length,
      1,
    );
    assert.equal(
      (await call('read_import', { preview_id: batch.preview_id })).state,
      'PREPARED',
    );
  });
  test('PostgreSQL native row locks wait for an editor and then reject the old preview', async () => {
    const p = await prepare('service');
    await call('fill_empty_drafts', write(p));
    await reviewImport(p.preview_id, p.preview_hash, actor, true, deps);
    const edit = await prepare('service', [
      { slug: 'warehouse-search', title: 'Imported edit' },
    ]);
    let release, locked;
    const ready = new Promise((resolve) => {
        locked = resolve;
      }),
      held = new Promise((resolve) => {
        release = resolve;
      });
    const editor = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT slug FROM "ServicePage" WHERE slug = 'warehouse-search' FOR UPDATE`;
      locked();
      await held;
      await tx.servicePage.update({
        where: { slug: 'warehouse-search' },
        data: {
          draftContent: {
            ...fixtures.service.content,
            slug: 'warehouse-search',
            title: 'Human edit',
          },
        },
      });
    });
    await ready;
    const saving = call('edit_drafts', write(edit));
    release();
    await editor;
    await assert.rejects(saving, (e) => e.code === 'STALE_PAGE');
    assert.equal(
      (await db.$queryRaw`SELECT * FROM cms_agent_private.drafts`).length,
      0,
    );
  });
  test('private tables enforce RLS and have no public privileges', async () => {
    const rows =
      await db.$queryRaw`SELECT c.relrowsecurity, EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r',c.relowner))) p WHERE p.grantee=0) AS public_access FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cms_agent_private' AND c.relkind='r'`;
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.relrowsecurity, true);
      assert.equal(r.public_access, false);
    }
  });
}
