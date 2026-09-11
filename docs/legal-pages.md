# Legal pages

The first static-page CMS increment covers `/privacy-policy` and
`/terms-of-service`. The editor lives at `/legal` and uses the existing CMS
authentication and website deploy button.

Editors can change the heading, SEO title, meta description, effective date,
last-updated date, headings/paragraphs/lists, and closing notice. URLs are fixed.
The block editor supports `**bold**` and `[label](https://example.com)` or email
links. HTML is rendered as text. The initial migration preserves every word,
date, heading, list item, bold span and link from the original website pages.

## Saving and publishing

- **Save draft** updates `draftContent` only. Builds keep using the previous
  approved revision, including after the nightly build runs.
- **Save for next build** validates and saves the draft and copies it into
  `publishedContent`. It does not trigger a deployment.
- **Deploy website**, or the existing nightly cron, starts the website build.
  Its snapshot records `publishedContent`, never the private draft.
- A build snapshot acknowledges a build request; it does not confirm that the
  deployment succeeded. The list labels this explicitly.
- Every save checks `updatedAt` atomically. A stale tab gets an error and keeps
  its typed values instead of overwriting another save.

There is no delete/unpublish action for these fixed policy URLs. Future edits
can stay in draft while the last approved policy remains available.

## Deployment

1. Introspect the live database from **the backend repo** before changing the
   schema. Capture `prisma db pull --print` separately and reconcile live-only
   definitions before comparing the proposed schema.
2. Apply the backend's `scripts/sql/20260911_legal_pages.sql`. It creates and
   seeds only `LegalPage`, enables RLS, and rejects other slugs. Re-running it
   never overwrites saved policy content. This migration was applied and
   verified on production on 11 September 2026.
3. Deploy the backend, then the CMS and website. No new environment variables.
   The backend serves approved revisions at `GET /legal-pages` with `no-store`.
4. The website's normal build runs `generate-legal-pages.mjs` and embeds the
   content in static HTML. Browser visits add no CMS/API request or loading hop.

The website build requires both legal pages. An unavailable endpoint, missing
page, invalid date or unsupported content block stops the build before replacing
the generated data. An obsolete policy is never used as an outage fallback.

The backend owns the complete Prisma schema. The CMS only mirrors the models it
uses: run `prisma generate` here, never schema push/migration commands.

## Validation

- `npm run test:legal` in the CMS, backend and website exercises save/auth rules,
  draft isolation, revision conflicts, public response shaping and build guards.
- `npm run test:deploy` in the CMS covers the existing deploy/cron flow and
  verifies that legal snapshots contain approved content only.
- The CMS eval harness has `tests/specs/legal-pages.spec.ts`. It refuses to
  write unless `LEGAL_ISOLATED_EVAL=1` and its CMS checkout uses a localhost
  database. Its API assertions target the actual backend legal controller on
  localhost port 4421, connected to that same isolated database.
- Set `LEGAL_BUILD_STATE_FILE` during the CMS eval to capture its approved API
  response. In the website eval harness, use that file with
  `npm run test:legal:build` to test failed responses and a complete production
  SSG build in a disposable checkout. IndexNow is skipped; no deployment runs.
- Set `WEBSITE_DIR` to that disposable checkout and run `npm run test:legal`
  in the website eval harness for desktop/mobile and JavaScript-disabled checks.

The CMS and website `LegalContent.tsx` renderers intentionally match. Keep their
formatting and safe-link rules synchronized when extending this small format.
