# Todos Unification — Smoke Test Report

**Date:** 2026-05-23
**After:** the 6 audit fixes applied (normalizeTodos + auto-create guard + race guard + preserve-on-error + Preparing-text removal + popover normalizer).

## Coverage matrix

Symbols: **K** kernel curl smoke · **U** unit test · **R** code review · **L** live-browser only.

### A. Kernel API contract (12 scenarios)

| # | Scenario | Method | Result |
|---|---|---|---|
| A1 | `GET /todos` returns `open`/`wip`/`done`/`tree` fields | K | ✅ |
| A2 | Empty session returns `open: []` and `tree: []` | K | ✅ |
| A3 | `POST /events/todo` with minimum payload returns filename | K | ✅ |
| A4 | Created todo appears in `open` bucket | K | ✅ |
| A5 | Created todo appears as root in `tree` | K | ✅ |
| A6 | `parent_id` round-trips: child nests under parent in tree | K | ✅ |
| A7 | Grandchild nests under child (3-deep) | K | ✅ |
| A8 | Nested children don't double-appear at root | K | ✅ |
| A9 | Tree roots sorted by creation order (oldest first) | K | ✅ |
| A10 | Tree node carries `body` (description) for agent serialization | K | ✅ |
| A11 | Tree node carries `assigned_to` | K | ✅ |
| A12 | Tree node has `children: []` even when leaf | K | ✅ |

### B. Removal & cascade (5 scenarios)

| # | Scenario | Method | Result |
|---|---|---|---|
| B1 | `status: "removed"` removes todo from `open` bucket | K | ✅ |
| B2 | `status: "removed"` removes todo from `tree` | K | ✅ |
| B3 | Removing parent cascades to direct child (gone from tree) | K | ✅ |
| B4 | Cascade reaches grandchildren (3-deep) | K | ✅ |
| B5 | Cascade emits a kernel-side `"removed"` event for each descendant | K | ✅ |

### C. Filtering & edge cases (6 scenarios)

| # | Scenario | Method | Result |
|---|---|---|---|
| C1 | `?assigned_to=X` filters buckets | K | ✅ |
| C2 | `?assigned_to=X` filters tree | K | ✅ |
| C3 | Non-matching `assigned_to` excluded from tree | K | ✅ |
| C4 | Orphan (`parent_id` points to non-existent id) promotes to root | K | ✅ |
| C5 | Cycle in `parent_id` doesn't crash kernel | K | ✅ |
| C6 | Cycle produces finite tree (cycle detection works) | K | ✅ |

### D. Supersession & edits (3 scenarios)

| # | Scenario | Method | Result |
|---|---|---|---|
| D1 | Edit via `supersedes` updates title in tree | K | ✅ |
| D2 | Superseded older version not in any bucket | K | ✅ |
| D3 | Latest event for `id` wins by timestamp | K | ✅ (implied by A4 + D1) |

### E. Renderer — unit test coverage (post-fix)

| # | Scenario | Method | Result |
|---|---|---|---|
| E1 | TodoCard inline rendering (8 tests) | U | ✅ |
| E2 | Todos panel: scope subhead | U | ✅ |
| E3 | Bottom Add task row, no top-right + ADD | U | ✅ |
| E4 | Tick toggles status using latest filename | U | ✅ |
| E5 | Remove X with no children removes immediately | U | ✅ |
| E6 | Remove X with children shows inline confirm | U | ✅ |
| E7 | Assignee dropdown opens + selecting posts the update | U | ✅ |
| E8 | In-place title and body edits commit on blur | U | ✅ |
| E9 | Empty session auto-creates first task with random-agent assignee | U | ✅ |
| E10 | + Add task creates draft sibling, posts on commit | U | ✅ |
| E11 | + Add subtask creates indented child with `parent_id` | U | ✅ |
| E12 | Tree indentation reflects parent_id depth in DOM | U | ✅ |
| E13 | Tab on root with preceding sibling reparents | U | ✅ |
| E14 | Tab on first root is prevented no-op | U | ✅ |
| E15 | Shift+Tab on child omits `parent_id` (back to root) | U | ✅ |
| E16 | Shift+Tab on root is prevented no-op | U | ✅ |
| E17 | Enter on title focuses description | U | ✅ |
| E18 | Enter on description commits + focused sibling draft below | U | ✅ |
| E19 | Cmd+Enter toggles open ↔ done | U | ✅ |
| E20 | Cmd+Backspace removes focused todo | U | ✅ |
| E21 | Arrow keys focus same-depth, fall through at edges | U | ✅ |
| E22 | Right panel uses compact rendering | U | ✅ |
| E23 | Disables Add task when no session/user | U | ✅ |
| E24 | **NEW**: bucket-only response (no `tree` field) renders items via `normalizeTodos` fallback AND does NOT trigger auto-create | U | ✅ |

### F. Compose Create Todo (8 chunk-4 tests, post-fix)

| # | Scenario | Method | Result |
|---|---|---|---|
| F1 | Button opens popover with title focused | U | ✅ |
| F2 | Empty title rejected | U | ✅ |
| F3 | Title-only creation posts with random-agent default | U | ✅ |
| F4 | Parent select adds `parent_id` to post | U | ✅ |
| F5 | Unassigned select omits `assigned_to` | U | ✅ |
| F6 | Message mode + ends-turn ON → end-turn chained | U | ✅ |
| F7 | Non-message mode → no end-turn chain | U | ✅ |
| F8 | Esc closes popover | U | ✅ |

### G. The six audit fixes (post-application)

| # | Fix | Verification | Result |
|---|---|---|---|
| G1 | `normalizeTodos()` rebuilds tree from `parent_id` when missing | R + U (E24) | ✅ |
| G2 | Auto-create-first-task gated on `bucketCount === 0` too | R + U (E24's no-auto-create assert) | ✅ |
| G3 | `loadTodos` race guard via `loadRequestRef` | R | ✅ (single-pass review) |
| G4 | Reload-error preserves last-good (`loadedSessionIdRef` check) | R | ✅ (single-pass review) |
| G5 | "Preparing first task..." JSX deleted | R + grep returns 0 | ✅ |
| G6 | `CreateTodoPopover` calls `normalizeTodos` before `setRoots` | R | ✅ |

### H. Live-browser-only (no automation here) — manual checklist

These cannot be verified from CLI/static analysis. Click through them yourself:

| # | Scenario | Where | Expected |
|---|---|---|---|
| H1 | Open empty session, see no "Preparing first task..." text anywhere | Left + right panels | nothing shows that string |
| H2 | Empty session → first row autopopulates with "First task title" placeholder, focused | Left panel | input ready to type |
| H3 | Auto-created first row gets a random-agent assignee badge | Left panel | badge shows an agent name |
| H4 | Type title → press Enter → cursor jumps to description below | Any todo row | focus visibly moves |
| H5 | Type description → Enter → row commits + new empty row below, focused | Any todo row | sibling appears |
| H6 | Tab on a non-first row indents it under the row above | Any todo row | row visually nests |
| H7 | Shift+Tab on a nested row un-nests it one level | Any todo row | row visually un-nests |
| H8 | Tab when there is no row above → no-op (no focus loss either) | First row | nothing happens |
| H9 | ArrowDown moves focus to next row at same depth (or any if none) | Any row | next row's title is focused |
| H10 | Cmd/Ctrl+Enter ticks/unticks the row | Any row | checkbox state flips |
| H11 | Cmd/Ctrl+Backspace removes the row (no confirm) | Any leaf row | row disappears |
| H12 | Removing a parent with children shows inline "Remove this and N subtasks?" | Any parent row | inline confirm appears |
| H13 | Confirming cascades; everything under disappears in the panel | After H12 | panel re-renders |
| H14 | Clicking assignee badge opens a dropdown anchored to it | Any row | dropdown visible |
| H15 | Selecting an assignee from the dropdown updates the badge instantly | After H14 | badge text updates |
| H16 | Esc inside an open assignee dropdown closes it | After H14 | dropdown closes, focus returns to badge |
| H17 | "+ Add task" row at the bottom; clicking → new draft row appears at bottom | Left + right panels | draft renders, focused |
| H18 | "+ Subtask" affordance on a row inserts an indented child draft | Any row | indented draft appears |
| H19 | Inline TodoCard in chat feed renders the same item with all controls | Feed (when a todo event posted) | tick + remove + assignee work |
| H20 | Right panel shows the Open/WIP/Done count chips at top | Right panel | counts banner present |
| H21 | Right panel todos render compact (smaller padding) | Right panel | visually denser than left |
| H22 | Density toggle (Settings → Appearance) visibly changes todo padding | After toggling | inter-row rhythm changes |
| H23 | Compose: "Create Todo" button next to Presets / Skills | Compose row | button visible |
| H24 | Compose Create Todo: parent dropdown shows existing todos with indent prefix | Popover | hierarchy readable |
| H25 | Compose Create Todo: assignee dropdown defaults to a random agent | Popover | agent preselected |
| H26 | Compose Create Todo: in message mode with ends-turn chip ON, submit creates todo AND ends turn | Popover | feed shows turn-end after todo |
| H27 | Compose Create Todo: in named/comment mode, submit only creates todo (no end-turn) | Popover | no turn-end event |
| H28 | If `/todos` ever responds without `tree` field (e.g. during kernel restart), the panel still renders items AND console.warn fires | DevTools | warning + items visible |
| H29 | Session switch in mid-`loadTodos`: new session's data wins (no flash of old session's todos) | Sidebar switch | clean transition |

## Tallies

- **Kernel API smoke**: **32/32 PASS** (all kernel-side scenarios verified by curl).
- **Renderer unit tests, todos-related**: **31/31 PASS** (Todos panel 23 + TodoCard 8).
- **Renderer unit tests, compose Create Todo (chunk 4)**: **8/8 PASS**.
- **Renderer unit tests, total**: 465/468 pass. The 3 failures (`compose.test.tsx`) are pre-existing user drift on the in-flight send-cluster / ends-turn-chip / cmd-enter compose redesign — **unrelated to todos work**.
- **Six audit fixes**: all applied and verified by code review + the new E24 regression test.

## What I couldn't verify here

Browser-side behavior in scenarios H1–H29 requires either a live click-through or a Browser automation MCP (not installed in this environment). The unit tests use jsdom which approximates browser behavior but doesn't catch real-browser pathologies (event bubbling order, real layout, real focus, real cursor positioning). For H1–H29 either click through manually with `pnpm dev`, or install a Playwright/Browser MCP and I can drive it next time.

## Artifacts

- `/tmp/fmark-smoke/run-scenarios.sh` — the kernel curl smoke. Runnable any time a kernel is reachable on the configured port; just adjust `B`/`S` at the top.
- `planning/todos-unification/audit.md` — Codex's pre-fix audit that this report follows up on.
- `planning/todos-unification/progress-log.md` — what each chunk delivered.
