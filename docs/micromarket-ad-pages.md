# Micromarket ad-page template

Open **Ad pages → Micromarket ad pages**. Peenya is seeded from the approved
`/bangalore/peenya` page. It uses the Bangalore components and responsive layout.

To add a page:

1. Choose **New micromarket ad page** and select a Bangalore inventory market.
2. Fill in its local headings, area guide, map-card bylines, rent explanation and FAQs.
3. Preview the actual website at desktop and mobile widths.
4. Save a private draft, or choose **Save for next build** when complete.
5. Deploy or wait for the nightly website build. The URL is `/bangalore/{slug}`.

The name and slug come from inventory and stay fixed. Existing ads are omitted
from the creation picker; retrying creation opens the existing draft without
overwriting it. Page creation checks fresh inventory on the server.

Only local copy is editable. Shared services, benefits, audiences, fee FAQ,
buttons, forms, callback wording, footer, photos, map cameras, listing counts,
rent calculation and desktop/mobile styles stay in the template. The heading
automatically adds “in {market name}”. The local editor supports plain text and
`**emphasis**`; `{listings}` and `{rentRange}` use current inventory values.
Map card names and locations stay fixed while their bylines are editable. Peenya
listing cards require “Peenya” in the address and an asking rent of at least ₹25.
Counts and rent calculations continue to use the full tagged inventory.

The general JSON Schema is available at
`/api/ad-pages/micromarkets/schema` to authenticated editors. The editor also
downloads its current copy and a blank writing template. Apply the finished
copy using the editor. Unknown fields and shared overrides are rejected.
Empty local text can be saved privately but cannot be approved for a build.

## Data and rollout

The backend owns `MicromarketAdPage`, keyed by `(citySlug, slug)`. The CMS schema
is a partial mirror: **never run Prisma schema push or migrations from the CMS**.
Apply the backend's additive `scripts/sql/20261014_micromarket_ad_pages.sql`
first. It creates the table with RLS and seeds Peenya's draft and approved copy;
running it again preserves existing edits. Deploy the backend API next, then
the website and CMS. The website must serve `/preview/ad-pages/micromarket`
before editors can use the new live preview.

The public `GET /ad-pages/micromarkets` exposes approved content only. Drafts
and deployment snapshots are never selected. The website build generates the
page registry and acquisition URL allowlist together, and refuses invalid
content or a missing Peenya seed. Ordinary new markets need no code change;
custom map cameras and neighboring rent comparisons are code-owned options.
Current parent template: Bangalore (`citySlug: bengaluru`).

Saves use optimistic revision checks. A stale tab cannot overwrite another
edit; an identical retry can acknowledge a save whose response was lost. Build
snapshots preserve the editor revision and skip concurrently edited records.

## Verification

`npm run test:ad-pages`, `npm run test:deploy` and the backend's
`npm run test:ad-pages` check schema boundaries, authentication, private drafts,
approval, retry/conflict behavior, public reads and snapshot semantics.

Run `npm run test:ad-pages:postgres` with `CMS_TEST_DATABASE_URL` pointing to a
disposable local database named `cms_micromarket_ad_test` owned by `cms_test`.
The test refuses all other targets, uses the backend SQL, verifies idempotent
seeding and exercises real draft, create and approve actions.

`node scripts/check-website-previews.mjs --case=ad-micromarket,ad-new-market`
builds isolated fixture apps and checks local copy, desktop/mobile parity,
an additional generated micromarket route, and absence of lead submissions.
