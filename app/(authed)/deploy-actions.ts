'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { deployHookUrl } from '@/lib/deploy';
import { contentOf as blogContentOf } from '@/lib/staging';
import { contentOf as micromarketContentOf } from '@/lib/micromarket-staging';

/**
 * Triggers a production build of the *website* (not this app) via a Vercel
 * Deploy Hook, which is how CMS changes actually reach wareongo.com.
 *
 * Lives outside both content sections because one deploy publishes everything:
 * a build regenerates blogs and micromarket pages together, so it has to
 * snapshot both. Splitting it per section would mean deploying blogs left every
 * micromarket page stuck on a Staged badge it hadn't earned.
 *
 * A Deploy Hook URL needs no auth header — the unique id in the URL *is* the
 * credential, so anyone holding it can deploy. It's read from the environment
 * and never sent to the browser.
 *
 * Vercel allows 60 triggers per hour per project, and re-triggering cancels an
 * in-flight build for the same hook, so a double-click is harmless.
 */
// Takes no arguments: useActionState passes (prevState, formData), but this
// action reads neither, and a zero-arg function is assignable to that shape.
export async function triggerSiteBuild(): Promise<string | undefined> {
  await requireUser();

  const hook = deployHookUrl();
  if (!hook.ok) return hook.error;

  // Step 1 — trigger the build.
  let jobId: string | undefined;
  try {
    const res = await fetch(hook.url, { method: 'POST', cache: 'no-store' });
    if (!res.ok) {
      console.error('[deploy-hook] failed:', res.status, await res.text().catch(() => ''));
      return res.status === 429
        ? 'Vercel is rate-limiting builds (60/hour). Try again shortly.'
        : `Vercel refused the request (${res.status}).`;
    }
    // Shape per Vercel's docs: { job: { id, state, createdAt } }
    const body = (await res.json().catch(() => null)) as { job?: { id?: string } } | null;
    jobId = body?.job?.id;
  } catch (err) {
    console.error('[deploy-hook] error:', err);
    return 'Could not reach Vercel. Check the server logs.';
  }

  const started = `Build started${jobId ? ` (job ${jobId})` : ''}.`;

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
  } catch (err) {
    console.error('[deploy-hook] snapshot failed after a successful trigger:', err);
    return `${started} But the CMS could not record it, so content may still show as Staged.`;
  }

  return `ok:${started} The site updates in a few minutes.`;
}
