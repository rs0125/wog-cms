# Service pages

The CMS Services section contains four fixed pages: Warehouse Search,
Build-To-Suit, Lease Negotiation and Compliance Procurement. Public URLs are
`/services/{slug}`. Manpower Services has been removed from the footer.

The editor and preview reuse the blog content blocks: headings, paragraphs,
lists, tables and image groups. Service pages have an introduction, optional
FAQs, SEO title, description and keywords, with no author, publication date,
article label or related-blog section. The public page uses Service structured
data and website Open Graph metadata.

## Publication

- All four editors are available even before any content is saved. There is no
  seeded service copy. A first save creates the database row.
- **Save draft** accepts unfinished content and writes only the private draft.
  An existing approved revision remains the input to website builds.
- **Save for next build** requires complete metadata, an introduction and
  written body content in a paragraph, list or table. Titles, images, whitespace
  and empty blocks alone cannot publish a page.
- **Remove from website** clears the approved revision and preserves the draft.
  The page, footer link and sitemap entry disappear on the next successful build.
- Manual and nightly builds use only approved revisions. A build request
  snapshots approved content (or its removal), never the private draft.
- Every save checks the editor's revision. Concurrent first saves also fail
  without overwriting another editor's work.

The footer keeps the four service names as text until their page is published.
Only published, written services get clickable links, static HTML and sitemap
entries. Missing services show the normal 404 page. An API outage stops the
build; it cannot silently remove existing service pages or restore stale copy.

## Rollout

1. Apply the backend-owned additive SQL migration
   `scripts/sql/20260913_service_pages.sql`. It creates only `ServicePage`,
   restricts slugs and enables RLS. It inserts no rows and is safe to rerun.
   This migration was applied and verified on production on 13 September 2026;
   the service table contained zero rows after migration.
2. Deploy the backend with `GET /service-pages` and `GET /service-pages/:slug`.
   These uncached endpoints expose only approved, written service content.
3. Deploy the CMS and website. No new environment variables are required. The
   website build requires the new endpoint, so the backend must go first.

Both repositories mirror the same Prisma model. Generate the CMS client with
`prisma generate`; never run schema push/migration commands from the CMS's
partial schema.

## Validation

Run `npm run test:services` in the CMS, backend and website, plus the CMS deploy
tests. The website eval harness's `test:services:build` exercises publication,
empty content, API failures, generated HTML, footer links, metadata and removal
through production builds in an isolated copy. It skips IndexNow and deployment.

The 13 September 2026 evaluation also exercised the production CMS against an
isolated database and the actual backend service routes. Content saved through
the editor then went through four website builds: all published, one published,
unwritten, and none published. Desktop, 390px and 320px layouts, image upload
preparation (with storage stubbed), collages, every content block, FAQ toggles,
draft privacy, revision conflicts, unpublish/republish, and blog rendering passed.

Two regression fixes came out of the evaluation: published content must satisfy
every draft size limit so it can be reopened, and analytics must recognize the
four service URLs while continuing to strip private query parameters.
