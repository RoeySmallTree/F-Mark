# Phase 9 Buddy Verification - Startup Reconcile

## Executive Summary

**Verdict: FAIL pending tracker-state seeding fixes.**

Commit `8a62a36` implements the Phase 9 reconciliation pass, wires it into kernel startup, and the requested focused and full kernel test suites both pass. The three mechanical reconcile cases are present: surviving agent tmux sessions are reattached to the tracker, dead agent siblings are cleared and logged, orphan agent sessions are killed, and terminal sessions are kept.

However, the design's state-seeding requirement is not fully met. The spec says a surviving managed agent with hooks installed should surface as `stale` until its next ping, but the current tracker derives `launching` when `hooksInstalled === true` and `lastHookAt === null`. The spec also says an agent dir whose tmux session is gone should surface as `pane-dead`, but reconcile calls `tracker.clearManagedPane(aid)`, which creates no tracker entry on cold startup and cannot derive `pane-dead` after the pane closure has been removed.

## Test Results

- `pnpm --filter f-mark test tests/reconcile.test.ts` - **PASS**, 1 file / 5 tests.
  - Covers tmux-unavailable early return.
  - Covers CASE A with hooks absent, yielding `hook-not-installed`.
  - Covers CASE B file cleanup and `pane-died` log append.
  - Covers CASE C orphan agent session kill.
  - Covers terminal session kept.
- `pnpm --filter f-mark test` - **PASS**, 68 files / 391 tests.
  - No kernel package regression observed.

## Spec Coverage

- **tmux unavailable:** satisfied. `reconcile.ts:37-38` calls `tmux.getVersion()` and returns when it is null.
- **Project-owned tmux session filtering:** satisfied through `tmux.listFmarkSessions()`. The concrete manager filters F-Mark session names, then verifies `@fmark-project` equals the kernel project root before returning sessions.
- **CASE A, agent dir plus live tmux session:** partially satisfied. `reconcile.ts:67-83` matches the recorded session name against live F-Mark agent sessions, calls `tracker.setManagedPane(...)`, reads runtime, calls `checkHookInstallStatus(...)`, and writes hook status to the tracker.
- **CASE B, agent dir but tmux session gone:** partially satisfied. `reconcile.ts:87-95` clears `tmux-session` and `runtime`, calls `tracker.clearManagedPane(aid)`, and appends a best-effort `pane-died` log entry.
- **CASE C, orphan agent tmux session:** satisfied. `reconcile.ts:99-111` kills agent sessions whose `participantId` has no agent dir, best-effort.
- **Terminal sessions:** satisfied. Only `kind === "agent"` sessions enter the orphan kill path; terminal sessions are left alone.
- **Startup wiring:** satisfied. `index.ts:110-119` invokes reconcile after `app.listen(...)` has succeeded and wraps it in try/catch so reconcile failure does not crash startup.

## Per-File Critique

### `packages/kernel/src/reconcile.ts`

- **OK - tmux missing is a no-op.**  
  `reconcile.ts:37-38` returns early when `getVersion()` returns null. The focused test at `packages/kernel/tests/reconcile.test.ts:60-68` verifies no killed sessions and an empty tracker snapshot.

- **OK - `listParticipants` is best-effort.**  
  `reconcile.ts:52-63` wraps participant loading in try/catch and falls back to `checkHookInstallStatus`'s default `us-unknown` user id when participant config is unreadable.

- **OK - hook status check is per-agent best-effort.**  
  `reconcile.ts:74-85` reads the runtime for each surviving agent and catches `checkHookInstallStatus` failures per agent, so one unknown/broken runtime does not abort the whole reconcile loop.

- **HIGH - surviving agents with installed hooks do not become `stale`.**  
  `reconcile.ts:72` seeds `paneAlive`, then `reconcile.ts:77-82` sets `hooksInstalled` based on `checkHookInstallStatus`. But `PresenceTracker.deriveState` returns `launching` whenever `lastHookAt === null` unless `hooksInstalled === false`; there is no path from `hooksInstalled === true` plus live pane to `stale`. This conflicts with the spec's "If hooks present -> state = `stale` (next ping flips to `online`)" requirement.

- **HIGH - dead managed agents do not become `pane-dead` on cold startup.**  
  `reconcile.ts:89-92` clears sibling files, clears the managed pane, and logs `pane-died`. On a fresh kernel tracker, `clearManagedPane` returns immediately because no entry exists. If an entry did exist, deleting `paneAlive` prevents `deriveState` from returning `pane-dead`, since `pane-dead` is only derived from a present `paneAlive` closure returning false. This conflicts with the spec's "Agent dir + tmux session gone -> state = `pane-dead`" requirement.

- **OK - orphan agent sessions are killed without touching terminals.**  
  `reconcile.ts:99-111` checks `s.kind === "agent"` before killing and compares `participantId` against known agent dirs. Terminal sessions never match that path.

### `packages/kernel/src/presence/tracker.ts`

- **HIGH - tracker has no API for reconcile to seed explicit `stale` or `pane-dead` state.**  
  The public API exposes `setManagedPane`, `clearManagedPane`, and `setManagedHookStatus`, but no method to mark a recovered agent stale or mark a missing pane dead. `deriveState` can produce `pane-dead` only while a `paneAlive` closure exists and returns false, and it can produce `stale` only when there is a non-null `lastHookAt` older than the online TTL.

### `packages/kernel/src/index.ts`

- **OK - reconcile is best-effort after server bind.**  
  The server bind loop completes before the reconcile block. `index.ts:110-119` constructs a tmux manager, awaits `reconcile(...)`, catches any thrown error, and writes a warning to stderr instead of crashing.

- **OK - placement is after `app.listen`.**  
  Reconcile currently runs after `startWatcher(...)` as well as after bind. That still satisfies the Phase 9 startup requirement that it run only after the server successfully listens.

### `packages/kernel/src/tmux/manager.ts`

- **OK - `listFmarkSessions` verifies `@fmark-project`.**  
  The concrete tmux manager lists sessions, filters to F-Mark names, calls `getUserOption(name, "@fmark-project")`, and only returns sessions whose value equals `projectRoot`.

### `packages/kernel/tests/reconcile.test.ts`

- **OK - five requested tests pass.**  
  The test file covers tmux-unavailable, CASE A, CASE B, CASE C, and terminal-kept.

- **HIGH - CASE A tests only the hooks-absent branch.**  
  The test at `reconcile.test.ts:70-97` uses `gemini`, where `checkHookInstallStatus` reports `installed=false`, and asserts `hook-not-installed`. There is no test proving hooks-present survivors become `stale`.

- **HIGH - CASE B does not assert tracker state.**  
  The test at `reconcile.test.ts:99-128` asserts sibling cleanup and `pane-died` logging, but it never checks `tracker.snapshot()` for a `pane-dead` entry.

## Edge Cases

- **`listParticipants` throws:** handled by the local try/catch in `reconcile.ts:53-63`.
- **tmux is missing:** handled by `getVersion()` returning null and the early return in `reconcile.ts:37-38`.
- **`hook-install-status` throws for one agent:** handled by the per-agent try/catch in `reconcile.ts:76-85`.
- **`listFmarkSessions` throws:** not caught inside `reconcile`, but startup wiring catches all reconcile failures in `index.ts:110-119`, so startup remains non-crashing. Direct unit callers would see the rejection.

## Recommendation

Do not accept Phase 9 as fully spec-compliant yet.

Add explicit tracker support for reconciliation state seeding, for example a method that can mark a live recovered managed pane with installed hooks as `stale`, and a method that can mark a known managed agent as `pane-dead` even when no pane closure exists. Then extend `packages/kernel/tests/reconcile.test.ts` with:

- CASE A hooks-present survivor -> tracker state `stale`.
- CASE A hooks-absent survivor -> tracker state `hook-not-installed` (already covered).
- CASE B dead managed agent -> tracker state `pane-dead`.
- Optional direct test that a throwing `checkHookInstallStatus` does not abort reconciliation of later agents.

After those state fixes, the existing tmux/file cleanup behavior and startup wiring should be acceptable.
