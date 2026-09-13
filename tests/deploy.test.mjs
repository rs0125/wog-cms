import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKEND = 'https://backend.example/maintenance/webp';
const R2_SECRET = 'test-storage-secret';
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
    '@prisma/client': { Prisma: { DbNull: null } },
    '@/lib/prisma': { prisma: {
      blog: table('blog'),
      micromarketPage: table('micromarket'),
      locationPage: table('location'),
      legalPage: {
        findMany: async () => [{ slug: 'privacy-policy', publishedContent: { title: 'Approved policy' }, draftContent: { title: 'Private draft' } }],
        update: args => { calls.updates.push(args); return args; },
      },
      servicePage: {
        findMany: async () => [
          { slug: 'warehouse-search', publishedContent: { title: 'Approved service' }, draftContent: { title: 'Private draft' } },
          { slug: 'build-to-suit', publishedContent: null, draftContent: { title: 'Private draft' } },
        ],
        update: args => { calls.updates.push(args); return args; },
      },
      $transaction: async () => { calls.transactions += 1; },
    } },
    '@/lib/staging': { contentOf: (row) => ({ title: row.title }) },
    '@/lib/micromarket-staging': { contentOf: (row) => ({ title: row.title }) },
    '@/lib/location-staging': { contentOf: (row) => ({ title: row.title }) },
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
      module: loaded, exports: loaded.exports, Buffer, Response, Request, Error, URL, AbortSignal: options.fastTimeouts ? { timeout: () => AbortSignal.timeout(5) } : AbortSignal,
      process: { env: { WEBSITE_DEPLOY_HOOK_URL: options.hook === undefined ? HOOK : options.hook, R2_SECRET_ACCESS_KEY: options.r2Secret === undefined ? R2_SECRET : options.r2Secret, WAREONGO_API_BASE: options.backend ?? 'https://backend.example' } },
      console: { error: (...args) => calls.logs.push(args.join(' ')) },
      fetch: async (...args) => {
        calls.fetch.push(args);
        if (args[0] === BACKEND) {
          if (options.onCompression) return options.onCompression(...args);
          if (options.webpError) throw options.webpError;
          return options.webpResponse ?? Response.json({ status: 'accepted', jobId: 'webp_test' }, { status: 202 });
        }
        if (options.onBuild) return options.onBuild(...args);
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

test('valid bearer auth triggers once and snapshots blogs, micromarkets and locations', async () => {
  const h = harness();
  const response = await h.post();
  assert.equal(response.status, 202);
  const json = await response.json();
  assert.equal(json.status, 'accepted');
  assert.equal(json.jobId, 'job_test');
  assert.equal(h.calls.fetch.length, 2);
  assert.equal(h.calls.fetch[0][0], HOOK);
  assert.equal(h.calls.fetch[0][1].method, 'POST');
  assert.equal(h.calls.fetch[0][1].redirect, 'error');
  assert.ok(h.calls.fetch[0][1].signal instanceof AbortSignal);
  assert.equal(h.calls.sessions, 0);
  assert.equal(h.calls.transactions, 1);
  assert.deepEqual(h.calls.updates.map((x) => x.where.id ?? x.where.slug).sort(), ['blog', 'build-to-suit', 'location', 'micromarket', 'privacy-policy', 'warehouse-search']);
  const snapshot = key => h.calls.updates.find(x => (x.where.id ?? x.where.slug) === key).data.deployedContent;
  assert.equal(snapshot('blog').title, 'blog content');
  assert.equal(snapshot('micromarket').title, 'micromarket content');
  assert.equal(snapshot('location').title, 'location content');
  assert.equal(snapshot('privacy-policy').title, 'Approved policy');
  assert.equal(snapshot('warehouse-search').title, 'Approved service');
  assert.equal(snapshot('build-to-suit'), null);
  assert.ok(!JSON.stringify(h.calls.updates).includes('Private draft'));
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
    assert.equal(h.calls.fetch.length, 2);
    assert.ok(!(await response.text()).includes(HOOK));
    assert.ok(!h.calls.logs.join('\n').includes(HOOK));
  });
}

test('network failure returns 502 without automatically retrying', async () => {
  const h = harness({ fetchError: new Error(`Failed at ${HOOK}`) });
  assert.equal((await h.post()).status, 502);
  assert.equal(h.calls.fetch.length, 2);
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
  assert.equal(h.calls.fetch.length, 2);
  assert.equal(h.calls.updates.length, 0);
});

test('snapshot failure still acknowledges an accepted build with a warning', async () => {
  const h = harness({ snapshotFailure: true });
  const response = await h.post();
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.jobId, 'job_test');
  assert.match(body.warning, /snapshot/);
  assert.equal(h.calls.fetch.length, 2);
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


test('cron starts both triggers concurrently and sends only a derived compression credential', async () => {
  let releaseBuild;
  const build = new Promise(resolve => { releaseBuild = resolve; });
  const h = harness({ onBuild: () => build });
  const request = h.post();
  await Promise.resolve();
  assert.deepEqual(h.calls.fetch.map(([url]) => url), [HOOK, BACKEND]);
  const token = crypto.createHmac('sha256', R2_SECRET).update('wareongo:warehouse-webp-trigger:v1').digest('hex');
  const init = h.calls.fetch[1][1];
  assert.equal(init.headers.Authorization, `Bearer ${token}`);
  assert.equal(init.redirect, 'error');
  assert.ok(!JSON.stringify(init).includes(R2_SECRET));
  releaseBuild(Response.json({ job: { id: 'job_test' } }));
  const response = await request;
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.deepEqual(body.compression, { status: 'accepted', jobId: 'webp_test' });
  assert.ok(!JSON.stringify(body).includes(token));
});

test('a blocked compression acknowledgement does not delay starting the website build', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ onCompression: () => gate });
  const request = h.post();
  await Promise.resolve();
  assert.equal(h.calls.fetch[0][0], HOOK);
  assert.equal(h.calls.fetch[1][0], BACKEND);
  release(Response.json({ status: 'already_running', jobId: 'webp_existing' }, { status: 202 }));
  assert.equal((await (await request).json()).compression.status, 'already_running');
});

for (const code of [401, 404, 503]) {
  test(`compression HTTP ${code} leaves the build accepted with a visible warning`, async () => {
    const h = harness({ webpResponse: new Response(R2_SECRET, { status: code }) });
    const response = await h.post();
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.jobId, 'job_test');
    assert.equal(body.compression.status, 'unavailable');
    assert.match(body.warning, new RegExp(String(code)));
    assert.equal(h.calls.transactions, 1);
    assert.ok(!JSON.stringify(body).includes(R2_SECRET));
  });
}

test('compression timeout settles while preserving the acknowledged build', async () => {
  const h = harness({ fastTimeouts: true, onCompression: (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  // AbortSignal.timeout does not keep Node alive on its own.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const response = await h.post();
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.compression.status, 'unavailable');
    assert.match(body.warning, /before retrying/);
    assert.equal(h.calls.fetch.length, 2);
  } finally { clearInterval(keepAlive); }
});

test('build failure still returns the independently accepted compression job', async () => {
  const h = harness({ response: new Response('rejected', { status: 500 }) });
  const response = await h.post();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).compression.status, 'accepted');
  assert.equal(h.calls.transactions, 0);
});

for (const options of [
  { r2Secret: '' }, { backend: 'http://internal.example' },
  { webpResponse: Response.json({ status: 'done' }, { status: 202 }) },
  { webpResponse: new Response('not JSON', { status: 202 }) },
]) {
  test(`compression misconfiguration or malformed acknowledgement does not suppress the build: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    const response = await h.post();
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.compression.status, 'unavailable');
    assert.equal(h.calls.transactions, 1);
  });
}
