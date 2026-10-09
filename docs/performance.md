# CMS request performance

Vercel functions run in Mumbai (`bom1`) beside the database. The CMS keeps its
existing Supabase pooler configuration; moving regions needs no schema change.

Dashboard and list reads use `lib/content-summaries.ts`. PostgreSQL compares
saved/deployed JSONB and returns identity, labels and status flags. Editors still
read their full records. Neither read path caches saved copy across requests.
When changing the content or snapshot shape, update the summary projection and
run its parity test against the editor's staging helpers.
City editors also skip the cross-page lookup used only by state previews.

`lib/editor-inventory.ts` caches validated backend inventory with a 60-second
revalidation interval. Next can serve the previous result while refreshing it,
including during backend outages. Requests have a five-second timeout. Initial
failures use the existing page fallback; errors and fallback empty arrays never
enter the cache. Write-time eligibility checks continue to use the uncached API
functions. Inventory is not a source of saved CMS copy.

`CmsLink` starts prefetching on hover, keyboard focus or touch. Explicit `true`
and `false` prefetch options are respected. Next retains navigation, history,
modifier-click behavior, loading boundaries and pending feedback.

Run `npm run test:performance` for local checks. To exercise the SQL comparison
against PostgreSQL, run:

```sh
CMS_SUMMARY_DATABASE_TEST=true node tests/content-summaries.test.mjs
```

The opt-in database test loads the normal environment. It uses SELECT statements
with synthetic rows in CTEs; it does not create tables or modify saved content.
