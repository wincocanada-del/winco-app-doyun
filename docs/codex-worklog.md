## 2026-06-11 - Refactor Measure UI components

### Changed files

* `src/App.jsx`
* `src/features/measure/components/MeasureUi.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Moved small Measure UI components from `App.jsx` into `src/features/measure/components/MeasureUi.jsx`.
* Extracted `NumberL`, `InputL`, `SelectL`, `FeetInches`, `TitleCustomer`, and `TotalsCard`.
* Moved display-only layout/value class constants `COL`, `NUM`, and `NUM_GRAND` with those components.
* Kept `Measure` itself, pricing calculations, compatibility logic, `computeLine`, `computeTotals`, and accessory calculation logic in `App.jsx`.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className changes intended; extracted components keep the existing JSX/className structure.

### Functional changes

* No intended functional changes.
* Measure inputs, ft/in input, totals display, calculations, Draft save flow, and existing screen rendering were preserved.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4175 --strictPort` succeeded; HTTP response check returned `200`.

## 2026-06-11 - Refactor Splash and Login into Auth feature

### Changed files

* `src/App.jsx`
* `src/features/auth/AuthScreens.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Moved the former Splash and Login screen components from `App.jsx` into `src/features/auth/AuthScreens.jsx`.
* Kept top-level auth restore, `winco_auth` persistence, stage switching, tab entry, and logout behavior in `App.jsx`.
* Kept the existing PIN login account constants and role labels wired through the extracted Login screen.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className, menu label, DOM structure, or layout changes intended.

### Functional changes

* No intended functional changes.
* Splash display, Login display, PIN auth, worker/sales/admin role selection, login-to-tabs transition, and logout flow were preserved.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4175 --strictPort` succeeded; HTTP response check returned `200`.

## 2026-06-10 - Refactor app constants and helpers

### Changed files

* `src/App.jsx`
* `src/data/accounts.js`
* `src/data/appConfig.js`
* `src/data/fabrics.js`
* `src/data/options.js`
* `src/lib/fabricHelpers.js`
* `src/lib/formatters.js`
* `src/lib/storage.js`
* `src/lib/supabaseClient.js`
* `src/features/measure/.gitkeep`
* `src/features/quotes/.gitkeep`
* `src/features/orders/.gitkeep`
* `src/features/admin/.gitkeep`
* `docs/codex-worklog.md`

### Refactor summary

* Moved app version and feature flags from `App.jsx` to `src/data/appConfig.js`.
* Moved account/auth static constants to `src/data/accounts.js`.
* Moved hardware, control, motor, accessory, surcharge, mount, bottom, color, and space options to `src/data/options.js`.
* Moved fabric seed, fabric catalog patch constants, sales-hidden fabric codes, and fabric short-code map to `src/data/fabrics.js`.
* Moved localStorage/sessionStorage keys and helpers to `src/lib/storage.js`.
* Moved date, number, unit conversion, file-name, fraction, and code formatting helpers to `src/lib/formatters.js`.
* Moved fabric catalog patching and fabric display helpers to `src/lib/fabricHelpers.js`.
* Kept Measure, Drafts, Office, Admin JSX in `App.jsx` for this first low-risk refactor pass.
* Added empty future feature folders for `measure`, `quotes`, `orders`, and `admin`.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className, menu label, DOM structure, or layout changes intended.

### Functional changes

* No intended functional changes.
* Existing MC B/O display distinction is preserved through `canonicalFabricNo()`.
* Existing Customer-based Office export filename behavior is preserved.
* Existing DN-D fabric entry, price `12.5`, `DN 600 (White)` color, and DN-after-DN ordering patch are preserved.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4173` started on fallback port `4174` because `4173` was already in use; HTTP response check succeeded.

## 2026-06-11 - Refactor Office into Orders feature

### Changed files

* `src/App.jsx`
* `src/features/orders/OrdersPage.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Moved the former `OfficeCloud` screen from `App.jsx` into `src/features/orders/OrdersPage.jsx`.
* Kept the visible menu label as `Office`.
* Kept Office list rendering, Supabase jobs refresh/subscription, job detail rendering, Load to Measure, Delete, and Export handling in the extracted Orders feature.
* Passed existing App helpers, display components, Supabase functions, and export helpers into `OrdersPage` so payloads, table names, field names, export HTML, and export columns remain unchanged.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className, menu label, DOM structure, or layout changes intended.

### Functional changes

* No intended functional changes.
* Office list, detail, refresh, Load to Measure, Delete, and Export flows are preserved.
* Export filename remains Customer-based.
* Export still uses the existing Office HTML table generation and download behavior.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4173` started on fallback port `4174` because `4173` was already in use; HTTP response check succeeded.

## 2026-06-11 - Refactor Admin into Admin feature

### Changed files

* `src/App.jsx`
* `src/features/admin/AdminPage.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Moved the former Admin screen rendering and template-only handlers from `App.jsx` into `src/features/admin/AdminPage.jsx`.
* Kept the visible menu label as `Admin`.
* Kept template list, refresh, load to Measure, rename, note update, and delete handling in the extracted Admin feature.
* Passed existing Supabase template functions and `SUPA_ON` into `AdminPage` so template table names, fields, and payload structures remain unchanged.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className, menu label, DOM structure, or layout changes intended.

### Functional changes

* No intended functional changes.
* Template list, refresh, load to Measure, rename, note, and delete behavior were preserved.
* Measure Save as Template remains in the Measure flow and continues to use the existing `supaUpsertTemplate` logic.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4173` started on fallback port `4174` because `4173` was already in use; HTTP response check succeeded.

## 2026-06-11 - Refactor Drafts into Quotes feature

### Changed files

* `src/App.jsx`
* `src/features/quotes/QuotesPage.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Moved the former `DraftsLocal` screen from `App.jsx` into `src/features/quotes/QuotesPage.jsx`.
* Kept the visible menu label as `Drafts`.
* Kept draft list rendering, draft detail rendering, Load to Measure, Send to Office, and Delete draft handling in the extracted Quotes feature.
* Passed existing App helpers and display components into `QuotesPage` so Measure, Office, Admin, calculation, export, Supabase, and localStorage data structures remain unchanged.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className, menu label, DOM structure, or layout changes intended.

### Functional changes

* No intended functional changes.
* Draft storage still uses `winco_jobs`.
* Load to Measure still dispatches `winco_load_measure` and `winco_go_tab`.
* Send to Office still uses the existing Supabase insert flow and job payload.
* Delete still removes the selected draft from localStorage.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4173` started on fallback port `4174` because `4173` was already in use; HTTP response check succeeded.

## 2026-06-11 - Hotfix missing App helpers

### Changed files

* `src/App.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Restored the missing `COL` layout constant in `App.jsx`.
* Restored missing App-local helper definitions used after the refactor: `getVisibleById`, `focusAndScrollTo`, `normalizeItem`, Excel style/export helpers, and split summary helpers.
* Checked `App.jsx` with ESLint for undefined references; no remaining `no-undef` errors were reported.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.
* No className, menu label, DOM structure, or layout changes intended.

### Functional changes

* No intended workflow changes.
* Restored missing references only so existing Measure, Drafts, Office, Export, and focus/validation flows can resolve their original helpers.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4173` started on fallback port `4174` because `4173` was already in use; HTTP response check succeeded.

## 2026-06-11 - Hotfix normalizeCordType reference

### Changed files

* `src/App.jsx`
* `docs/codex-worklog.md`

### Refactor summary

* Restored `normalizeCordType()` in `App.jsx` so existing callers such as `resolveItem`, `lrValue`, `lenValue`, Measure row control handling, review rows, and export row generation can resolve it at runtime.

### UI summary

* No UI or CSS changes intended.
* `App.css` was not changed.
* `index.css` was not changed.

### Functional changes

* No intended workflow changes.
* Restored existing control normalization meanings: `STRING`/`STR` to `STR`, `CHAIN`/`CH` to `CH`, `CORDLESS` to `CLF`, `MOTOR` to `Motor`, otherwise preserving the existing value.

### Build result

* `cmd /c npm run build` succeeded.
* `npm.cmd run preview -- --host 127.0.0.1 --port 4173` started on fallback port `4174` because `4173` was already in use; HTTP response check succeeded.
