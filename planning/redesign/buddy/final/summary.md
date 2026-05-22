# Phase 15 — Final Polish · Buddy Review Brief

## Status

All 15 phases of the F-Mark redesign have landed. Phase 15 is the closeout
polish pass + this final buddy review.

- Renderer tests: **238 passing across 26 files**
- Kernel tests: **123 passing across 28 files**
- Build pipeline (`@f-mark/shared → @f-mark/renderer → f-mark → f-mark build:bundle`): **clean**
- Smoke run on port 9090: `/health` returns ok, `/presets` returns the 8 builtins, `/skills` returns an array, `/` returns HTML referencing the bundled renderer assets.

Final commit on `main`: **`fd9fe36`** — `chore(redesign): final polish …`.

## What Phase 15 changed

### Dead-button audit

Walked every `<button>` in `packages/renderer/src` and resolved each:

- **TopBar breadcrumb** (`src/shell/TopBar.tsx`): demoted from an inert `<button>` to `<div role="presentation">` since it had no `onClick` and the design treats it as a visual breadcrumb label, not an interactive control.
- **ProseCard `.menu` (•••)** (`src/cards/ProseCard.tsx`): wired to Quick-copy contribution → `copyToClipboard(payload.content)`. Distinct from the foot toolbar's "Copy as markdown" so it's accessible when the foot is offscreen on long contributions. Disambiguated aria-label ("Quick-copy contribution").
- **ChoicesCard `.menu`** (`src/cards/ChoicesCard.tsx`): wired to copy the question text.
- **EmbedCard `.menu`** (`src/cards/EmbedCard.tsx`): wired to copy the absolute embed link (resolved against `window.location.origin`).
- **Todos panel `+ ADD`** (`src/panels/Todos.tsx`): previously `disabled` with `title="Coming in P10"`. Now opens an inline form (title input + Add/Cancel) and POSTs to `/sessions/:id/events/todo` via `client.postTodo` (the kernel endpoint shipped in P2). Generates short ids like `td-x9k2`. Enter to submit, Escape to cancel.
- **Orphaned `src/components/`** (8 stale TSX files: Feed, LeftRail, RightPanel, TopBar, cards/ChoicesCard, cards/CommentBubble, cards/ProseCard, cards/TurnEndMarker): deleted. These were pre-shell-rewrite remnants with no current imports. Verified no test/source references via grep before removal.

### Empty-state audit

Updated empty-state copy to match the spec verbatim:

- Sessions panel: **"No sessions yet. Press + New."**
- Todos panel: **"No todos in `<slug>`. Click + Add."** (replaces the per-bucket "No open todos."/"Nothing in progress."/"Nothing done yet." trio when the totalCount is 0).
- Search panel: when the query is empty, **"Type to search across sessions, named contributions, todos."** (previously absent — the panel showed nothing).
- Agents (Settings): **"No agents registered yet. Click + Add agent above."** (was just "No agents registered yet.").

Other empty states verified already correct:
- Named panel: "No named contributions yet." (P4)
- Comments panel: "No comments yet." (P4)
- Right panels (Todos/Comments/Named): scope-qualified equivalents.
- Feed: per-view empty states (P13).
- CmdK / Skills palettes: "No matches…" / agent-installation hint (P7, P9).

### Console-error audit

Ran `vitest` and captured stderr — no React warnings (missing key, controlled-input, etc.) emitted from any test. No `vi.spyOn(console,…)` suppressions added.

### Shortcut registry sync

`src/modals/settings/shortcut-registry.ts` was already in sync with every `useHotkeys` callsite:

| Combo | Description | Bound in |
|---|---|---|
| `$mod+/` | Toggle comment mode | `compose/Compose.tsx` |
| `$mod+N` | Toggle named mode | `compose/Compose.tsx` |
| `$mod+Enter` | Send / end turn | `compose/Compose.tsx` |
| `Escape` | Close modal / clear comment target | window listener + Compose |
| `$mod+K` | Command palette | `App.tsx` |
| `$mod+P` | Presets palette | `compose/Compose.tsx` |
| `$mod+Shift+K` | Skills palette | `compose/Compose.tsx` |

Platform formatting via `chordToKeys()` swaps `$mod` to **Cmd** on macOS (detected via `navigator.platform` regex) and **Ctrl** elsewhere. No phantom entries; no missing entries.

### README update

`README.md` "Status" rewritten to v0.2.0 + new "What's in the renderer" section enumerating the major surfaces (command palette, presets, skills, settings, six themes, view toggle, comment overlay, real backend, markdown/JSON renderers). Existing install/run/agent integration instructions preserved.

### progress.md finalization

Prepended `# REDESIGN COMPLETE` block + paragraph summary above the existing per-phase table, listing tests/build status and the major surfaces shipped. Added a P15 row to the table.

## Codex — please verify

1. **Does every visible button work?**
   - Walk `packages/renderer/src` for `<button` and confirm each has a real `onClick`, is `disabled` with a meaningful reason, is inside a `<form>` as type=submit, or its handler is wired through a parent prop. Flag any button that still lacks a handler.
   - Specifically check: the three card menus (Prose / Choices / Embed), the Todos `+ ADD` flow, and the TopBar (now the breadcrumb is a `<div>` — was that the right call, or should it open something?).

2. **Are all hotkeys documented?**
   - Cross-reference every `useHotkeys` callsite (`grep -rn "useHotkeys" packages/renderer/src`) against the entries in `src/modals/settings/shortcut-registry.ts`. Report any drift.
   - Confirm the Settings → Shortcuts UI renders Mac ⌘ vs others Ctrl correctly (see `chordToKeys` in shortcut-registry.ts).

3. **Do empty states appear correctly in each panel?**
   - For each panel (Sessions, Named, Todos, Comments, Search, plus the right-side Todos/Comments/Named/Log) and modal (Agents), verify the empty-state copy matches the spec.
   - Also verify the spec strings are the *exact* text in the source (the parent agent literally listed them in the brief).

4. **Does the build pipeline produce a deployable npm package?**
   - Confirm `pnpm -F @f-mark/shared build && pnpm -F @f-mark/renderer build && pnpm -F f-mark build && pnpm -F f-mark build:bundle` all succeed.
   - Confirm `packages/kernel/dist/renderer/` contains the bundled `index.html` referencing a hashed JS + CSS asset, and `packages/kernel/dist/_shared/` contains the rewritten shared types.
   - Optional sanity: try `pnpm pack -F f-mark` and confirm the tarball contains `dist/`, `bin/`, `assets/` (per the kernel's `"files"` manifest).

## Files of interest

- `packages/renderer/src/shell/TopBar.tsx` — breadcrumb demotion
- `packages/renderer/src/cards/{ProseCard,ChoicesCard,EmbedCard}.tsx` — menu wiring
- `packages/renderer/src/panels/Todos.tsx` — add-flow rewrite
- `packages/renderer/src/panels/Sessions.tsx` — empty-state copy
- `packages/renderer/src/panels/Search.tsx` — empty-query state
- `packages/renderer/src/modals/settings/Agents.tsx` — empty-state copy
- `packages/renderer/src/modals/settings/shortcut-registry.ts` — registry source of truth
- `packages/renderer/src/components/` — deleted (orphan)
- `README.md` — status + "What's in the renderer"
- `planning/redesign/progress.md` — REDESIGN COMPLETE block

## Tests added in P15

- `tests/cards/menu-buttons.test.tsx` (3 tests) — verifies each card menu copies the right content.
- `tests/panels/todos.test.tsx` (6 tests) — verifies + ADD form, client.postTodo call shape, Esc-to-cancel, disabled-when-no-session.
- `tests/panels/empty-states.test.tsx` (3 tests) — verifies the spec copy in Sessions/Search/Agents.

## Outcome

Phase 15 closes out the redesign. If Codex flags substantive gaps, the follow-up commit will fix them in place.

## Write your review here

Please write your findings to `planning/redesign/buddy/final/review_1.md`.
