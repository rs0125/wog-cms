import 'server-only';
import { unstable_cache } from 'next/cache';
import { fetchLocations } from './locations-api';
import { fetchMicromarkets } from './micromarkets-api';

// Cache only the backend's inventory, never CMS drafts or deployment snapshots.
// Keep write-time eligibility checks on the fresh fetch functions. Validation
// happens before caching; errors must reach the page's existing fallback.
const source = process.env.WAREONGO_API_BASE ?? 'https://wareongo-website-backend.onrender.com';
export const getEditorLocations = unstable_cache(fetchLocations, ['editor-locations-v1', source], { revalidate: 60 });
export const getEditorMicromarkets = unstable_cache(fetchMicromarkets, ['editor-micromarkets-v1', source], { revalidate: 60 });
