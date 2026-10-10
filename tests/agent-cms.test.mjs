import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  disconnected,
  schemas,
  service,
  fixtures,
  row,
  csv,
  memory,
  loader,
} from './helpers/agent-cms.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
const write = (p) => ({
  preview_id: p.preview_id,
  preview_hash: p.preview_hash,
  review_url: p.review_url,
  operation_id: randomUUID(),
});
const code = (name) => (error) => error.code === name;

for (const version of [1, 2]) for (const source of ['native', 'import'])
  test(`legacy v${version} Bangalore ${source} content reads and edits through the current schema without rewriting snapshots`, async () => {
    const h = memory(), target = fixtures.ad.target;
    const legacy = JSON.parse(readFileSync(new URL(`./fixtures/bangalore-v${version}.json`, import.meta.url), 'utf8'));
    legacy.copy.heroHeading = 'Retained native heading';
    const native = { slug: target.slug, draftContent: legacy, publishedContent: legacy,
      deployedContent: legacy, updatedAt: new Date('2026-10-09T00:00:00Z') };
    h.state().native.set('ad/bangalore', native);
    let editable = legacy;
    if (source === 'import') {
      editable = structuredClone(legacy);
      delete editable.slug;
      editable.copy.heroHeading = 'Retained private import heading';
      h.state().drafts.set('ad/bangalore', { ref: 'ad/bangalore', revision: randomUUID(), content: editable,
        base_version: schemas.digest(native), actor: h.actor, import_id: randomUUID() });
    }
    const original = structuredClone(h.state());
    const read = await h.call('read_page', target);
    assert.equal(read.content.version, 3);
    for (const key of schemas.schemaFor('ad').json_schema.required) assert.ok(key in read.content, key);
    assert.equal(read.content.copy.heroHeading, editable.copy.heroHeading);
    assert.deepEqual(schemas.parseContent(target, read.content), read.content, 'API content must round-trip');
    assert.deepEqual(read.approved_content, legacy);
    assert.deepEqual(read.deployed_snapshot, legacy);
    assert.deepEqual(h.state(), original, 'Reading must not migrate storage or alter historical snapshots');

    const faqs = [{ q: 'New question?', a: 'New answer.' }];
    const plan = await h.prepare('ad', [{ slug: target.slug, faqs }]);
    assert.equal(plan.valid, true, JSON.stringify(plan));
    assert.deepEqual(plan.changes[0].diff.map(item => item.field), ['faqs']);
    assert.equal(plan.changes[0].before.version, 3);
    assert.equal(plan.changes[0].after.copy.heroHeading, editable.copy.heroHeading);
    await h.call('edit_drafts', write(plan));
    assert.deepEqual(h.state().native, original.native, 'An import draft must not replace native or approved content');
    assert.equal(h.state().drafts.get('ad/bangalore').content.version, 3);
    assert.deepEqual(h.state().drafts.get('ad/bangalore').content.faqs, faqs);
  });

for (const type of ['city', 'state', 'micromarket'])
  test(`${type}: invalid geography slugs do not block valid discovery or imports`, async () => {
    const h = memory(), fixture = fixtures[type], inventory = h.deps.inventory;
    h.deps.inventory = async (requested) => [
      ...(await inventory(requested)),
      { ...fixture.target, slug: 'legacy/slug', name: 'Legacy' },
      ...(type === 'micromarket'
        ? [{ ...fixture.target, city_slug: 'legacy/city', name: 'Legacy city' }]
        : []),
    ];
    const listed = await h.call('list_pages', { page_type: type });
    assert.deepEqual(listed.items.map((item) => item.target), [fixture.target]);
    assert.equal((await h.prepare(type)).valid, true);
    await assert.rejects(h.call('read_page', { ...fixture.target, slug: 'legacy/slug' }));
    await assert.rejects(h.prepare(type, [row({ ...fixture.target, slug: 'legacy/slug' }, fixture.content)]));
    // Discovery must not turn a malformed source identity into an invented URL.
    const invented = await h.prepare(type, [row({ ...fixture.target, slug: 'legacy-slug' }, fixture.content)]);
    assert.equal(invented.valid, false);
    assert.equal(invented.saved_drafts, 0);
    assert.match(invented.errors[0].message, /Unknown CMS target/);
  });

test('canonical backend city slugs with repeated hyphens can be discovered and imported unchanged', async () => {
  const h = memory();
  const target = { page_type: 'city', slug: 'chhatrapati-sambhajinagar--aurangabad' };
  const inventory = h.deps.inventory;
  h.deps.inventory = async type => [...await inventory(type), { ...target, name: 'Aurangabad' }];
  assert.ok((await h.call('list_pages', { page_type: 'city' })).items.some(item => item.target.slug === target.slug));
  const preview = await h.prepare('city', [row(target, fixtures.city.content)]);
  assert.equal(preview.valid, true, JSON.stringify(preview));
  const saved = await h.call('fill_empty_drafts', write(preview));
  assert.equal(saved.data.published, false);
  assert.ok(h.state().drafts.has(schemas.pageRef(target)));
});

for (const [type, fixture] of Object.entries(fixtures))
  test(`${type}: schema, CSV, private draft and CMS approval round trip`, async () => {
    const h = memory(),
      schema = schemas.schemaFor(type);
    assert.equal(schema.schema_version.length, 64);
    assert.equal(schema.columns.includes('status'), false);
    assert.equal(schema.json_schema.additionalProperties, false);
    const preview = await h.prepare(type);
    assert.equal(preview.valid, true, JSON.stringify(preview));
    assert.equal(preview.mode, 'empty');
    assert.ok(preview.changes[0].diff.length);
    assert.equal(h.state().drafts.size, 0);
    const args = write(preview),
      saved = await h.call('fill_empty_drafts', args);
    assert.equal(saved.data.published, false);
    assert.equal(h.state().native.size, 0);
    assert.equal(h.state().approved.length, 0);
    assert.deepEqual(
      h.state().drafts.get(schemas.pageRef(fixture.target)).content,
      schemas.parseContent(fixture.target, fixture.content),
    );
    assert.equal((await h.call('fill_empty_drafts', args)).outcome, 'replayed');
    await assert.rejects(
      h.call('fill_empty_drafts', { ...args, operation_id: randomUUID() }),
      code('IDEMPOTENCY_CONFLICT'),
    );
    assert.equal(
      (await h.call('read_page', fixture.target)).has_import_draft,
      true,
    );
    assert.equal(
      (await h.call('list_pages', { page_type: type, has_import_draft: true }))
        .items.length,
      1,
    );
    assert.deepEqual(
      await service.reviewImport(
        preview.preview_id,
        preview.preview_hash,
        'approver@example.test',
        true,
        h.deps,
      ),
      { state: 'APPROVED', builds_triggered: 0 },
    );
    assert.equal(h.state().drafts.size, 0);
    assert.equal(h.state().approved.length, 1);
  });
test('CSV handles BOM, CRLF, escaped quotes, commas, multiline text and explicit clears', () => {
  const text =
    '\uFEFF' +
    csv([
      {
        slug: 'test',
        title: 'A, "quoted"\nheading',
        author: null,
        related: [],
      },
    ]);
  const [item] = schemas.csvRows('blog', text);
  assert.equal(item.patch.title, 'A, "quoted"\nheading');
  assert.equal(item.patch.author, null);
  assert.deepEqual(item.patch.related, []);
  assert.deepEqual(
    schemas.csvRows(
      'service',
      'slug,title,summary\nwarehouse-search,,""""""',
    )[0].patch,
    { summary: '' },
  );
});
for (const [label, text] of Object.entries({
  quotes: 'slug,title\nx,"unclosed',
  extra: 'slug,title\nx,a,b',
  headers: 'slug,title,title\nx,a,b',
  duplicate: 'slug,title\nx,a\nx,b',
  publication: 'slug,status\nx,PUBLISHED',
  timestamp: 'slug,updatedAt\nx,today',
  formulaSlug: 'slug,title\n=evil,a',
  nul: 'slug,title\nx,\0',
  rows:
    'slug,title\n' +
    Array.from({ length: 21 }, (_, i) => `x-${i},title`).join('\n'),
  bytes: 'slug,title\nx,' + 'अ'.repeat(8000),
}))
  test(`rejects malformed or unsafe CSV: ${label}`, () =>
    assert.throws(() => schemas.csvRows('blog', text)));
test('nested unknown keys and legal date refinements are preserved by authoritative validation', () => {
  const blog = fixtures.blog;
  assert.throws(
    () =>
      schemas.parseContent(blog.target, {
        ...blog.content,
        blocks: [{ kind: 'p', text: 'Copy', published: true }],
      }),
    code('UNKNOWN_FIELD'),
  );
  const legal = fixtures.legal;
  assert.throws(() =>
    schemas.parseContent(legal.target, {
      ...legal.content,
      updated: '2025-01-01',
    }),
  );
});
test('location imports follow the kind table: corridors city-only, cities state-only, compliance both', () => {
  const columns = (type) => schemas.schemaFor(type).columns;
  for (const field of ['complianceHeading', 'complianceProse']) {
    assert.ok(columns('city').includes(field));
    assert.ok(columns('state').includes(field));
  }
  assert.ok(columns('city').includes('corridorProse'));
  assert.equal(columns('state').includes('corridorProse'), false);
  assert.ok(columns('state').includes('citiesHeading'));
  assert.equal(columns('city').includes('citiesHeading'), false);
  assert.equal(columns('micromarket').some((c) => /corridor|compliance|cities/.test(c)), false);
  const state = schemas.parseContent(fixtures.state.target, {
    ...fixtures.state.content,
    citiesHeading: 'Cities with stock',
    complianceProse: 'State rules.',
  });
  assert.equal(state.citiesHeading, 'Cities with stock');
  assert.equal(state.complianceProse, 'State rules.');
  assert.equal(state.complianceHeading, null);
  assert.throws(() =>
    schemas.parseContent(fixtures.state.target, { ...fixtures.state.content, corridorProse: 'City copy.' }),
  );
  assert.throws(() =>
    schemas.parseContent(fixtures.city.target, { ...fixtures.city.content, citiesHeading: 'State copy.' }),
  );
  // Existing state rows expose the new fields, so missing CSV columns preserve them.
  const repository = disconnected('lib/agent-cms/repository.ts');
  const native = repository.nativeContent('state', {
    kind: 'STATE', slug: 'test-state', ...fixtures.state.content, status: 'PUBLISHED',
    corridorHeading: 'Stray', corridorProse: 'Stray', complianceHeading: 'Approvals',
    complianceProse: 'State rules.', citiesHeading: 'Cities with stock',
  });
  assert.equal(native.citiesHeading, 'Cities with stock');
  assert.equal(native.complianceProse, 'State rules.');
  assert.equal(Object.hasOwn(native, 'corridorProse'), false);
});
test('state imports carry the CMS city list with its validation; city imports reject it', () => {
  const columns = (type) => schemas.schemaFor(type).columns;
  assert.ok(columns('state').includes('stateCities'));
  assert.equal(columns('city').includes('stateCities'), false);
  assert.equal(columns('micromarket').includes('stateCities'), false);
  const list = [
    { name: 'Mysuru', slug: 'mysuru', image: null },
    { name: 'Hosapete', slug: null, image: null },
  ];
  const state = (stateCities) =>
    schemas.parseContent(fixtures.state.target, { ...fixtures.state.content, stateCities });
  assert.deepEqual(state(list).stateCities, list);
  assert.equal(state([]).stateCities, null, 'An empty list clears to the default four.');
  assert.equal(state(null).stateCities, null);
  assert.equal(
    schemas.parseContent(fixtures.state.target, fixtures.state.content).stateCities,
    null,
  );
  assert.throws(() => state([...list, { name: 'mysuru', slug: null, image: null }]), /listed twice/);
  assert.throws(() => state(Array.from({ length: 9 }, (_, i) => ({ name: `City ${i}`, slug: null }))));
  assert.throws(() =>
    schemas.parseContent(fixtures.city.target, { ...fixtures.city.content, stateCities: list }),
  );
  const repository = disconnected('lib/agent-cms/repository.ts');
  const row = { kind: 'STATE', slug: 'test-state', ...fixtures.state.content, status: 'PUBLISHED', stateCities: list };
  assert.deepEqual(repository.nativeContent('state', row).stateCities, list);
  assert.equal(repository.nativeContent('state', { ...row, stateCities: null }).stateCities, null);
  assert.equal(
    Object.hasOwn(repository.nativeContent('city', { ...row, kind: 'CITY' }), 'stateCities'),
    false,
  );
});
test('ad parser errors are returned as row validation errors', async () => {
  const h = memory(),
    fixture = fixtures.ad;
  const p = await h.prepare('ad', [
    row(fixture.target, { ...fixture.content, version: 999 }),
  ]);
  assert.equal(p.valid, false);
  assert.equal(p.errors[0].row, 2);
  assert.equal(h.state().imports.size, 0);
});
test('one invalid row saves neither preview nor drafts; schema changes and unknown targets fail', async () => {
  const h = memory();
  const p = await h.prepare('blog', [
    row(fixtures.blog.target, fixtures.blog.content),
    { slug: 'second', title: 'Missing required fields' },
  ]);
  assert.equal(p.valid, false);
  assert.equal(p.errors[0].row, 3);
  assert.equal(h.state().imports.size, 0);
  await assert.rejects(
    h.call('prepare_import', {
      page_type: 'blog',
      schema_version: 'a'.repeat(64),
      csv_text: 'slug,title\nx,y',
    }),
    code('SCHEMA_CHANGED'),
  );
  assert.equal(
    (
      await h.prepare('service', [
        row(
          { page_type: 'service', slug: 'invented' },
          fixtures.service.content,
        ),
      ])
    ).valid,
    false,
  );
  await assert.rejects(
    h.call('read_page', { page_type: 'micromarket', slug: 'test-market' }),
  );
});
test('published edits preserve missing/empty columns and always require edit mode', async () => {
  const h = memory(),
    fixture = fixtures.service,
    content = { ...fixture.content, slug: fixture.target.slug };
  const native = {
    ...fixture.target,
    draftContent: content,
    publishedContent: content,
    deployedContent: content,
    updatedAt: new Date(),
  };
  h.state().native.set('service/warehouse-search', native);
  const p = await h.prepare('service', [
    { slug: 'warehouse-search', title: 'New title', summary: undefined },
  ]);
  assert.equal(p.mode, 'edit');
  assert.deepEqual(p.changes[0].diff, [
    { field: 'title', before: 'Service', after: 'New title' },
  ]);
  assert.equal(p.changes[0].after.summary, fixture.content.summary);
  await assert.rejects(
    h.call('fill_empty_drafts', write(p)),
    code('WRONG_WRITE_MODE'),
  );
  await h.call('edit_drafts', write(p));
  assert.deepEqual(h.state().native.get('service/warehouse-search'), native);
  assert.equal(
    (
      await h.call('list_pages', {
        page_type: 'service',
        state: 'published',
        has_import_draft: true,
      })
    ).items.length,
    1,
  );
});
test('a title-only native draft is not entirely empty; existing private drafts require confirmation', async () => {
  const h = memory();
  h.state().native.set('service/warehouse-search', {
    slug: 'warehouse-search',
    draftContent: {
      ...fixtures.service.content,
      blocks: [],
      summary: '',
      description: '',
      seoTitle: '',
    },
    publishedContent: null,
    deployedContent: null,
  });
  assert.equal((await h.prepare('service')).mode, 'edit');
  const p = await h.prepare();
  await h.call('fill_empty_drafts', write(p));
  const edit = await h.prepare('blog', [
    { slug: 'test-blog', title: 'Edited draft' },
  ]);
  assert.equal(edit.mode, 'edit');
});
test('stale second row rolls back the first draft, and concurrent previews cannot overwrite', async () => {
  const h = memory();
  const p = await h.prepare('blog', [
    { ...row(fixtures.blog.target, fixtures.blog.content), slug: 'a' },
    { ...row(fixtures.blog.target, fixtures.blog.content), slug: 'b' },
  ]);
  h.state().native.set('blog/b', { changed: true });
  await assert.rejects(
    h.call('fill_empty_drafts', write(p)),
    code('STALE_PAGE'),
  );
  assert.equal(h.state().drafts.size, 0);
  assert.equal(h.state().imports.get(p.preview_id).state, 'PREPARED');
  const other = memory(),
    p1 = await other.prepare(),
    p2 = await other.prepare();
  const results = await Promise.allSettled([
    other.call('fill_empty_drafts', write(p1)),
    other.call('fill_empty_drafts', write(p2)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(other.state().drafts.size, 1);
});
test('hash, actor, exact review URL, expiry and idempotency bind an immutable preview', async () => {
  const h = memory(),
    p = await h.prepare(),
    args = write(p);
  await assert.rejects(
    h.call('read_import', { preview_id: p.preview_id }, 'other@example.test'),
    code('IMPORT_NOT_FOUND'),
  );
  for (const changed of [
    { preview_hash: 'a'.repeat(64) },
    { review_url: 'https://evil.example/imports' },
  ])
    await assert.rejects(
      h.call('fill_empty_drafts', { ...args, ...changed }),
      code('PREVIEW_MISMATCH'),
    );
  h.advance(86400001);
  await assert.rejects(
    h.call('fill_empty_drafts', args),
    code('PREVIEW_EXPIRED'),
  );
  assert.equal(h.state().drafts.size, 0);
});
test('superseded draft cannot be approved, and discarding its old import preserves the new one', async () => {
  const h = memory(),
    first = await h.prepare();
  await h.call('fill_empty_drafts', write(first));
  const second = await h.prepare('blog', [
    { slug: 'test-blog', title: 'New draft title' },
  ]);
  await h.call('edit_drafts', write(second));
  await assert.rejects(
    service.reviewImport(
      first.preview_id,
      first.preview_hash,
      h.actor,
      true,
      h.deps,
    ),
    code('STALE_DRAFT'),
  );
  await service.reviewImport(
    first.preview_id,
    first.preview_hash,
    h.actor,
    false,
    h.deps,
  );
  assert.equal(
    h.state().drafts.get('blog/test-blog').import_id,
    second.preview_id,
  );
});
test('human approval revalidates publish rules, versions, geography and related references', async () => {
  for (const reason of ['incomplete', 'version', 'geography', 'related']) {
    const h = memory(),
      type =
        reason === 'incomplete'
          ? 'service'
          : reason === 'geography'
            ? 'city'
            : 'blog';
    const fixture = fixtures[type];
    const content =
      reason === 'incomplete'
        ? { ...fixture.content, summary: '', blocks: [] }
        : reason === 'related'
          ? { ...fixture.content, related: ['missing'] }
          : fixture.content;
    const p = await h.prepare(type, [row(fixture.target, content)]);
    await h.call('fill_empty_drafts', write(p));
    if (reason === 'version')
      h.state().native.set(schemas.pageRef(fixture.target), { changed: true });
    if (reason === 'geography') h.deps.inventory = async () => [];
    await assert.rejects(
      service.reviewImport(p.preview_id, p.preview_hash, h.actor, true, h.deps),
    );
    assert.equal(h.state().approved.length, 0);
    assert.equal(h.state().drafts.size, 1);
  }
});
test('no API action can approve, publish, unpublish, delete or start a build', async () => {
  const h = memory();
  for (const action of ['approve', 'publish', 'unpublish', 'delete', 'deploy'])
    await assert.rejects(h.call(action, {}), code('UNKNOWN_ACTION'));
});

const protocol = disconnected('lib/agent-cms/protocol.ts');
const pair = generateKeyPairSync('ed25519'),
  now = Date.now();
const env = {
  CMS_CONTEXT_ENABLED: 'true',
  CMS_CONTEXT_PUBLIC_KEYS_JSON: JSON.stringify([
    {
      kid: 'test',
      expiresAt: new Date(now + 86400000).toISOString(),
      publicKey: pair.publicKey.export({ format: 'jwk' }),
    },
  ]),
};
function signed(overrides = {}, headers = {}, mutate = (x) => x) {
  const raw = JSON.stringify({
    actor_email: 'editor@example.test',
    actor_id: 7,
    action: 'schema',
    args: {},
    issued_at: now,
    expires_at: now + 60000,
    request_id: randomUUID(),
    audience: 'wareongo:cms-drafts:v1',
    ...overrides,
  });
  return new Request(
    'https://cms.example.test/api/integrations/context-engine',
    {
      method: 'POST',
      body: mutate(raw),
      headers: {
        'content-type': 'application/json',
        authorization: `ContextEngine test.${sign(null, Buffer.from(raw), pair.privateKey).toString('base64url')}`,
        ...headers,
      },
    },
  );
}
test('signed integration requires current editor allowlist and exact untampered short-lived employee claims', async () => {
  assert.equal(
    (await protocol.authenticatedRequest(signed(), () => true, env, now))
      .actor_id,
    7,
  );
  await assert.rejects(
    protocol.authenticatedRequest(signed(), () => false, env, now),
    code('CMS_FORBIDDEN'),
  );
  for (const claims of [
    { expires_at: now },
    { expires_at: now + 60001 },
    { issued_at: now + 10000 },
    { actor_email: 'EDITOR@example.test' },
    { action: 'publish' },
    { audience: 'different-service' },
  ])
    await assert.rejects(
      protocol.authenticatedRequest(signed(claims), () => true, env, now),
    );
  await assert.rejects(
    protocol.authenticatedRequest(
      signed({}, {}, (raw) => raw.replace('editor@', 'other@')),
      () => true,
      env,
      now,
    ),
    code('CMS_UNAUTHORIZED'),
  );
  await assert.rejects(
    protocol.authenticatedRequest(
      signed({}, { origin: 'https://cms.example.test' }),
      () => true,
      env,
      now,
    ),
    code('CMS_UNAUTHORIZED'),
  );
  await assert.rejects(
    protocol.authenticatedRequest(
      signed(),
      () => true,
      { ...env, CMS_CONTEXT_ENABLED: 'false' },
      now,
    ),
    code('CMS_DISABLED'),
  );
  await assert.rejects(
    protocol.authenticatedRequest(
      signed({ args: { huge: 'x'.repeat(33000) } }),
      () => true,
      env,
      now,
    ),
    code('BODY_TOO_LARGE'),
  );
});

test('CMS approval actions authenticate before any mutation and bind the displayed ID/hash', async () => {
  const form = new FormData(),
    id = randomUUID(),
    hash = 'a'.repeat(64),
    calls = [];
  form.set('id', id);
  form.set('hash', hash);
  form.set('intent', 'approve');
  process.env.CMS_CONTEXT_ENABLED = 'true';
  for (const denied of [true, false]) {
    const load = loader({
      '@/lib/auth': {
        requireUser: async () => {
          if (denied) throw new Error('unauthenticated');
          return { email: 'reviewer@example.test' };
        },
      },
      '@/lib/agent-cms/service': {
        reviewImport: async (...args) => {
          calls.push(args);
        },
      },
      'next/navigation': {
        redirect: (location) => {
          throw Object.assign(new Error('redirect'), { location });
        },
      },
    });
    const action = load('app/(authed)/imports/actions.ts').reviewAction;
    await assert.rejects(action(form), (e) =>
      denied
        ? e.message === 'unauthenticated'
        : e.location === `/imports/${id}`,
    );
    assert.equal(calls.length, denied ? 0 : 1);
  }
  assert.deepEqual(calls[0], [id, hash, 'reviewer@example.test', true]);
  delete process.env.CMS_CONTEXT_ENABLED;
});
test('CMS diff review escapes source content and exposes approval only for saved drafts', async () => {
  const id = randomUUID(),
    payload = {
      changes: [
        {
          ref: 'blog/test',
          diff: [
            {
              field: 'title',
              before: 'Old title',
              after: '<script>alert(1)</script>',
            },
          ],
        },
      ],
    };
  const record = {
    id,
    hash: 'a'.repeat(64),
    state: 'PREPARED',
    actor: 'editor@example.test',
    payload,
  };
  process.env.CMS_CONTEXT_ENABLED = 'true';
  const load = loader({
    '@/lib/auth': {
      requireUser: async () => ({ email: 'reviewer@example.test' }),
    },
    '@/lib/agent-cms/repository': {
      transaction: async (work) => work({ import: async () => record }),
    },
    'next/navigation': {
      notFound: () => {
        throw new Error('not found');
      },
    },
    [new URL('../app/(authed)/imports/actions.ts', import.meta.url).pathname]: {
      reviewAction: async () => {},
    },
  });
  const page = load('app/(authed)/imports/[id]/page.tsx').default;
  const render = async () =>
    renderToStaticMarkup(
      await page({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }),
    );
  let html = await render();
  assert.ok(html.includes('Old title'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('Approve for next build'));
  record.state = 'DRAFT';
  html = await render();
  assert.ok(html.includes('Approve for next build'));
  assert.ok(html.includes(record.hash));
  delete process.env.CMS_CONTEXT_ENABLED;
});
