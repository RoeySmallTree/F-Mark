# Consultation — full-scope expansion (no deferrals, no legacy)

The human owner has now directed: **"NEVER defer ANYTHING and NEVER leave legacy / back-comp"** and to
implement the whole "Within Files" feature set to completion. So every "deferred/v1-cut/non-goal" in the
spec is now IN SCOPE, and every contract change must DELETE the old path (no back-compat shims, no
optional-arg fallbacks, no deprecated parse branches). I will implement against your answers — be decisive.

Read first: `docs/superpowers/specs/2026-06-13-within-files-features-design.md`,
`planning/within-files/decisions.md`, `planning/within-files/spec-review.md`. Re-open source as needed.

## Decisions I need (give a concrete design per item, not just yes/no)

### X1. Layout — "place the three panes WHEREVER he'd like" (no deferral of 2D/vertical)
The spec deferred vertical/stacked/2D placement and shipped only 6 horizontal permutations. With "never
defer", design the FULL placement model. The shell `.main` is a single-row grid today
(`packages/renderer/src/shell/shell.css:11-25`). Propose the cleanest architecture that lets the user place
`{leftPanel, chat, rightPanel}` in genuinely free arrangements via an interactive orientation picker —
including vertical stacking and side-by-side mixes — WITHOUT a ground-up shell rewrite. Options to weigh:
(a) a 2x2/3x3 `grid-template-areas` model where each region is assigned to a cell (chat keeps the flexible
track); (b) a nested split-pane model (rows of columns). Give the concrete grid/areas design, how the chat
`1fr`/scroll ownership follows the chat region, how `LeftRail` (pinned), `PaneResizer`, `has-extra-pane`,
and the file-viewer `replace-chat`/`extra`/`lower`/`modal` shells compose with it, and what the picker UI
should let the user express. Keep it tractable but genuinely "wherever".

### X2. Standalone `/file-tree` comment posting — root-scoped event write/wake API (no deferral)
The spec deferred posting comments from `/file-tree` because event writes resolve the ACTIVE root
(`packages/kernel/src/routes/events.ts:142-152`) and 409 on a non-active `path` via the stale-path guard
(`packages/kernel/src/routes/stalePath.ts:27-72`); wake also uses active route paths
(`packages/kernel/src/routes/managedAgents.ts:1601-1604`). Design the root-scoped API so a standalone tab
can post file comments to ANY known session/root: which routes gain a validated `path_id`/root, how
`makePaths(knownRoot)` replaces active `resolvePaths(deps)`, what happens to the stale-path guard (remove it
or make it known-root-aware — note "no legacy"), how the WS/bus publish + presence/wake behave for a
backgrounded (non-active) path, and the client changes (`listEvents`/`postProse`/`wakeSession` gaining
root). Flag any correctness pitfalls (events written to a path the server isn't actively watching).

### X3. Hunk revert for untracked/added/deleted/renamed/binary (no "disabled in v1")
The spec disabled revert for untracked/added files. With "never defer", define real semantics for EVERY
status: untracked (delete file? per-hunk for a multi-hunk new file?), added-staged, deleted (restore),
renamed (revert rename + content), binary (revert whole file via `git checkout`?). Give the exact git
operations and the per-status action matrix.

### X4. Remove ALL legacy/back-compat the codebase currently carries in the touched areas
Identify and confirm removal of: (a) the deprecated legacy `target:{file,lines}` prose shape still parsed
for back-compat (mentioned in the exploration of `proseValidate.ts`/`blocks.ts`) — find it, confirm it
exists, and specify the clean removal + whether any on-disk `.prose.md` events use it (one-time migrate vs
accept break); (b) the "when root absent, behavior unchanged (active root) — backward compatible" framing
for `/files/text|content` — make `root`/`path_id` an explicit, required part of the contract and update
EVERY caller (main app included) rather than an optional fallback. Enumerate every call site of
`fetchFileText`/`fileContentUrl`/`fetchFilesTree` that must be updated.

### X5. base-ref override (no "API/config-only, no settings UI" deferral)
Add a real settings surface for the diff base-ref override. Where should it live (a new "Git/Diff" settings
section vs per-project chrome in the file viewer/diff toolbar)? Give the persistence model (per-project, like
`fileViewerLayoutByPath`?) and the API shape.

### X6. Sweep for anything else the spec marked non-goal/deferred/cut
Re-read §2 (Non-goals) and §11–§12 of the spec. For EACH item there, either design it into scope or, if it
is genuinely not a requirement the user asked for (e.g. "git snapshot at session create" was an
implementation choice we rejected in favor of a better approach, not a deferred user requirement), say so
explicitly and justify. The goal: nothing the USER asked for is deferred; rejected implementation
alternatives are fine to keep out.

### X7. Final phasing + landmines for the COMPLETE scope
Given everything is in-scope, give the final build order and the top landmines (esp. X1 layout and X2
root-scoped writes, which are the two big new surfaces).

## Deliverable
Write `planning/within-files/expansion-decisions.md` with a concrete design/verdict per X1–X7. Consultation
only — write that ONE file, modify no source. Cite file:line. Be decisive; I implement against this.
