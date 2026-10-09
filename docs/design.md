# Crate design authority

Owner: UI Designer. Builder consumes these tokens, components and the fixture; it does not add competing ad hoc styling.

## Brief
- **User and activity:** one collector browsing records they own, choosing what to play next, changing listening status and keeping notes. Sessions are short and frequent, usually on a laptop in the evening and sometimes on a phone near the turntable.
- **Content and density:** about 8–200 albums. The cover is the main way to recognise an album, so titles and artists stay readable beneath it. Notes run from empty to several paragraphs.
- **Character:** a confident, warm record-shop catalogue. Covers lead, the type is editorial, and the chrome stays restrained. It is a working collection tool, not a marketing page or audio player.
- **Constraints:** one entity; no accounts, uploads or streaming; light and dark themes; reduced motion; no page overflow at phone, tablet or desktop widths.

## Direction
**References (category conventions, not inspected sites):** this session did not inspect any external reference. The direction applies widely shared collection patterns: a cover wall for recognition (record-shop crates and digital music libraries), a list/detail side panel for editing without losing your place (mail and library apps), and status shown as a physical state rather than a badge farm.

**Two composition sketches compared:**
1. *Cover wall with a side panel (chosen).* The masthead, then search and a status filter, then a responsive cover grid. Selecting an album opens a detail/editor panel that docks beside the grid at ≥1180 px, becomes a drawer at tablet widths and a full-screen sheet on phones. The covers fill the first laptop viewport, and editing keeps the collection in view.
2. *Typographic index.* A dense table with thumbnails and the detail below it. Rejected: it hides the album art that makes the collection recognisable, and it reads as an admin grid.

**Attention order:** (1) covers and titles, (2) search and status filter, (3) Add album. In the panel: cover → title/artist → status switch → notes → Edit/Delete.

**Signature move:** each sleeve holds a record. When an album's status is *Listening*, the record slides partly out of the sleeve, so it is visibly "on the turntable" in the grid and the panel. Changing the status animates the slide. This is the only authored motion; reduced motion sets every duration to 0.

**Type:** Instrument Serif (display: wordmark, album titles in the panel, empty states) and Instrument Sans Variable (UI and content). Both are self-hosted under the OFL in `public/fonts/`. Numerals are tabular.

**Palette:** warm paper (light) and warm charcoal (dark), with a vermilion "label" accent. Statuses: Want to hear = ochre, Listening = accent, Heard = green. Text, selection, caret, focus ring and scrollbar all come from tokens.

## Files
| Path | Purpose |
|---|---|
| `public/styles/tokens.css` | The only source of color, type, space, radius and motion. Theme follows the system, or `<html data-theme="light\|dark">` pins it. Persist the user's choice in `localStorage["crate-theme"]`. |
| `public/styles/components.css` | All component styles and responsive rules. |
| `public/js/contract.js` | `STATUSES`, `LIMITS`, `countChars` (code points), `validateAlbum(input, {partial})`, `ERROR_COPY`. Usable unchanged from Node. |
| `public/js/ui.js` | DOM factories with no business logic: `sleeve`, `generatedCover`, `albumGrid`/`albumCard`, `skeletonGrid`, `searchField`, `statusFilter`, `emptyState`, `loadNotice`, `detailView`, `statusSwitch`, `editorView`, `missingView`, `pendingNote`, `resultSummary`, `announce`, `icon`, `h`. |
| `public/js/foundation.js`, `public/foundation.html` | Foundation harness: real components against an in-memory, API-shaped `FixtureStore` with controllable latency and failures. Reference controller for the Builder; not the production entry point. |
| `data/albums.json` | The shared fixture: eight fictional albums (key, title, artist, status, notes, cover). Seed exactly these, once. |
| `public/covers/*.svg` | Original abstract and typographic artwork, one per fixture album. Albums without `cover` get `generatedCover()`, a deterministic typographic sleeve. |

## Interaction contract (as implemented in the components)
- **Limits:** title ≤ 160 and artist ≤ 120 code points, counted after trimming; whitespace-only is rejected. Notes ≤ 4000 code points with whitespace preserved; missing notes become `""`. Counters show `n / max` and turn ochre at 90% and red when over. Notes always render as literal text (`textContent`, `white-space: pre-wrap`).
- **Pending:** a single in-flight mutation. The action in flight shows a spinner and verb ("Saving…", "Deleting…"). Competing controls (cards, search, filter, Add, close, Edit, Delete) are `aria-disabled` and guarded, not removed. Inputs become `readOnly` so focus and text stay put. A reserved status line explains the pause without shifting layout. Status changes are not optimistic: the sleeve and grid change only after success.
- **Focus:** opening detail focuses the panel title; the editor focuses Title. Close or Escape returns focus to the opener. Panels opened from Add album return to `#add-album`. If the opener is gone (deleted or filtered out), focus goes to `#collection-title`. A failed save focuses `#error-summary` after the controls unlock; its links jump to the fields. Failed status changes keep focus on the chosen option and show the error inline.
- **Failure copy:** `ERROR_COPY` covers network, server, not-found, invalid and load failures. Drafts and the loaded list are retained. A load failure shows a notice above the existing grid with "Try again". A missing record shows `missingView` with "Back to collection".
- **Delete:** confirmation is inline in the panel, not a modal: "Delete album" or "Keep it".
- **Announcements:** after search and filter settle, call `announce(liveRegion, resultSummary(count, total, {query, status}))`. The live region is polite and atomic. Search debounces about 220 ms.
- **Layout:** panel docked at ≥1180 px, a drawer with scrim from 720–1179 px (the collection is `inert`), a full-screen sheet below 720 px. On phones the grid has two columns and the filter fits without scrolling. Touch targets are ≥ 40 px, and 44 px for primary controls.

## Builder integration
Replace `FixtureStore` with `fetch` calls to the agreed `/api/albums` endpoints. Map `{error:{code,message,fields}}` to the same shapes: `code` `not_found` → missing flow, `fields` → editor errors. Store `cover` as a nullable column seeded from the fixture. Keep the `foundation.html` scenarios working, or retire them once integrated tests cover the same states. The filter counts come from the unfiltered collection.

## Acceptance criteria for visual review
1. At 1366×800 the first viewport shows the masthead, the toolbar and at least six covers with readable titles. There is no hero above the content.
2. The detail, editor, delete-confirm, missing, loading, load-error, no-results and empty states use only these components and tokens, in both themes.
3. Listening albums show the record out of the sleeve in the grid and in detail. The pending state shows no change until the save succeeds.
4. There is no horizontal page overflow at 360, 390, 768, 820, 1366 and 1440 px widths. Long titles clamp to two lines in cards and wrap in detail.
5. Pending, error and success copy appears in reserved lines without shifting the primary content. Focus follows the contract above.
6. Text contrast is ≥ 4.5:1 (body and secondary) in both themes. Focus rings are visible and use the accent.

## Foundation commands
`npm run foundation` (or `node scripts/foundation-server.mjs`; `PORT` and `HOST` are optional) → `http://127.0.0.1:4173/foundation.html?scenario=<name>&theme=light|dark`.
Scenarios: populated, filtered, search, no-results, empty, loading, load-error, stale-error, detail, detail-long, detail-empty-notes, status-pending, status-error, delete-confirm, missing, edit, create, editor-invalid, save-pending, save-error. A harness control strip switches the scenario, the next-request failure mode and the theme.
