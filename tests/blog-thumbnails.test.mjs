import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { loader, blog as fixture } from './helpers/agent-cms.mjs';

const thumbnail = { url: 'https://images.example/thumbnail.webp', alt: 'Warehouse loading bays', width: 1200, height: 800 };
const stamp = '2026-10-06T00:00:00.000Z';
const blog = { ...fixture, id: 12, slug: 'warehouse-guide', status: 'PUBLISHED', thumbnail: null,
  dateModified: new Date(stamp), updatedAt: new Date(stamp) };

function harness(options = {}) {
  const writes = [];
  const load = loader({
    '@/lib/auth': { requireUser: async () => {} },
    'next/navigation': { redirect: (location) => { throw Object.assign(new Error('redirect'), { location }); } },
    'next/cache': { refresh() {} },
    '@/lib/prisma': { prisma: { blog: {
      findUnique: async () => ({ ...blog, deployedContent: options.snapshot }),
      updateMany: async (query) => { writes.push(query); return { count: options.count ?? 1 }; },
      update: async (query) => { writes.push(query); return blog; },
    } } },
  });
  return { writes, ...load('app/(authed)/blogs/actions.ts'), ...load('lib/staging.ts') };
}

function form(image = thumbnail) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...fixture, slug: blog.slug, status: blog.status, id: blog.id,
    expectedUpdatedAt: stamp, author: '', datePublished: '', thumbnail: image })) {
    data.set(key, ['blocks', 'faqs', 'related', 'keywords', 'thumbnail'].includes(key) ? JSON.stringify(value) : String(value));
  }
  return data;
}

test('saving a thumbnail preserves its metadata and the lost-update guard', async () => {
  const h = harness();
  await assert.rejects(h.updateBlog(undefined, form()), (error) => error.location === '/blogs/12?saved=1');
  assert.deepEqual(h.writes[0].data.thumbnail, thumbnail);
  assert.equal(h.writes[0].where.updatedAt.toISOString(), stamp);
  assert.equal((await harness({ count: 0 }).updateBlog(undefined, form())).ok, false);
});

test('removing a thumbnail writes SQL NULL rather than invalid JSON null', async () => {
  const h = harness();
  await assert.rejects(h.updateBlog(undefined, form(null)), (error) => Boolean(error.location));
  assert.equal(h.writes[0].data.thumbnail, Prisma.DbNull);
});

test('invalid thumbnails cannot be saved', async () => {
  for (const image of [{ ...thumbnail, alt: '' }, { ...thumbnail, width: 0 }, { ...thumbnail, url: 'http://images.example/photo.jpg' }]) {
    const h = harness();
    const result = await h.updateBlog(undefined, form(image));
    assert.equal(result.ok, false);
    assert.match(result.error, /thumbnail/);
    assert.equal(h.writes.length, 0);
  }
});

test('legacy snapshots stay published, while thumbnail uploads and removal are staged', () => {
  const h = harness();
  const legacy = h.contentOf(blog);
  delete legacy.thumbnail;
  assert.equal(h.stateOf({ ...blog, deployedContent: legacy }), 'PUBLISHED');
  assert.equal(h.stateOf({ ...blog, thumbnail, deployedContent: legacy }), 'STAGED');
  const published = h.contentOf({ ...blog, thumbnail });
  assert.deepEqual(published.thumbnail, thumbnail);
  assert.equal(h.stateOf({ ...blog, thumbnail, deployedContent: published }), 'PUBLISHED');
  assert.equal(h.stateOf({ ...blog, deployedContent: published }), 'STAGED');
});

test('reverting restores the deployed thumbnail, including snapshots before uploads existed', async () => {
  const snapshot = harness().contentOf({ ...blog, thumbnail });
  for (const withThumbnail of [true, false]) {
    if (!withThumbnail) delete snapshot.thumbnail;
    const h = harness({ snapshot });
    await assert.rejects(h.revertBlog(undefined, form()), (error) => error.location === '/blogs?reverted=1');
    assert.deepEqual(h.writes[0].data.thumbnail, withThumbnail ? thumbnail : Prisma.DbNull);
  }
});
