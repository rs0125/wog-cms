# WareOnGo CMS

Admin app for wareongo.com content. Next.js on Vercel, reading and writing the
same Supabase Postgres the backend uses. The public site is untouched by this
app — it stays a `vite-react-ssg` static build.

## How content reaches the site

```
CMS (this app)  ──writes──►  Supabase: Blog table
                                  │
backend  GET /blogs  ◄───────────┘   (PUBLISHED rows only)
    │
    └─►  website build: scripts/generate-blogs.mjs
             └─► src/data/blogs.generated.ts  ──►  prerendered /blogs/*
```

Saving here does **not** deploy. Published blogs appear on the next site build
(~5 min). Drafts are never exposed by the backend endpoint, so they cannot reach
the static site even if a build runs mid-edit.

The same applies in reverse: the **Delist** button on a blog flips it back to
draft in one click, but the page stays live until the next build removes it —
which is why the blog reads as *Staged* the moment you delist it. Delisting
destroys nothing, and the same button lists it again.

## Running locally

```bash
npm install
npx prisma generate
npm run dev          # http://localhost:3000
```

Port 3000 is deliberate: it's already a registered redirect URI on the shared
OAuth client (the portal uses it), so local sign-in needs no Google Cloud Console
change. The cost is that the CMS and EmployeeReimbursementPortal can't both
occupy 3000 — run one with `next dev -p 3001` when you need them side by side,
and register that port on the client too.

Copy `.env.example` to `.env` and fill in:

| Variable               | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `DATABASE_URL`         | Same Supabase connection string the backend uses     |
| `GOOGLE_CLIENT_ID`     | Shared with EmployeeReimbursementPortal              |
| `GOOGLE_CLIENT_SECRET` | Shared with EmployeeReimbursementPortal              |
| `GOOGLE_REDIRECT_URI`  | Must be registered on that OAuth client              |
| `CMS_ALLOWED_EMAILS`   | Comma-separated list of who may sign in              |
| `SESSION_SECRET`       | Signs the session cookie — `openssl rand -base64 32` |
| `R2_*` (five)          | Cloudflare R2 bucket for blog images — copy from the backend's `.env` |

One file, not two: Next loads `.env` (and `.env.local`, which this project
deliberately doesn't use) while the Prisma CLI reads **only** `.env` — so a
single `.env` serves both and there's no second copy of `DATABASE_URL` to drift.
`.env` is git-ignored; `.env.example` is committed as the template.

On Vercel these come from Project Settings → Environment Variables; `.env` is
not deployed.

## Nightly website build and WebP compression

`POST https://wog-cms.vercel.app/api/deploy` starts the **website** build and the
backend's warehouse WebP compression sweep in parallel. It records the same
blog/micromarket snapshots as the CMS Deploy button. It uses
`Authorization: Bearer <WEBSITE_DEPLOY_HOOK_URL>`: the **full existing hook URL**
is the credential, not a Google session or `SESSION_SECRET`. No new environment
variable is required. The production CMS must have that same hook configured.

For an existing nightly job, **leave Supabase unchanged**: its URL, bearer token,
schedule and SQL all stay the same. Deploy `WareOnGo-Website-Backend` first, then
this CMS. Both services must have the same existing `R2_SECRET_ACCESS_KEY`.
The CMS derives a dedicated compression bearer token from that key; it never
sends the storage secret itself. `WAREONGO_API_BASE` optionally overrides the
default backend URL, `https://wareongo-website-backend.onrender.com`.

For a first-time schedule only, deploy both services, then run
[`scripts/schedule-nightly-build.sql`](scripts/schedule-nightly-build.sql) in the
Supabase SQL editor, replacing its credential placeholder. The script stores
the credential in Vault and schedules one daily POST at **02:00 Asia/Kolkata**
(`30 20 * * *` in UTC). Re-running it updates the same named job. It does not
trigger a build immediately, and it rejects a non-UTC cron timezone rather
than silently scheduling the wrong hour.

The response is `202` with `status: "accepted"`, Vercel's `jobId` when available,
and `compression: { status: "accepted" | "already_running", jobId }`. The CMS
waits only for the two trigger acknowledgements, never the compression sweep.
The Render backend keeps working after returning its acknowledgement. Photos
that finish too late for this build are picked up by the next daily build;
the website's original-image fallback still applies.

Compression failure returns `compression: { status: "unavailable", error }`
and a warning while preserving an accepted website build. Likewise, a rejected
build still reports independently accepted compression. Check final compression
status with authenticated `GET /maintenance/webp` on the backend, or its
`[warehouse-webp]` logs. See the backend README for recovery and limits. The
manual CMS Deploy button continues to request a build only.

An acknowledgement means **build requested**, not deployment completed. A snapshot
failure is returned as a warning alongside `202`, since retrying would trigger
another build. Missing/wrong credentials return `401`; an unconfigured hook
returns `503`; Vercel rejection, rate limiting and timeout return `502`, `429`
and `504` respectively. GET does not trigger a build. Check Vercel before
retrying a timeout, since the trigger might already have reached it.

The cron's successful SQL execution only means `pg_net` enqueued the request;
inspect its HTTP response as shown in the script, and use Vercel's deployment
dashboard for final build status. The whole site rebuilds, including saved
changes to published blogs and micromarkets, just like the manual Deploy button.

Run `npm run test:deploy` for isolated auth/parallel-trigger/snapshot tests.
These mock Vercel, compression HTTP responses and Prisma; they never trigger
a real build, compress production images or access the database.

## Database connection

Use the Supabase **transaction pooler (port 6543)** here, with
`?pgbouncer=true&connection_limit=5` — not the session pooler (5432) the Express
backend uses.

Session mode holds a connection for the life of the client. Supavisor caps
session-mode *clients* at 35 — a separate budget from Postgres's own
`max_connections` (60, of which Supavisor's pool already holds ~32). Transaction
mode returns the connection per transaction, so many clients multiplex onto few,
which is what short-lived functions need. `pgbouncer=true` disables prepared
statements, which transaction mode requires.

For context on how tight this is: measured on 2026-08-10, Postgres sat at 45/60
connections with 32 held by Supavisor's pool (27 idle >1h, oldest 10 days) —
leaving roughly a dozen for everything else, shared with the Express backend and
the reimbursement portal.

Two server-side timeouts worth knowing, since they decide what self-heals:
`idle_in_transaction_session_timeout` is 300s, so a leaked transaction is reaped
automatically; `idle_session_timeout` is **0 (disabled)**, so a merely-idle
session is never reaped. That second one is why rapidly restarting a
session-mode app can pile up client slots until it hits the 35 cap.

Note this means `prisma db push` / `migrate` won't work against this URL — which
is fine and even desirable, since schema changes belong in the backend repo
(see below).

## Auth

Google OAuth, following the same design as `EmployeeReimbursementPortal/lib/auth.ts`:

- `/api/auth/google` sets a random `state` cookie and redirects to Google.
- `/api/auth/google/callback` verifies `state` (CSRF), exchanges the code,
  requires `email_verified`, checks the address against `CMS_ALLOWED_EMAILS`,
  then stores **the email** in an httpOnly `cms_session` cookie.
- `/api/auth/logout` clears it.

The cookie is `<base64url payload>.<HMAC-SHA256>`, keyed with `SESSION_SECRET`.
`getCurrentUser()` verifies the signature, then re-checks the email against the
allowlist — both must pass. So removing someone from `CMS_ALLOWED_EMAILS` locks
them out immediately, without invalidating anyone else's cookie. It's wrapped in
React `cache`, so a layout and the page under it don't each redo the work.

> **The signature is not optional.** An earlier version stored the bare email.
> Because an email address is public, `Cookie: cms_session=someone@wareongo.com`
> was enough for full read/write access without ever touching Google — the whole
> OAuth flow was decorative. `httpOnly` does not help: it stops JavaScript
> *reading* a cookie, not an attacker *setting* one. Rotating `SESSION_SECRET`
> invalidates every session, which is also the way to force everyone out.

The portal reads its equivalent list from the database and uses env only for the
admin flag. Here it's env-only, because this app's Prisma schema deliberately
declares just the `Blog` model. Move it to a table if the editor list starts
changing often enough that a redeploy is annoying.

### Credentials are shared with the portal

Both apps use the same Google OAuth client, so there's one set of secrets to
rotate. A client can hold several authorised redirect URIs — one per app and
environment. **Each new URI must be added in Google Cloud Console → Credentials
→ that OAuth client → Authorised redirect URIs**, or the callback fails with
`redirect_uri_mismatch`:

- `http://localhost:3000/api/auth/google/callback` (CMS dev — already registered)
- `https://cms.wareongo.com/api/auth/google/callback` (CMS production)

### The gate

`app/(authed)/layout.tsx` calls `requireUser()`, and every authenticated page
lives under that route group. One check, in the render path, that a new page
cannot forget — `(authed)` is a route group so it never appears in a URL and
`/blogs` stays `/blogs`.

There is deliberately **no** `middleware.ts`/`proxy.ts`. Proxy code may run on
the edge or at the CDN, where it can't reach the session store, so it could only
ever do a partial check — which invites treating it as the boundary when it
isn't. The portal takes the same approach.

## Styling and the blog preview

`app/globals.css` ports the website's palette into a Tailwind 4 `@theme` block —
Tailwind 4 has no JS config, so this is the equivalent of the site's
`tailwind.config.ts`. **Keep the two in sync.** `app/layout.tsx` loads the same
Montserrat + Instrument Serif via `next/font`, self-hosted.

That shared palette is what lets `components/BlogPreview.tsx` reuse the public
renderer's exact class names, so the Edit/Preview toggle shows real type,
spacing and table treatment rather than an approximation. The preview is a
deliberate copy of `BlogDetail.tsx`'s block switch and `FAQAccordion.tsx`, not a
shared package — two separate deployments with separate Tailwind setups made a
package cost more than it saves for five blogs. **If the site's blog markup
changes, `BlogPreview.tsx` needs the same edit.**

Repeated form classes (`cms-input`, `cms-label`, `cms-btn`, `cms-card`, …) are
defined once in `globals.css` under `@layer components`.

## Images

An **Images** block holds one to four images, and the collage layout follows from
the count alone — 1 full width, 2 side by side, 3 in a row, 4 as a 2×2. There is
no layout field, so nothing can disagree with the images. On a phone the grid
stays two columns wide (a pair should still read as a pair) and the odd tile of a
3-up spans the full width instead of shrinking to a thumbnail; the geometry lives
in `lib/collage.ts` and is mirrored in the site's `BlogDetail.tsx`.

The upload path is deliberately split:

```
browser: downscale to 1600px, encode WebP, measure  (lib/image-upload.ts)
   └─► POST /api/uploads  ──►  R2  blogs/<name>-<sha256[0:16]>.webp
          └─► { url }  ──►  stored in the block's JSON alongside alt/width/height
```

The browser does the encoding for three reasons: a Vercel function's request body
is capped at 4.5MB and phone photos are routinely larger; the width/height stored
in the blog must describe the file that was actually uploaded, and measuring the
bitmap we just encoded is the only way to be certain; and it keeps `sharp` out of
this app entirely. If a browser can't do any of it, the original file is uploaded
as-is under the same 4MB limit.

Keys are content-addressed, so re-uploading the same file lands on the same
object rather than a duplicate — and because the name changes whenever the bytes
do, the immutable cache header is always safe. Nothing is ever deleted from R2:
removing an image from a block leaves the object in place, since an already-built
version of the site may still point at it. Orphans are cheap; broken images on a
live page are not.

Blog images are served through Vercel's image optimizer on the website (`sizes`
per collage shape, `loading="lazy"`), which is why `R2_PUBLIC_URL` has to be a
host listed in the website's `vercel.json` → `images.remotePatterns`. If the
optimizer refuses a source — unlisted host, or a 402 once the account's
transformation quota is spent — the renderer falls back to the raw R2 URL once,
so the reader gets a slower image rather than a broken one.

## Schema ownership

`prisma/schema.prisma` here declares **only** the `Blog` model, so the generated
client cannot reach any other table.

**Never run `prisma db push`, `db pull` or `migrate` from this app** — pushing a
partial schema would drop every table it omits. Schema changes belong in
`WareOnGo-Website-Backend/prisma/schema.prisma`; mirror them here by hand.

## Validation

`lib/blog-schema.ts` is the contract. It enforces the `BlogBlock` union the
public renderer switches on, and rejects ragged tables. The renderer has no
default case, so an unrecognised block kind renders as nothing — validating on
save is what keeps a malformed block from silently blanking a section of a live
page. The edit page re-validates on load, so bad rows written by anything other
than this form surface here rather than on the site.

## Micromarket overviews

Micromarket content now targets `/overview/{state}/{city}/{micromarket}`. The
backend derives state from the canonical city's warehouse location data; editors
keep the existing city and micromarket slug fields. The URL and preview update
together as those fields change. The database schema and deployed-content
snapshot remain unchanged.

The separate `/listings/city/{city}/{micromarket}` pages always show their plain
warehouse grids. Publishing adds the overview on the next build; delisting or
deleting removes that overview on the next build. The listing URLs remain.
Deploy the backend's state geography fields, then rebuild the website, then
deploy this CMS. No migration, new credential, endpoint or cron job is required.
The state/city editorial stashes are separate future work.
