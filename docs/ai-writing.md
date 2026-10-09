# AI writing in the CMS

Open **AI writing** in a page editor, set the page URL if needed, and download
its writing template. Give that JSON to a writing assistant, then upload or
paste the completed file back into the same editor.

The file contains a version, page identity, field schema, guidance for each
section, and an editable `content` object containing the current copy. Only writing
fields can be imported. Page addresses, publishing controls, photos, dates,
related-page selections and computed statistics remain managed by the CMS.
Existing image blocks must be preserved exactly.

Downloads are generated from the current CMS schemas and the editor's current
values, including unsaved writing. They remain available on completed pages;
new pages need a valid slug first (plus the city slug for a micromarket).

| Page type | Source of the exported schema |
| --- | --- |
| Blog | Blog validator, restricted to writing fields and content blocks |
| City | Location validator, with city corridor and compliance fields |
| State | Location validator, with cities heading and compliance; city selections stay in the CMS |
| Micromarket | Micromarket validator, bound to both city and micromarket slugs |
| Service | Draft limits plus publishing requirements, combined with JSON Schema `allOf` |
| Legal | Legal validator, including its restricted block types; dates stay in the CMS |
| Ad page | Canonical ad template plus shared native text, card and step rules |

Schema types and limits follow code changes when the updated CMS is loaded.
The writing-field allowlist and editorial guidance are intentional product
choices. New native fields must be classified as writing or CMS-managed;
schema audit tests fail if a field is silently left unclassified. Cross-field
rules such as equal table row lengths and unique card IDs are explained in
the instructions and checked by the CMS, beyond what the JSON schema expresses.

Empty fields fill by default. **Review replacements** shows current and
proposed copy next to each other; replacements start unchecked. Select the
fields or sections to replace, then **Apply selected changes**. FAQ and block
collections are compared and replaced as sections, never merged by position.
Nothing is saved or published until the editor's normal save controls are used.

An unreadable file or unsupported structure leaves the editor untouched.
Structurally valid content with missing text can be applied and fixed in the
editor. Corrections name the field, FAQ or table row; **Go to field** moves to
it, including individual list items and table headers. Uneven table rows have
explicit controls to add missing cells or remove extra cells.
**Copy correction instructions** packages the JSON and problems for the AI.
Services can still save incomplete private drafts using their existing rules.

Corrected uploads can update untouched values from the same unsaved import.
Manual edits need a fresh replacement selection. **Undo import** restores only
untouched imported fields. If you edit a block or FAQ collection afterwards,
the whole collection is kept, including any imported copy still in it.
**Download current writing** exports the writing fields before reloading after
a save conflict; it is not a backup of photos or other page settings.

Imports are available for blank or partly written unpublished pages. Required
writing being complete locks imports, even when optional sections are empty.
Approved or previously deployed content also locks imports. Templates remain
downloadable. Legal and ad pages already contain approved content, so their
panels offer export with an explanation of why importing is unavailable.

The authenticated server checks the saved revision, completion and publication
state before applying, and again on an imported save. A pending Context Engine
draft must first be reviewed or discarded in **Content imports**. This workflow
does not depend on enabling that integration and needs no database migration.

Files are limited to 750 KB, 2,000 individual entries, and each editor's own
collection limits. Unsupported or deeply nested page identities report a
correction without entering the editor. Selecting a new file clears the old
preview; cancelling or failing that read cannot restore an older upload.
In blog and service editors, image uploads finish before imports or saves can
proceed, and merge into the latest block state so they preserve concurrent typing.

Run `npm run test:ai-writing` for schema, import policy, undo and server checks.
Its schema audit compares every page type with its native validator and changes
source constraints in isolation to prove the export is generated dynamically.
`node scripts/check-ai-writing-browser.mjs` audits all seven page types with
synthetic content, mocked server actions/uploads and no database access. It
covers replacement consent, correction links, table repair, file-read races,
failed checks/saves, undo, image-upload races and 390/320 px layouts. It uses esbuild from the
sibling website and Playwright from `wareongo-cms-evals`; screenshots go to a
temporary directory. Browser tests need localhost and headless Chrome access.

The unit suite also runs imported submissions through the native save actions
with an in-memory database stub. These checks do not replace an authenticated
staging smoke test against the real database and inventory services.
