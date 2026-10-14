# Micromarket ad-page template

Open **Ad pages → Micromarket ad pages**. Peenya is seeded from the approved
`/bangalore/peenya` page. It uses the Bangalore components and responsive layout.

To add a page:

1. Choose **New micromarket ad page** and select a Bangalore inventory market, the southern group, or Hosur.
2. Fill in its local headings, area guide, map-card bylines, rent explanation and FAQs.
3. Preview the actual website at desktop and mobile widths.
4. Save a private draft, or choose **Save for next build** when complete.
5. Deploy or wait for the nightly website build. Bangalore areas use `/bangalore/{slug}`; Hosur uses `/hosur`.

The name and slug come from inventory (or the configured southern group) and stay fixed. Existing ads are omitted
from the creation picker; retrying creation opens the existing draft without
overwriting it. Page creation checks fresh inventory on the server.

Only local copy is editable. Shared services, benefits, audiences, fee FAQ,
buttons, forms, callback wording, footer, photos, map cameras, listing counts,
rent calculation and desktop/mobile styles stay in the template. The heading
automatically adds “in {market name}”. The local editor supports plain text and
`**emphasis**`; `{listings}` and `{rentRange}` use current inventory values.
Map card names and locations stay fixed while their optional bylines are editable. Peenya
listing cards require “Peenya” in the address and an asking rent of at least ₹25.
Counts and rent calculations continue to use the full tagged inventory.

The general JSON Schema is available at
`/api/ad-pages/micromarkets/schema` to authenticated editors. The editor also
downloads its current copy and a blank writing template. Apply the finished
copy using the editor. Unknown fields and shared overrides are rejected.
Required local text can be saved empty privately but must be complete before approval. Map bylines may be blank.

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
The Bangalore layout is shared by every area. Supported identities are Bangalore
micromarkets (`citySlug: bengaluru`) and Hosur (`citySlug: hosur`, `slug: hosur`).

Apply `scripts/sql/20261014_area_ad_pages.sql` from the backend after the base
migration. It extends the city constraint and inserts four **private drafts**:

| CMS identity | Website route |
| --- | --- |
| bengaluru / hoskote | `/bangalore/hoskote` |
| bengaluru / nelamangala | `/bangalore/nelamangala` |
| bengaluru / electronic-city-jigani-bommasandra | `/bangalore/electronic-city-jigani-bommasandra` |
| hosur / hosur | `/hosur` |

The seeds use `handover-2026-10-14` local copy. Deploy the compatible backend,
CMS and website preview before approving these drafts. The older backend only
accepts Bangalore identities. The migration does not approve or overwrite any
existing content; rerunning it preserves revisions. The mini footer remains,
overriding the handoff's footer-removal note.

Inventory rules live in website `src/data/micromarket-ad-layouts/`, outside the
copy editor. Hoskote excludes Narsapura; Nelamangala excludes Dobbaspet, Makali
and Peenya. The southern group combines Hosur Road, Jigani and Bommasandra once
per listing and excludes Attibele and Bannerghatta. Hosur uses its city field
and shows Tamil Nadu on cards. The rent guide calculates current asking ranges;
counts, rates, featured listings and geographic filters are never CMS text
fields. New custom groupings or cities need a code-owned layout and identity
support; ordinary Bangalore micromarkets use the general template.

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

`node scripts/check-website-previews.mjs --case=ad,ad-micromarket,ad-new-market,ad-nelamangala,ad-south,ad-hosur`
builds isolated fixture apps and checks local copy, desktop/mobile parity,
all generated area/city routes, Hosur regional copy and map attribution, and absence of lead submissions.
