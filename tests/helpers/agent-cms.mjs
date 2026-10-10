import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
process.env.CMS_PUBLIC_ORIGIN = 'https://cms.example.test';
// Exercise real schemas and services without a generated test build or network.
export function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (Object.hasOwn(mocks, file)) return mocks[file];
    if (cache.has(file)) return cache.get(file);
    if (!/\.tsx?$/.test(file)) return require(file);
    const loaded = { exports: {} };
    cache.set(file, loaded.exports);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const localRequire = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('.') || id.startsWith('@/')) {
        const base = id.startsWith('@/')
          ? path.join(root, id.slice(2))
          : path.resolve(path.dirname(file), id);
        const resolved = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          `${base}.mjs`,
        ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!resolved) throw new Error(`Missing module: ${id}`);
        return load(resolved);
      }
      return require(id);
    };
    vm.runInThisContext(
      `(function(exports,require,module,__filename,__dirname){${compiled}\n})`,
      { filename: file },
    )(loaded.exports, localRequire, loaded, file, path.dirname(file));
    return loaded.exports;
  }
  return load;
}
export const disconnected = loader({
  [path.join(root, 'lib/prisma.ts')]: {
    prisma: new Proxy(
      {},
      {
        get() {
          throw new Error('Unexpected database access');
        },
      },
    ),
  },
});
export const schemas = disconnected('lib/agent-cms/schema.ts');
export const service = disconnected('lib/agent-cms/service.ts');
export const blog = {
  title: 'Synthetic blog',
  seoTitle: 'Synthetic title',
  description: 'A test description.',
  summary: 'A test introduction.',
  keywords: [],
  blocks: [{ kind: 'p', text: 'Synthetic article body.' }],
  faqs: [],
  related: [],
  author: null,
  datePublished: null,
  dateModified: '2026-10-05',
  sortOrder: 0,
};
export const editorial = {
  name: 'Test place',
  seoTitle: 'Warehouses here',
  metaDescription: 'Test description',
  h1: 'Test heading',
  heroProse: 'Test lead paragraph',
  heroEyebrow: null,
  heroImage: null,
  marketHeading: null,
  marketProse: null,
  marketImage: null,
  rentsHeading: null,
  rentsProse: null,
  specHeading: null,
  specProse: null,
  inventoryHeading: null,
  faqs: [],
  relatedBlogs: [],
  statOverrides: null,
};
export const fixtures = {
  blog: { target: { page_type: 'blog', slug: 'test-blog' }, content: blog },
  city: {
    target: { page_type: 'city', slug: 'test-city' },
    content: editorial,
  },
  state: {
    target: { page_type: 'state', slug: 'test-state' },
    content: editorial,
  },
  micromarket: {
    target: {
      page_type: 'micromarket',
      city_slug: 'test-city',
      slug: 'test-market',
    },
    content: editorial,
  },
  service: {
    target: { page_type: 'service', slug: 'warehouse-search' },
    content: {
      title: 'Service',
      seoTitle: 'Service title',
      description: 'Description',
      summary: 'Introduction',
      keywords: [],
      blocks: [{ kind: 'p', text: 'Service copy.' }],
      faqs: [],
    },
  },
  legal: {
    target: { page_type: 'legal', slug: 'privacy-policy' },
    content: {
      title: 'Privacy Policy',
      seoTitle: 'Privacy Policy',
      description: 'Privacy description.',
      effectiveDate: '2026-01-01',
      updated: '2026-10-05',
      blocks: [{ kind: 'p', text: 'Policy copy.' }],
      notice: '',
    },
  },
  ad: {
    target: { page_type: 'ad', slug: 'bangalore' },
    content: schemas.contentFields(
      'ad',
      JSON.parse(
        fs.readFileSync(
          path.join(root, 'content/ad-pages/bangalore.json'),
          'utf8',
        ),
      ),
    ),
  },
};
export function csv(objects) {
  const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const encode = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return [
    keys.join(','),
    ...objects.map((o) =>
      keys
        .map((k) => {
          const v = o[k];
          return v === undefined
            ? ''
            : encode(typeof v === 'string' && v !== '' ? v : JSON.stringify(v));
        })
        .join(','),
    ),
  ].join('\r\n');
}
export function row(target, content) {
  const identity = { ...target };
  delete identity.page_type;
  return { ...identity, ...content };
}
export function memory() {
  let state = {
    native: new Map(),
    drafts: new Map(),
    imports: new Map(),
    approved: [],
  };
  let clock = Date.parse('2026-10-05T12:00:00Z'),
    chain = Promise.resolve();
  const repo = {
    native: async (t) => state.native.get(schemas.pageRef(t)) ?? null,
    all: async (type) =>
      [...state.native]
        .filter(([k]) => k.startsWith(`${type}/`))
        .map(([, v]) => v),
    draft: async (ref) => state.drafts.get(ref) ?? null,
    drafts: async (type) =>
      [...state.drafts.values()].filter((d) => d.ref.startsWith(`${type}/`)),
    lock: async () => {},
    import: async (id) => state.imports.get(id) ?? null,
    saveImport: async (id, actor, hash, payload) =>
      state.imports.set(id, {
        id,
        actor,
        hash,
        payload,
        state: 'PREPARED',
        operation_id: null,
        receipt: null,
        expires_at: new Date(clock + 86400000),
      }),
    saveDraft: async (d) => state.drafts.set(d.ref, structuredClone(d)),
    complete: async (id, operation_id, receipt) =>
      Object.assign(state.imports.get(id), {
        operation_id,
        receipt,
        state: 'DRAFT',
      }),
    operation: async (actor, id) =>
      [...state.imports.values()].find(
        (r) => r.actor === actor && r.operation_id === id,
      ),
    approveNative: async (target, content) =>
      state.approved.push({ target, content }),
    finishReview: async (id, actor, approved) => {
      for (const [k, v] of state.drafts)
        if (v.import_id === id) state.drafts.delete(k);
      Object.assign(state.imports.get(id), {
        state: approved ? 'APPROVED' : 'DISCARDED',
        reviewed_by: actor,
      });
    },
  };
  const deps = {
    now: () => clock,
    inventory: async (type) =>
      Object.values(fixtures)
        .filter((f) => f.target.page_type === type)
        .map((f) => ({ ...f.target, name: 'Synthetic', path: '/synthetic' })),
    transaction: (work) => {
      const run = chain.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await work(repo);
        } catch (error) {
          state = snapshot;
          throw error;
        }
      });
      chain = run.catch(() => {});
      return run;
    },
  };
  const actor = 'editor@example.test';
  const call = (action, args, who = actor) =>
    service.cmsOperation(action, args, who, deps);
  return {
    deps,
    repo,
    call,
    actor,
    state: () => state,
    advance: (ms) => {
      clock += ms;
    },
    prepare: (type = 'blog', contents) =>
      call('prepare_import', {
        page_type: type,
        schema_version: schemas.schemaFor(type).schema_version,
        csv_text: csv(
          contents ?? [row(fixtures[type].target, fixtures[type].content)],
        ),
      }),
  };
}
