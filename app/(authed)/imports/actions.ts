'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { CmsError } from '@/lib/agent-cms/schema';
import { reviewImport } from '@/lib/agent-cms/service';
import { z } from 'zod';
export async function reviewAction(form: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(form.get('id'));
  const hash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(form.get('hash'));
  const intent = z.enum(['approve', 'discard']).parse(form.get('intent'));
  if (process.env.CMS_CONTEXT_ENABLED !== 'true')
    throw new Error('CMS imports are disabled.');
  try {
    await reviewImport(id, hash, user.email, intent === 'approve');
  } catch (error) {
    const message =
      error instanceof CmsError
        ? error.message
        : 'Unable to complete this review. Reload and try again.';
    redirect(`/imports/${id}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/imports/${id}`);
}
