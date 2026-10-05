# Content imports

Context Engine imports write to a private review queue. They cannot publish,
unpublish or start website builds. Open **Content imports** to review the exact
before/after diff, approve it for the next build, or discard it. A preview marked
PREPARED has not been saved as drafts yet. DRAFT means private imported content
awaits CMS approval. Approved content follows the existing website build flow.

If native content or a pending draft changes after preview, the client must prepare
a new import. If a draft was superseded, discard the old import and review the
latest one. Discarding an old import never removes a newer draft.

The integration supports blogs, cities, states, micromarkets, services, legal pages
and ad pages. Schemas are derived from this CMS's validators. CSV batches accept
up to 20 data rows and 24,000 UTF-8 bytes. Missing columns and empty cells preserve
current values. JSON null, `""`, and `[]` explicitly clear values where permitted.
Images must already have suitable HTTPS URLs; this integration does not upload.

Before enabling, apply the **backend-owned** migration
`WareOnGo-Website-Backend/scripts/sql/20261005_cms_agent_imports.sql`. Do not use
Prisma db push, db pull or migrate here: this app has a partial schema mirror.
Keep the private schema outside PostgREST. Use the private table owner connection,
or explicitly provision a CMS-only role with table grants and targeted RLS policies.
Never grant CMS database access to the Context Engine.

Set `CMS_CONTEXT_ENABLED=true`, the actual HTTPS `CMS_PUBLIC_ORIGIN`, and
`CMS_CONTEXT_PUBLIC_KEYS_JSON` containing the Context Engine's Ed25519 public keys
with key IDs and expiration dates. The signing private key stays in the Context
Engine. Existing `CMS_ALLOWED_EMAILS` is checked on each signed request and CMS
review action. See `Context_Engine/docs/cms-tools.md` for the matching Context
Engine configuration, credential scopes, rotation and rollout sequence.

Run `npm run test:agent-cms` for offline validation. For database checks, set
`CMS_TEST_DATABASE_URL` to an explicitly disposable localhost `cms_agent_test`
database owned by `cms_test`, and `CMS_TEST_MIGRATION` to the backend migration,
then run `npm run test:agent-cms:postgres`. The tests reset synthetic content tables
in that database. They never load `.env` or use the app's `DATABASE_URL`.
