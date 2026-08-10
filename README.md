# WareOnGo CMS

Admin app for wareongo.com content. Next.js on Vercel, reading and writing the
same Supabase Postgres the backend uses. The public site is untouched by this
app — it stays a `vite-react-ssg` static build.

## How content reaches the site

```
CMS (this app)  ──writes──►  Supabase: Guide table
                                  │
backend  GET /guides  ◄───────────┘   (PUBLISHED rows only)
    │
    └─►  website build: scripts/generate-guides.mjs
             └─► src/data/guides.generated.ts  ──►  prerendered /guides/*
```

Saving here does **not** deploy. Published guides appear on the next site build
(~5 min). Drafts are never exposed by the backend endpoint, so they cannot reach
the static site even if a build runs mid-edit.

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

One file, not two: Next loads `.env` (and `.env.local`, which this project
deliberately doesn't use) while the Prisma CLI reads **only** `.env` — so a
single `.env` serves both and there's no second copy of `DATABASE_URL` to drift.
`.env` is git-ignored; `.env.example` is committed as the template.

On Vercel these come from Project Settings → Environment Variables; `.env` is
not deployed.

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
declares just the `Guide` model. Move it to a table if the editor list starts
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
`/guides` stays `/guides`.

There is deliberately **no** `middleware.ts`/`proxy.ts`. Proxy code may run on
the edge or at the CDN, where it can't reach the session store, so it could only
ever do a partial check — which invites treating it as the boundary when it
isn't. The portal takes the same approach.

## Styling and the guide preview

`app/globals.css` ports the website's palette into a Tailwind 4 `@theme` block —
Tailwind 4 has no JS config, so this is the equivalent of the site's
`tailwind.config.ts`. **Keep the two in sync.** `app/layout.tsx` loads the same
Montserrat + Instrument Serif via `next/font`, self-hosted.

That shared palette is what lets `components/GuidePreview.tsx` reuse the public
renderer's exact class names, so the Edit/Preview toggle shows real type,
spacing and table treatment rather than an approximation. The preview is a
deliberate copy of `GuideDetail.tsx`'s block switch and `FAQAccordion.tsx`, not a
shared package — two separate deployments with separate Tailwind setups made a
package cost more than it saves for five guides. **If the site's guide markup
changes, `GuidePreview.tsx` needs the same edit.**

Repeated form classes (`cms-input`, `cms-label`, `cms-btn`, `cms-card`, …) are
defined once in `globals.css` under `@layer components`.

## Schema ownership

`prisma/schema.prisma` here declares **only** the `Guide` model, so the generated
client cannot reach any other table.

**Never run `prisma db push`, `db pull` or `migrate` from this app** — pushing a
partial schema would drop every table it omits. Schema changes belong in
`WareOnGo-Website-Backend/prisma/schema.prisma`; mirror them here by hand.

## Validation

`lib/guide-schema.ts` is the contract. It enforces the `GuideBlock` union the
public renderer switches on, and rejects ragged tables. The renderer has no
default case, so an unrecognised block kind renders as nothing — validating on
save is what keeps a malformed block from silently blanking a section of a live
page. The edit page re-validates on load, so bad rows written by anything other
than this form surface here rather than on the site.
