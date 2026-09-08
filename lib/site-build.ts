import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { deployHookUrl } from '@/lib/deploy';
import { contentOf as blogContentOf } from '@/lib/staging';
import { contentOf as micromarketContentOf } from '@/lib/micromarket-staging';

export type SiteBuildResult =
  | { ok: true; jobId?: string; warning?: string }
  | { ok: false; status: number; error: string };

// Both the Google-authenticated action and the cron endpoint call this only
// after authenticating. Snapshots retain the existing contract: requested,
// not confirmed deployed. A nightly build publishes all eligible CMS content.
export async function requestSiteBuild(): Promise<SiteBuildResult> {
  const hook = deployHookUrl();
  if (!hook.ok) return { ok: false, status: 503, error: hook.error };

  // Step 1 — trigger the build.
  let jobId: string | undefined;
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Never log the hook URL, upstream body or raw fetch errors: the URL
      // itself is the deployment credential.
      console.error('[deploy-hook] failed:', res.status);
      return {
        ok: false,
        status: res.status === 429 ? 429 : 502,
        error: res.status === 429
          ? 'Vercel is rate-limiting builds (60/hour). Try again shortly.'
          : `Vercel refused the request (${res.status}).`,
      };
    }
    // Shape per Vercel's docs: { job: { id, state, createdAt } }
    const body = (await res.json().catch(() => null)) as { job?: { id?: string } } | null;
    jobId = typeof body?.job?.id === 'string' ? body.job.id : undefined;
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    console.error('[deploy-hook]', timeout ? 'request timed out' : 'request failed');
    return {
      ok: false,
      status: timeout ? 504 : 502,
      error: timeout
        ? 'Vercel did not respond in time. Check the deployment dashboard before retrying.'
        : 'Could not reach Vercel. Check the deployment dashboard before retrying.',
    };
  }

  // Step 2 — record what went out, in its own try. The build is already running
  // by this point, so a failure here must not be reported as a failed deploy:
  // that would be a lie, and it would hide the real problem (badges stuck on
  // Staged because the snapshot never advanced).
  try {
    // Each select lists only what its contentOf() reads. A bare findMany() would
    // also pull every row's existing deployedContent — a second full copy of the
    // content — purely to throw it away.
    const [blogs, micromarkets] = await Promise.all([
      prisma.blog.findMany({
        select: {
          id: true,
          slug: true,
          title: true,
          seoTitle: true,
          description: true,
          summary: true,
          keywords: true,
          blocks: true,
          faqs: true,
          related: true,
          author: true,
          datePublished: true,
          dateModified: true,
          sortOrder: true,
          status: true,
        },
      }),
      prisma.micromarketPage.findMany({
        select: {
          id: true,
          citySlug: true,
          slug: true,
          name: true,
          seoTitle: true,
          metaDescription: true,
          h1: true,
          heroEyebrow: true,
          heroProse: true,
          heroImage: true,
          marketHeading: true,
          marketProse: true,
          marketImage: true,
          rentsHeading: true,
          rentsProse: true,
          specHeading: true,
          specProse: true,
          inventoryHeading: true,
          faqs: true,
          relatedBlogs: true,
          statOverrides: true,
          status: true,
        },
      }),
    ]);

    const now = new Date();
    // One transaction across both tables: a half-recorded deploy would leave one
    // section's badges telling the truth and the other's lying.
    await prisma.$transaction([
      ...blogs.map((g) =>
        prisma.blog.update({
          where: { id: g.id },
          // Cast: contentOf() returns JSON-serialisable data by construction,
          // but the Json columns it copies are typed `unknown`, so Prisma can't
          // prove it.
          data: { deployedContent: blogContentOf(g) as Prisma.InputJsonValue, deployedAt: now },
        }),
      ),
      ...micromarkets.map((m) =>
        prisma.micromarketPage.update({
          where: { id: m.id },
          data: {
            deployedContent: micromarketContentOf(m) as Prisma.InputJsonValue,
            deployedAt: now,
          },
        }),
      ),
    ]);
  } catch {
    console.error('[deploy-hook] snapshot failed after a successful trigger');
    return {
      ok: true,
      jobId,
      warning: 'The CMS could not record the build snapshot, so content may still show as Staged.',
    };
  }

  return { ok: true, jobId };
}
