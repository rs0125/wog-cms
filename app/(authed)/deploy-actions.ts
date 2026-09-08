'use server';

import { requireUser } from '@/lib/auth';
import { requestSiteBuild } from '@/lib/site-build';

// Keep the interactive Deploy button's session check and response format.
export async function triggerSiteBuild(): Promise<string | undefined> {
  await requireUser();
  const result = await requestSiteBuild();
  if (!result.ok) return result.error;

  const started = `Build started${result.jobId ? ` (job ${result.jobId})` : ''}.`;
  if (result.warning) return `${started} ${result.warning}`;
  return `ok:${started} The site updates in a few minutes.`;
}
