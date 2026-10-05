import { z } from 'zod';
import { isAllowed } from '@/lib/auth';
import { CmsError } from '@/lib/agent-cms/schema';
import { authenticatedRequest } from '@/lib/agent-cms/protocol';
import { cmsOperation } from '@/lib/agent-cms/service';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const value = await authenticatedRequest(request, isAllowed);
    const data = await cmsOperation(
      value.action,
      value.args,
      value.actor_email,
    );
    return Response.json(
      { ok: true, request_id: value.request_id, data },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const known = error instanceof CmsError;
    const status = known
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 422
        : 503;
    return Response.json(
      {
        ok: false,
        code: known
          ? error.code
          : status === 422
            ? 'CMS_INVALID_INPUT'
            : 'CMS_UNAVAILABLE',
        message: known
          ? error.message
          : status === 422
            ? 'Invalid CMS request. Fetch the schema and validate the input.'
            : 'CMS integration is temporarily unavailable.',
      },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  }
}
