'use server';

import { requireUser } from '@/lib/auth';
import { writingEligibility } from '@/lib/ai-writing-server';
import type { WritingTarget } from '@/lib/ai-writing';

export async function checkWritingImport(target: WritingTarget, expectedUpdatedAt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  return writingEligibility(target, expectedUpdatedAt);
}
