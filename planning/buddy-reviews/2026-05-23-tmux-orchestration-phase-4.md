# Phase 4 Buddy Verification: Presence Tracker + `/agents/:id/ping`

## Executive summary
PASS-WITH-FIXES
Phase 4 is mostly spec-compliant and the clean Phase-4 suite reaches the expected 233 tests with no failures.
Before closing the phase, tighten the required transition tests and clear the server ticker on close.

## Test outputs

Targeted Phase 4 command, run in the live worktree:

```text
$ pnpm --filter f-mark test tests/presence/ tests/routes/presence.test.ts tests/ws.test.ts

Test Files  3 passed (3)
Tests       11 passed (11)
```

Full kernel regression, run in the live worktree:

```text
$ pnpm --filter f-mark test

Test Files  48 passed (48)
Tests       255 passed (255)
```

The live branch is not a clean Phase-4-only count: during verification it included later work beyond the three Phase 4 commits, currently `599e5ce fix(kernel/tmux phase 2): address buddy findings` and `abb1357 feat(kernel/hooks): autoStream pings presence tracker on every fire`, plus unrelated renderer WIP. I therefore also checked a temporary clean worktree at the last Phase 4 commit, `67cde51`.

Clean Phase 4 worktree:

```text
$ git worktree add --detach /tmp/fmark-phase4-verify.ChLiFS 67cde51
$ pnpm install --frozen-lockfile --offline
$ pnpm --filter @f-mark/shared build
$ pnpm --filter f-mark test

Test Files  46 passed | 1 skipped (47)
Tests       229 passed | 4 skipped (233)
```

Note: the first clean-worktree test attempt failed before building `@f-mark/shared` because Vite could not resolve `@f-mark/shared`. After building that package, the clean Phase 4 test run passed at the expected 233-test total.

Phase 4 commit scope:

```text
$ git show --stat c162acd 5874862 67cde51

c162acd packages/kernel/src/presence/tracker.ts
c162acd packages/kernel/tests/presence/tracker.test.ts
5874862 packages/kernel/src/ws/bus.ts
5874862 packages/kernel/tests/ws.test.ts
67cde51 packages/kernel/src/routes/presence.ts
67cde51 packages/kernel/src/server.ts
67cde51 packages/kernel/tests/routes/presence.test.ts
```

This matches the requested Phase 4 scope. Later commits outside these three Phase 4 commits were ignored for the scope assessment.

## Spec compliance

- [OK] `packages/kernel/src/presence/tracker.ts:1-7` defines all six states: `launching`, `online`, `stale`, `offline`, `pane-dead`, and `hook-not-installed`.
- [OK] `packages/kernel/src/presence/tracker.ts:26-28` uses `ONLINE_TTL_MS = 60_000`, `ONLINE_MANAGED_TTL_MS = 120_000`, and `OFFLINE_TTL_MS = 600_000`.
- [OK] `packages/kernel/src/presence/tracker.ts:55-56` implements idempotent broadcasts by returning when `prev === e.state`.
- [OK] `packages/kernel/src/presence/tracker.ts:98-103` implements `tick()` by re-deriving state and emitting only on state changes.
- [OK] `packages/kernel/src/server.ts:107-111` creates the tracker, wires its broadcast to the bus, starts the periodic tick, and calls `.unref()`.
- [OK] `packages/kernel/src/server.ts:125` registers `registerPresenceRoutes(app, () => tracker)`.
- [OK] `packages/kernel/src/server.ts:28-32` and `packages/kernel/src/server.ts:143-147` extend `CreatedServer` with `getTracker()`.

## Per-file critique

- [MEDIUM] `packages/kernel/tests/presence/tracker.test.ts:47-52` does not actually cover the required `stale -> offline` transition. It pings, advances straight to `601_000ms`, and ticks once, so the observed transition is from the stored `online` state directly to `offline`. Add a test that first ticks into `stale`, then advances beyond 10 minutes and asserts `offline` plus the broadcast sequence.

- [LOW] `packages/kernel/tests/presence/tracker.test.ts:35-44` covers the 120s managed-pane threshold, and `packages/kernel/tests/presence/tracker.test.ts:55-62` covers `pane-dead`, but neither asserts broadcast behavior. Given Phase 4 is a WS presence-broadcast phase, add at least one assertion that these state changes publish the expected message.

- [LOW] `packages/kernel/tests/presence/tracker.test.ts:8-15` exercises `launching -> online` implicitly through a new entry, but no test asserts `launching` is reachable as a snapshot state. `setManagedPane()` with an alive pane and no ping currently reaches `launching`; add a direct assertion so all six states are explicitly covered.

- [MEDIUM] `packages/kernel/src/server.ts:110-111` starts an unref'ed interval but never clears it on `app.close()`. `.unref()` prevents the timer from keeping the process alive, but repeated `createServer()` / `app.close()` cycles still leave live callbacks and tracker references until process exit. Add an `onClose` hook that calls `clearInterval(presenceTicker)`.

- [LOW] `packages/kernel/src/presence/tracker.ts:48` and `packages/kernel/src/presence/tracker.ts:69` read `now()` separately during `ping()`: once to assign `lastHookAt`, then again while deriving state. In real time this is usually harmless, but the injected clock can time-warp and classify a fresh ping as stale/offline. Capture one timestamp in `ping()` and use it consistently for both `lastHookAt` and derivation.

- [OK] `packages/kernel/src/presence/tracker.ts:82-88` re-derives state in `clearManagedPane()`. If a managed pane was keeping an old ping online through the 120s managed threshold, clearing the pane correctly falls back to the 60s unmanaged threshold and emits if that changes state. This path is not tested yet.

- [OK] `packages/kernel/src/presence/tracker.ts:90-96` handles `setManagedHookStatus(false)` from `launching` correctly: it changes state to `hook-not-installed` and broadcasts. `setManagedHookStatus(true)` from `launching` stays `launching` and does not broadcast, which matches idempotent state-change broadcasting.

- [OK] `packages/kernel/src/routes/presence.ts:9-17` validates the participant id, calls `tracker.ping(id)`, and returns `204`. `packages/kernel/tests/routes/presence.test.ts:12-14` checks the tracker mutation, not only the status code.

- [LOW] `packages/kernel/src/ws/bus.ts:20-24` types `PresenceMessage.state` as `string`. Runtime behavior is fine, but importing/reusing the `PresenceState` union would let TypeScript reject invalid presence states on the bus.

## Race-condition / logical-bug check

- `tick()` and `ping()` cannot interleave at instruction level in Node's single-threaded event loop, so there is no true concurrent mutation race in this implementation.
- `tick()` does not mutate `lastHookAt`, so a periodic tick cannot clobber the last ping timestamp.
- The main logical timing risk is the double `now()` read in `ping()`, noted above.
- `clearManagedPane()` and `setManagedHookStatus(false)` both re-derive and broadcast only on actual state changes, which is correct.

## Recommendation

PASS-WITH-FIXES. The implementation is scoped, tests are green, and the clean Phase 4 regression count is exactly 233. I would close Phase 4 after adding the missing transition/coverage assertions and clearing the presence ticker on Fastify close. The `now()` consistency and bus typing fixes are small but worth doing while this code is fresh.
