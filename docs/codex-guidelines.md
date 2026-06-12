# Codex Guidelines for Winco App

## Project Context

This is the legacy Winco app currently used for real business operations.

Business flow:
Measure -> Drafts / Quotes -> Office / Orders -> Export Excel

Menu mapping:
- Legacy Measure = New Measure
- Legacy Drafts = Future Quotes
- Legacy Office = Future Orders
- Legacy Admin = Future Admin

The current goal is gradual code refactoring only.
Do not apply the new app design unless explicitly requested.

## Absolute Rules

- Do not change UI or design unless explicitly requested.
- Do not modify App.css unless explicitly requested.
- Do not modify index.css unless explicitly requested.
- Do not change className values unless explicitly requested.
- Do not change DOM structure unless the task specifically requires it.
- Do not change menu names unless explicitly requested.
- Do not change Supabase table names, field names, or payload structure.
- Do not change localStorage or sessionStorage key names.
- Do not change export columns or export HTML table structure unless explicitly requested.
- Do not rewrite business logic while refactoring.
- When moving code, preserve existing function names, return values, and behavior.

## Existing Required Fixes That Must Be Preserved

- MC (B/O) must be distinguishable from MC in Review and Export.
- Export Excel filename must use Customer as the first priority.
- DN-D fabric must exist.
- DN-D must appear directly below DN in Roller fabric dropdown.
- DN-D price must be 12.5.
- DN-D must use the same color code as existing DN.

## Refactor Strategy

Refactor in small steps.
Prefer moving one small group at a time.
Do not move MeasurePage all at once.
Do not combine refactor with design changes.

Current structure direction:
- features/auth
- features/quotes
- features/orders
- features/admin
- features/measure
- data
- lib

## Required Verification

After every code change, run:

npm run build

When possible, also run:

npm run preview

Manual checks should include:
- Login works
- Measure opens
- Fabric selection works
- Price calculation works
- Draft save works
- Load to Measure works
- Send to Office works
- Office / Orders opens
- Export works

## Worklog Requirement

After every Codex task, update:

docs/codex-worklog.md

Add a new entry with this format:

## YYYY-MM-DD - Task Title

### Changed files
- List changed files

### Refactor summary
- Explain what was moved or changed

### UI summary
- State whether UI/CSS changed
- If no UI changes, write: No UI or CSS changes intended
- State whether App.css / index.css changed

### Functional changes
- State whether any functional change was intended
- If none, write: No intended functional changes

### Build result
- npm run build success/failure
- If failed, summarize error

Do not skip this worklog.
docs/codex-worklog.md must be included in the commit.
