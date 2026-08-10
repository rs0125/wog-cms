// Single place that knows how the deploy hook is configured, so the pages and
// the server action can't drift on the variable name or the trimming.

const raw = () => process.env.WEBSITE_DEPLOY_HOOK_URL?.trim() || undefined;

/** Vercel deploy hooks always look like this; anything else is a mis-paste. */
const HOOK_PREFIX = 'https://api.vercel.com/v1/integrations/deploy/';

export const deployHookUrl = () => {
  const url = raw();
  if (!url) return { ok: false as const, error: 'No deploy hook configured. Set WEBSITE_DEPLOY_HOOK_URL.' };
  // A hook for a different project would quietly rebuild the wrong thing.
  if (!url.startsWith(HOOK_PREFIX)) {
    return { ok: false as const, error: 'WEBSITE_DEPLOY_HOOK_URL does not look like a Vercel deploy hook.' };
  }
  return { ok: true as const, url };
};

/** For server components deciding whether to render the Deploy control. */
export const isDeployConfigured = () => deployHookUrl().ok;
