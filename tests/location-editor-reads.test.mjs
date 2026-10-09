import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loader, editorial } from './helpers/agent-cms.mjs';

for (const kind of ['CITY', 'STATE']) {
  for (const route of ['new', '[id]']) {
    test(`${route} ${kind} editor reads cross-page preview data only for states`, async () => {
      let previewReads = 0, recordReads = 0;
      const row = { ...editorial, id: 1, kind, slug: 'test', status: 'DRAFT', deployedContent: null, deployedAt: null, updatedAt: new Date() };
      const load = loader({
        '@/lib/prisma': { prisma: {
          blog: { findMany: async () => [] },
          locationPage: {
            findUnique: async () => { recordReads++; return row; },
            findMany: async () => { previewReads++; return []; },
          },
        } },
        '@/lib/editor-inventory': { getEditorLocations: async () => ({ cities: [], states: [], gates: { locationPageMinListings: 5 } }) },
        '@/components/EditorialForm': { default: () => null },
        '@/components/DeleteForm': { default: () => null },
        '@/components/DeployButton': { default: () => null },
        '@/components/CmsLink': { default: () => null },
        '@/components/Toast': { default: () => null },
        '@/lib/deploy': { isDeployConfigured: () => false },
        '../actions': {},
      });
      await load(`app/(authed)/locations/${route}/page.tsx`).default({
        params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({ kind }),
      });
      assert.equal(previewReads, kind === 'STATE' ? 1 : 0);
      assert.equal(recordReads, route === 'new' ? 0 : 1);
    });
  }
}
