import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loader, fixtures } from './helpers/agent-cms.mjs';

const { blogIndexEntries, previewBlogIndex } = loader()('lib/blog-index.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const rows = [
  { id: 1, slug: 'first', sortOrder: 10, status: 'PUBLISHED' },
  { id: 2, slug: 'second', sortOrder: 20, status: 'PUBLISHED' },
  { id: 3, slug: 'private', sortOrder: 0, status: 'DRAFT' },
].map(row => ({ title: row.slug, description: 'Description', dateModified: new Date('2026-10-10'), thumbnail: null, ...row }));

test('index preview uses published metadata and puts unsaved copy in the API sort order', () => {
  const entries = blogIndexEntries(rows);
  const before = plain(entries);
  const blog = { ...fixtures.blog.content, slug: 'renamed', title: 'Edited title', sortOrder: 5 };
  const preview = plain(previewBlogIndex(blog, entries, 2));
  assert.deepEqual(preview.map(entry => entry.slug), ['renamed', 'first']);
  assert.equal(preview[0].title, 'Edited title');
  assert.equal('id' in preview[0], false);
  assert.equal('sortOrder' in preview[0], false);
  assert.deepEqual(plain(entries), before);
});

test('equal ranks use stable row IDs and new articles follow saved articles', () => {
  const entries = blogIndexEntries(rows);
  const blog = { ...fixtures.blog.content, slug: 'new', sortOrder: 10 };
  assert.deepEqual(plain(previewBlogIndex(blog, entries)).map(entry => entry.slug), ['first', 'new', 'second']);
  assert.deepEqual(plain(previewBlogIndex({ ...blog, slug: 'second' }, entries, 2)).map(entry => entry.slug), ['first', 'second']);
});

test('index reads keep article bodies out of general metadata queries', async () => {
  const firstImage = { url:'https://example.test/photo.webp', alt:'Body photo', width:800, height:450 };
  const legacy = { ...rows[0], slug:'dabaspet-multimodal-logistics-park' };
  const reads = [];
  const load = loader({ './prisma': { prisma: { blog: {
    findMany: async query => { reads.push(query); return [legacy,rows[1]]; },
    findUnique: async query => { reads.push(query); return { blocks:[{kind:'images', images:[firstImage],caption:''}] }; },
  } } } });
  const result = await load('lib/blog-index-server.ts').loadBlogOptions();
  assert.equal('blocks' in reads[0].select, false);
  assert.equal(reads[1].where.slug, legacy.slug);
  assert.deepEqual(result.indexEntries[0].firstImage, firstImage);
  assert.deepEqual(Object.keys(result.options[0]), ['id','slug','title']);
});
