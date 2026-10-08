import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loader } from './helpers/agent-cms.mjs';

const load = loader();
const { NAVIGATION_GROUPS } = load('lib/navigation.ts');
const micromarkets = load('lib/micromarkets-api.ts');
const locations = load('lib/locations-api.ts');

async function renderDashboard({ unavailableInventory = false } = {}) {
  const inventory = async value => {
    if (unavailableInventory) throw new Error('Inventory unavailable');
    return value;
  };
  const isolated = loader({
    'next/link': ({ href, children, ...props }) => createElement('a', { href, ...props }, children),
    '@/components/DeployButton': () => null,
    '@/lib/deploy': { isDeployConfigured: () => false },
    '@/lib/prisma': { prisma: {
      blog: { findMany: async () => [] },
      micromarketPage: { findMany: async () => [] },
      locationPage: { findMany: async () => [] },
    } },
    '@/lib/micromarkets-api': { ...micromarkets, fetchMicromarkets: () => inventory({ data: [] }) },
    '@/lib/locations-api': { ...locations, fetchLocations: () => inventory({ cities: [], states: [] }) },
  });
  return renderToStaticMarkup(await isolated('app/(authed)/dashboard/page.tsx').default());
}

for (const unavailableInventory of [false, true]) {
  test(`dashboard renders every navigation category, including imports, with inventory ${unavailableInventory ? 'unavailable' : 'available'}`, async () => {
    const html = await renderDashboard({ unavailableInventory });
    assert.match(html, /Content menu/);
    for (const { items } of NAVIGATION_GROUPS) {
      for (const { href, label } of items) {
        assert.ok(html.includes(`href="${href.replaceAll('&', '&amp;')}"`), `Missing dashboard destination: ${href}`);
        assert.ok(html.includes(label), `Missing dashboard category: ${label}`);
      }
    }
    assert.match(html, /Review incoming drafts/);
  });
}
