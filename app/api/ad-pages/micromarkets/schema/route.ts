import { requireUser } from '@/lib/auth';
import { MICROMARKET_AD_SCHEMA } from '@/lib/micromarket-ad-content.mjs';

export async function GET() {
  await requireUser();
  return Response.json(MICROMARKET_AD_SCHEMA, { headers: {
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'attachment; filename="micromarket-ad-page.schema.json"',
  } });
}
