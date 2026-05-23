# Shortcuts Progress Log

## 1. Items completed

- Reviewed the shortcut reconciliation task and deliverables in `planning/shortcuts/task.md:1`.
- Confirmed the worktree already contains unrelated dirty files before making changes with `git status --short`.
- Audited rendered shortcut hints and current registrations with `rg` across `packages/renderer/src`.
- Confirmed the canonical shortcut list is rendered from `packages/renderer/src/modals/settings/shortcut-registry.ts:21`.
- Confirmed current `useHotkeys` registrations are only in `packages/renderer/src/App.tsx:41` and `packages/renderer/src/compose/Compose.tsx:211`.
- Added the final shortcut drift inventory in `planning/shortcuts/inventory.md:1`.
- Fixed the compose `$mod+Enter` binding to use `sendOrEndTurn()` in `packages/renderer/src/compose/Compose.tsx:139` and `packages/renderer/src/compose/Compose.tsx:192`.
- Fixed focused textarea Escape handling in `packages/renderer/src/compose/Compose.tsx:156` and `packages/renderer/src/compose/Compose.tsx:255`.
- Replaced hardcoded shortcut display strings with `chordToLabel()` from `packages/renderer/src/modals/settings/shortcut-registry.ts:83`.
- Changed the non-shortcut skills agent badge to a `<span>` in `packages/renderer/src/modals/SkillsPaletteModal.tsx:302`.
- Added compose hotkey assertions in `packages/renderer/tests/compose.test.tsx:163`, `packages/renderer/tests/compose.test.tsx:207`, and `packages/renderer/tests/compose.test.tsx:303`.
- Ran targeted compose tests with `pnpm -F @f-mark/renderer exec vitest run tests/compose.test.tsx`; `packages/renderer/tests/compose.test.tsx:1` passed with 19 tests.
- Ran the required renderer suite with `pnpm -F @f-mark/renderer test`; `packages/renderer/tests/compose.test.tsx:1` was included and the suite passed with 252 tests.
- Ran the required renderer build with `pnpm -F @f-mark/renderer build`; build passed.

## 2. Decisions made

- Treat existing dirty files as user-owned work and only edit shortcut-related lines where the task requires it.
- Keep the work scoped to `packages/renderer/` and `planning/shortcuts/`, per `planning/shortcuts/task.md:115`.
- Fix the compose `$mod+Enter` drift on the binding side because the visible Send button still advertises that shortcut.
- Fix focused-textarea `Escape` with a local textarea key handler because `useHotkeys` intentionally suppresses non-`$mod` chords in editable targets.
- Change the skills agent badge from `<kbd>` to a non-key element because it is metadata, not a keyboard shortcut.
- Use the registry formatting helper for existing inline shortcut labels rather than introducing another display formatter, so Settings and surface hints share the same platform resolution.

## 3. Items deferred

- Unrelated dirty work in density CSS, preset-editor/custom-preset work, renderer card/tool-use files, and `packages/shared/src/extensions.ts` was left as-is because the shortcut task is renderer-shortcut scoped and those changes were not required.

## 4. Open questions

- None.
