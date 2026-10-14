import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const content = JSON.parse(fs.readFileSync(path.join(root, 'content/micromarket-ad-pages/peenya.json'), 'utf8'));
const stamp = '2026-10-14T00:00:00.000Z';
export function harness({ denied = false, count = 1, failure = false, current = null, db, inventory = [{ citySlug: 'bengaluru', slug: 'peenya', name: 'Peenya', listings: 62 }], cities = [] } = {}) {
  const writes = [], reads = [];
  const cache = {};
  const table = db ?? {
    upsert: async args => { writes.push(args); if (failure) throw new Error('private database detail'); },
    updateMany: async args => { writes.push(args); if (failure) throw new Error('private database detail'); return { count }; },
    findUnique: async args => { reads.push(args); return args.select?.name ? { name: 'Peenya', draftContent: content } : current; },
  };
  function load(file) {
    if (cache[file]) return cache[file];
    const loaded = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Object, Error, SyntaxError, TextEncoder, Response, console: { error() {} }, require(id) {
      if (id === 'next/navigation') return { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } };
      if (id === '@/lib/auth') return { requireUser: async () => { if (denied) throw new Error('unauthenticated'); } };
      if (id === '@/lib/prisma') return { prisma: { micromarketAdPage: table } };
      if (id === '@/lib/micromarkets-api') return { fetchMicromarkets: async () => ({ data: inventory }) };
      if (id === '@/lib/locations-api') return { fetchLocations: async () => ({ cities }) };
      if (id.endsWith('.mjs')) return require(id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(root, path.dirname(file), id));
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
      if (id.startsWith('./')) return load(path.join(path.dirname(file), `${id.slice(2)}.ts`));
      throw new Error(`Unexpected dependency ${id}`);
    } });
    cache[file] = loaded.exports; return loaded.exports;
  }
  const actions = load('app/(authed)/ad-pages/micromarkets/actions.ts');
  return { writes, reads, save: actions.saveMicromarketAdPage, create: actions.createMicromarketAdPage, schema: load('app/api/ad-pages/micromarkets/schema/route.ts') };
}
export function form(overrides = {}, page = content) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ citySlug: 'bengaluru', slug: 'peenya', intent: 'draft', expectedUpdatedAt: stamp, content: JSON.stringify(page), ...overrides })) result.set(key, value);
  return result;
}
