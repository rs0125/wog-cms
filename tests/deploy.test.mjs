import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_test/test-credential';

// Run the actual route, service and action with isolated env, fetch and Prisma.
// No .env is loaded and every unexpected dependency fails closed.
function harness(options = {}) {
  const calls = { fetch: [], updates: [], transactions: 0, sessions: 0, logs: [] };
  const table = (name) => ({
    findMany: async () => {
      if (options.snapshotFailure) throw new Error('snapshot unavailable');
      return [{ id: name, title: `${name} content` }];
    },
    update: (args) => { calls.updates.push(args); return args; },
  });
  const mocks = {
    '@/lib/prisma': { prisma: {
      blog: table('blog'),
      micromarketPage: table('micromarket'),
      $transaction: async () => { calls.transactions += 1; },
    } },
    '@/lib/staging': { contentOf: (row) => ({ title: row.title }) },
    '@/lib/micromarket-staging': { contentOf: (row) => ({ title: row.title }) },
    '@/lib/auth': { requireUser: async () => {
      calls.sessions += 1;
      if (options.sessionDenied) throw new Error('login required');
    } },
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.join(ROOT, relative);
    if (cache.has(filename)) return cache.get(filename);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loaded = { exports: {} };
    cache.set(filename, loaded.exports);
    vm.runInNewContext(output, {
      module: loaded, exports: loaded.exports, Buffer, Response, Request, Error, AbortSignal,
      process: { env: { WEBSITE_DEPLOY_HOOK_URL: options.hook === undefined ? HOOK : options.hook } },
      console: { error: (...args) => calls.logs.push(args.join(' ')) },
      fetch: async (...args) => {
        calls.fetch.push(args);
        if (options.fetchError) throw options.fetchError;
        return options.response ?? Response.json({ job: { id: 'job_test', state: 'PENDING' } });
      },
      require: (id) => {
        if (mocks[id]) return mocks[id];
        if (id.startsWith('@/lib/')) return load(`${id.slice(2)}.ts`);
        if (id === 'node:crypto') return crypto;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    }, { filename });
    return loaded.exports;
  }
  const route = load('app/api/deploy/route.ts');
  const action = load('app/(authed)/deploy-actions.ts');
  return { calls, route, action, post: (authorization = `Bearer ${HOOK}`) => route.POST(
    new Request('https://wog-cms.vercel.app/api/deploy', {
      method: 'POST', headers: authorization === null ? {} : { authorization },
    }),
  ) };
}

for (const [name, authorization] of [
  ['missing', null],
  ['wrong scheme', `Basic ${HOOK}`],
  ['short token', 'Bearer invalid'],
  ['same-length incorrect token', `Bearer ${HOOK.slice(0, -1)}x`],
  ['multiple tokens', `Bearer ${HOOK} extra`],
]) {
  test(`rejects ${name} authorization without triggering or snapshotting`, async () => {
    const h = harness();
    const response = await h.post(authorization);
    assert.equal(response.status, 401);
    assert.equal(h.calls.fetch.length, 0);
    assert.equal(h.calls.updates.length, 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}

test('missing or malformed hook disables deployment', async () => {
  for (const hook of ['', 'https://invalid.example/deploy']) {
    const h = harness({ hook });
    assert.equal((await h.post()).status, 503);
    assert.equal(h.calls.fetch.length, 0);
  }
});

test('valid bearer auth triggers once and snapshots both content sections', async () => {
  const h = harness();
  const response = await h.post();
  assert.equal(response.status, 202);
  const json = await response.json();
  assert.equal(json.status, 'accepted');
  assert.equal(json.jobId, 'job_test');
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.fetch[0][0], HOOK);
  assert.equal(h.calls.fetch[0][1].method, 'POST');
  assert.equal(h.calls.fetch[0][1].redirect, 'error');
  assert.ok(h.calls.fetch[0][1].signal instanceof AbortSignal);
  assert.equal(h.calls.sessions, 0);
  assert.equal(h.calls.transactions, 1);
  assert.deepEqual(h.calls.updates.map((x) => x.where.id).sort(), ['blog', 'micromarket']);
  assert.equal(h.calls.updates[0].data.deployedContent.title, 'blog content');
  assert.equal(h.calls.updates[1].data.deployedContent.title, 'micromarket content');
  assert.ok(!JSON.stringify(json).includes(HOOK));
  assert.equal(h.route.GET, undefined);
});

test('accepts the case-insensitive Bearer scheme', async () => {
  const h = harness();
  assert.equal((await h.post(`bearer ${HOOK}`)).status, 202);
});

for (const [upstreamStatus, expectedStatus] of [[429, 429], [500, 502], [403, 502]]) {
  test(`upstream ${upstreamStatus} does not record snapshots or expose credentials`, async () => {
    const h = harness({ response: new Response(HOOK, { status: upstreamStatus }) });
    const response = await h.post();
    assert.equal(response.status, expectedStatus);
    assert.equal(h.calls.updates.length, 0);
    assert.equal(h.calls.fetch.length, 1);
    assert.ok(!(await response.text()).includes(HOOK));
    assert.ok(!h.calls.logs.join('\n').includes(HOOK));
  });
}

test('network failure returns 502 without automatically retrying', async () => {
  const h = harness({ fetchError: new Error(`Failed at ${HOOK}`) });
  assert.equal((await h.post()).status, 502);
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.updates.length, 0);
  assert.ok(!h.calls.logs.join('\n').includes(HOOK));
});

test('timeout returns 504 and directs callers to check Vercel before retrying', async () => {
  const error = new Error('timed out');
  error.name = 'TimeoutError';
  const h = harness({ fetchError: error });
  const response = await h.post();
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /before retrying/);
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.updates.length, 0);
});

test('snapshot failure still acknowledges an accepted build with a warning', async () => {
  const h = harness({ snapshotFailure: true });
  const response = await h.post();
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.jobId, 'job_test');
  assert.match(body.warning, /snapshot/);
  assert.equal(h.calls.fetch.length, 1);
});

test('a successful trigger without JSON is not reported as a failed build', async () => {
  const h = harness({ response: new Response('', { status: 200 }) });
  const response = await h.post();
  assert.equal(response.status, 202);
  assert.equal((await response.json()).jobId, null);
  assert.equal(h.calls.transactions, 1);
});

test('manual Deploy still checks the user session before requesting a build', async () => {
  const h = harness({ sessionDenied: true });
  await assert.rejects(h.action.triggerSiteBuild, /login required/);
  assert.equal(h.calls.sessions, 1);
  assert.equal(h.calls.fetch.length, 0);
});

test('manual Deploy preserves its success response and snapshots', async () => {
  const h = harness();
  assert.equal(await h.action.triggerSiteBuild(), 'ok:Build started (job job_test). The site updates in a few minutes.');
  assert.equal(h.calls.sessions, 1);
  assert.equal(h.calls.transactions, 1);
});
