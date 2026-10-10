# CMS UI and website previews

The CMS uses the approved WareOnGo website roles: Montserrat, paper `#FAF9F5`,
surface `#FFFEFA`, navy ink `#0A2239` (muted and charcoal text alias ink, as on
the website), grey placeholders `#47515B` (`placeholder:text-ui-placeholder`), light dividers
`#D5DDE5`, and defined outlines `#AEBDCA`. Cards are flat, with 12px corners;
fields and buttons have 8px corners. Table fills remain neutral, with the
navbar's `#EDF2F7` hover. Do not reintroduce dark ivory loading fills.

## Sources

`styles/ui.tokens.css` and `styles/ui.css` are exact, committed copies of the
website files. Preview frames load styles directly from the website; the older
navigation and warehouse-card snapshots do not control previews. Both apps deploy
independently; no sibling import runs in
production. After a website role changes, run these from the CMS checkout:

```sh
node scripts/sync-ui-styles.mjs
node scripts/sync-ui-styles.mjs --check
```

`app/globals.css` bridges these roles to Tailwind 4 and the generated
`next/font` Montserrat family. Keep its `--ui-font` override: a literal font
name alone does not select the font that Next provides in the editor.

## Editor roles

- `cms-title`: admin page headings, 32px desktop / 24px mobile, weight 600.
- `ui-panel-title` / `ui-card-title`: 24px panels / 18px cards (16px mobile).
- `cms-label`: 14px, weight 500, normal case; metadata/hints use 12px.
- `cms-input`: 16px, at least 48px tall, defined outline, visible focus ring.
- `cms-btn`: 14px, weight 600, at least 44px; primary actions are at least 48px.
- `cms-card`: surface fill, light border, no shadow. Status colors retain
  their publishing/error meanings. Listing press shadows belong only to
  the actual website listing cards.

Mobile lists wrap actions beneath titles, and long overview URLs wrap inside
the content column. Fixed save bars preserve the desktop sidebar clearance.

## Preview contract

All page previews use `WebsitePreview` at 1440px or 390px. They load the
website's actual React pages, CSS, navigation and inventory through an iframe.
`WEBSITE_PREVIEW_ORIGIN` defaults to `https://wareongo.com`; set it to a local
website origin when developing both apps. For the version 3 Bangalore schema,
deploy the backend first, then the website preview routes, then the CMS.
Version 1 and 2 ad content upgrade in memory when read; stored drafts, approvals and
historical revisions are preserved. No database migration is required.

Drafts cross only an origin-checked `postMessage` connection and stay in memory.
Never put draft text in URLs, storage, logs or public endpoints. Links and form
submissions are disabled in the frame; preview routes are excluded from indexing
and analytics. A failed preview offers Retry and leaves editor content intact.

Ad controls follow the website section order. Services have separate desktop/mobile
copy; benefits and audiences support optional mobile overrides with desktop fallback.
Every map-area photo has an independent image slot. Use the Preview state menu to
review the hero thank-you, contact dialog and contact notification without submissions.

Blog previews include the article and its index card in the current sort order.
The website resolves thumbnail fallbacks with the same rule as the production build.
Terms paragraphs expose their compact-spacing flag; privacy paragraphs use standard spacing.
City locality help describes the live 25-tagged-listing gate, separate from size cards.

The website owns pagination, missing-data conditions, related links, text
normalization and responsive layouts. Do not add duplicate page templates to
the CMS. Test changes against the website renderer at both frame widths, and
keep schema tests for saving, publishing and backward-compatible ad revisions.

Run `npm run test:previews:browser` from the CMS checkout in the combined workspace to build isolated
CMS and website fixture apps and compare every preview type at both widths.
It requires installed sibling backend, website and eval dependencies plus Chrome.
The audit checks editor order, mobile descriptions, map images, index cards,
interaction states, unsaved edits, retry, form isolation and the locality gate; it
writes screenshots and build logs to a temporary directory and makes no content
or deployment writes.

## Verification

Use the sibling CMS eval harness, with no save/deploy/data mutation:

```sh
npx playwright test tests/specs/navigation.spec.ts tests/specs/ui-standard.spec.ts --project=behaviour
```

The checks cover 320/390/768/1440px editor layouts, readable inputs, sidebar and
mobile navigation, retained unsaved edits, real desktop/mobile preview widths,
fonts, borders and overflow. Review captured screenshots too. The CMS
`test:previews:browser` checks every actual page preview against the website
with isolated fixture builds. Run TypeScript, ESLint and a production
build after stylesheet changes; development CSS ordering alone is not proof.

## Loading feedback

Every CMS list and editor has a route-level `loading.tsx`. List pages and their
loading files live in `(list)` route groups so their fallbacks never wrap an
editor. URLs stay unchanged. `CmsLoading` follows
the corresponding page's width, card or row layout, form sections and save bar.
Placeholders use neutral fills, expose one loading announcement, and contain no
focusable controls. Motion stops when reduced motion is requested.

Internal navigation uses `CmsLink`, which preserves Next's link behavior and
adds a small progress bar only while navigation is pending. Its brief appearance
delay avoids a flash on fast clicks. Feedback stays visible when the mobile menu
closes and clears with the navigation; it never covers or disables the editor.
Keep page loading tied to real requests rather than adding artificial delays.
