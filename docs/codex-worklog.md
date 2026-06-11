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
