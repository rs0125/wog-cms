# CMS UI and website previews

The CMS uses the approved WareOnGo website roles: Montserrat, paper `#FAF9F5`,
surface `#FFFEFA`, navy ink `#0A2239`, muted text `#47515B`, light dividers
`#D5DDE5`, and defined outlines `#AEBDCA`. Cards are flat, with 12px corners;
fields and buttons have 8px corners. Table fills remain neutral, with the
navbar's `#EDF2F7` hover. Do not reintroduce dark ivory loading fills.

## Sources

`styles/ui.tokens.css` and `styles/ui.css` are exact, committed copies of the
website files. The navigation and warehouse-card CSS are also mirrored for
preview geometry. Both apps deploy independently; no sibling import runs in
production. After a website role changes, run these from the CMS checkout:

```sh
node scripts/sync-ui-styles.mjs
node scripts/sync-ui-styles.mjs --check
```

`app/globals.css` bridges these roles to Tailwind 4 and the generated
`next/font` Montserrat family. Keep its `--ui-font` override: a literal font
name alone does not select the font that Next provides inside preview frames.

## Editor roles

- `cms-title`: admin page headings, 32px desktop / 24px mobile, weight 600.
- `ui-panel-title` / `ui-card-title`: 24px panels / 18px cards (16px mobile).
- `cms-label`: 14px, weight 500, normal case; metadata/hints use 12px.
- `cms-input`: 16px, at least 48px tall, defined outline, visible focus ring.
- `cms-btn`: 14px, weight 600, at least 44px; primary actions are at least 48px.
- `cms-card`: surface fill, light border, no shadow. Status colors retain
  their publishing/error meanings. Listing press shadows belong only to
  actual website listing cards and their preview placeholders.

Mobile lists wrap actions beneath titles, and long overview URLs wrap inside
the content column. Fixed save bars preserve the desktop sidebar clearance.

## Preview contract

The ad-page preview continues to load the actual website renderer through its
origin-checked message protocol. Do not replace it with a separate mockup.

Blog, service and legal previews use `PagePreview` and `DeviceFrame` at 1440px
or 390px. Editorial previews use the same frame and widths. Media queries run
inside the iframe; shrinking a desktop container is not a mobile preview.
The frame copies CSS and the next/font class, scales its full viewport to fit,
and reserves its content height. Keep borders outside its measured viewport.

`PreviewChrome`, `ContentPreview`, `LegalContent`, `city/CityPanels` and
`EditorialPreview` mirror the corresponding public components. Update both
when markup changes. Public headings use `ui-page-title`, paragraphs 16px,
tables `ui-table`, and CTAs `ui-button`; do not substitute smaller admin roles.
Navigation is presentational. Editorial inventory is explicitly marked as
layout placeholders because listing photos/prices arrive at website build
rather than from the prose editor. Statistics use actual backend values and
unsaved overrides; never fabricate them for appearance.

## Verification

Use the sibling CMS eval harness, with no save/deploy/data mutation:

```sh
npx playwright test tests/specs/navigation.spec.ts tests/specs/ui-standard.spec.ts --project=behaviour
```

The checks cover 320/390/768/1440px editor layouts, readable inputs, sidebar and
mobile navigation, retained unsaved edits, real desktop/mobile preview widths,
fonts, borders and overflow. Review captured screenshots too. The website
harness's `check-ad-page-preview.mjs` checks the actual ad preview against the
website with isolated fixture builds. Run TypeScript, ESLint and a production
build after stylesheet changes; development CSS ordering alone is not proof.
