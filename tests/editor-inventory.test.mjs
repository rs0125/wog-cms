import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loader } from './helpers/agent-cms.mjs';

test('only successful, validated inventory enters the short-lived cache', async () => {
  const originalFetch = globalThis.fetch;
  const registrations = [];
  let requests = 0, malformed = true;
  globalThis.fetch = async (_url, options) => {
    requests++;
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => malformed ? {} : { data: { cities: [], states: [] }, gates: { locationPageMinListings: 5 } } };
  };
  try {
    const load = loader({
      'server-only': {},
      'next/cache': { unstable_cache(fn, keys, options) {
        registrations.push({ keys, options });
        let cached;
        return async () => cached ?? (cached = await fn());
      } },
    });
    const { getEditorLocations } = load('lib/editor-inventory.ts');
    await assert.rejects(getEditorLocations(), /unexpected shape/);
    malformed = false;
    await getEditorLocations();
    await getEditorLocations();
    assert.equal(requests, 2, 'failed inventory must be retried; successful inventory reused');
    await load('lib/locations-api.ts').fetchLocations();
    assert.equal(requests, 3, 'write-time validation must still fetch fresh inventory');
    for (const { keys, options } of registrations) {
      assert.equal(options.revalidate, 60);
      assert.equal(keys.length, 2, 'cache key includes backend source');
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('both inventory requests time out and propagate backend failures', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const load = loader();
  const calls = [load('lib/locations-api.ts').fetchLocations, load('lib/micromarkets-api.ts').fetchMicromarkets];
  try {
    AbortSignal.timeout = delay => {
      assert.equal(delay, 5000);
      return AbortSignal.abort(new DOMException('Inventory timed out', 'TimeoutError'));
    };
    globalThis.fetch = async (_url, { signal }) => { signal.throwIfAborted(); };
    for (const call of calls) await assert.rejects(call(), { name: 'TimeoutError' });
    globalThis.fetch = async () => ({ ok: false, status: 503, statusText: 'Unavailable' });
    for (const call of calls) await assert.rejects(call(), /503/);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});
