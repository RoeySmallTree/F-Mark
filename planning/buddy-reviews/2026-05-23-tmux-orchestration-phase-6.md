# Phase 6 Buddy Verification: Managed-Agent Routes, Logs, and Security Gate

## Executive Summary

PASS-WITH-FIXES

The four Phase 6 commits implement the requested managed-agent helper files, per-agent log file, spawn/kill/list/terminal/log routes, confirm-token flow, CLI opt-in flag, route gate, and banner warning. I read the plan/spec, inspected the diffs and current source, and ran both the targeted and full kernel test suites. Both are green.

I would not call this a clean PASS yet. The required surface is mostly present, but I found contract gaps worth fixing before v0.4 hardening:

- [MEDIUM] `GET /managed-agents` is not truly live for managed agents. It calls `tmux.listFmarkSessions()`, but only uses that result for terminals; agents are returned from `.f-mark/agents/*/tmux-session` even if the tmux session is gone.
- [MEDIUM] log rotation does not rotate at exactly 1 MiB. `appendAgentLog()` rotates only when the existing file is already `> MAX_LOG_BYTES`, so an exactly-1MiB file plus one append can exceed the stated bound. The test uses `MAX_LOG_BYTES + 1`, so it does not prove "rotation at 1MB".
- [MEDIUM] spawn has no rollback after `tmux.spawnAgent()` succeeds. If a later sibling-file write or log append fails, the route can return 500 while leaving an orphaned tmux session and/or registered participant.
- [MEDIUM] the broader Security spec's cookie-auth `Origin` / `Host` validation for mutating routes is not implemented. The `--allow-process-api-no-auth` semantics are correct, but this defense-in-depth requirement remains open.

## Test Results

Targeted Phase 6 command:

```text
$ pnpm --filter f-mark test tests/agents/ tests/routes/managedAgents.test.ts tests/cli/ tests/security.test.ts

Test Files  7 passed (7)
Tests       44 passed (44)
```

Coverage confirmed:

- `packages/kernel/tests/agents/managed.test.ts`: 7 tests. Covers round-trip, missing reads, `clearManagedSiblings`, list filtering, missing agents dir, and invalid IDs.
- `packages/kernel/tests/agents/logs.test.ts`: 5 tests. Covers append, missing log, default/custom tail limit, rotation, and invalid IDs. Caveat: the rotation test starts at `MAX_LOG_BYTES + 1`, not exactly `MAX_LOG_BYTES`.
- `packages/kernel/tests/routes/managedAgents.test.ts`: 14 tests. Covers spawn happy path, `session_id` active-session write, unknown runtime, invalid suggested ID, existing participant reuse, confirm-token shape, invalid confirm ID, DELETE without confirm, wrong confirm, valid confirm plus one-time reuse failure, terminal indexing, list buckets, logs, and invalid log ID.
- `packages/kernel/tests/cli/allowProcessApi.test.ts`: 3 tests for the new flag and default false.
- `packages/kernel/tests/security.test.ts`: 7 tests total, including `--no-auth` without the flag returning 404 for `/managed-agents/spawn`, opt-in enabling the route, and token-mode bearer gating.

Full kernel suite:

```text
$ pnpm --filter f-mark test

Test Files  55 passed (55)
Tests       302 passed (302)
```

The pre-Phase-6 baseline reported in Phase 5 was 256 tests. Current full-suite total is 302 and green, so I see no regression to the v0.3.0 baseline.

## Spec Compliance

- [OK] `packages/kernel/src/server.ts:146-147` computes `processApiEnabled` as token present OR `allowProcessApiNoAuth === true`, which matches the requested `(token !== null) || allowProcessApiNoAuth` semantics.
- [OK] `packages/kernel/src/server.ts:153-158` registers the full managed-agent route module only when the process API is enabled.
- [OK] `packages/kernel/src/server.ts:160-171` returns 404 for disabled `/managed-agents` and `/managed-agents/*` with the documented error message.
- [OK] `packages/kernel/src/banner.ts:131-157` emits the warning only when auth is disabled (`token === null`) and `--allow-process-api-no-auth` is set.
- [OK] `packages/kernel/src/routes/managedAgents.ts:73-138` implements the spawn flow: validate runtime and participant ID, register participant, spawn tmux, write `tmux-session`, write `runtime`, optionally write `active-session`, set tracker managed pane, append log, and return `{ participant_id, tmux_session, runtime_id, hooks_status }`.
- [OK] `packages/kernel/src/routes/managedAgents.ts:55-70` implements one-time confirm tokens with 10s TTL, and `DELETE` consumes the token before killing/clearing.
- [OK] `packages/kernel/src/agents/managed.ts:74-87` clears only `tmux-session` and `runtime`, keeping both `active-session` and `log.jsonl`. This follows the buddy-flagged requirement, even though the spec prose still says DELETE removes `log.jsonl`.
- [OK] `packages/kernel/src/agents/logs.ts:4` defines `MAX_LOG_BYTES = 1_048_576`; `packages/kernel/src/agents/logs.ts:41-42` rotates to a single `.1` backup.
- [PARTIAL] Managed route endpoints and response shapes mostly match Phase 6: spawn, DELETE, terminal, list, and logs are present. `POST /managed-agents/terminal` returns an extra `index`, which is harmless.
- [PARTIAL] Security flag semantics match the spec. The broader cookie-origin check in the same Security section is absent: `registerAuthHook()` accepts cookie auth globally, and the managed-agent mutating routes do not validate `Origin` / `Host` when auth came from a cookie.
- [PARTIAL] Audit logging is only partly present. Spawn and goodbye append per-agent logs; `terminal-spawn` is not written to a kernel audit log as described in Security item 6.
- [MISMATCH] `GET /managed-agents` does not join agent directory state against live tmux sessions. It lists managed agents purely from sibling files, so stale/dead sessions can still appear.

## Per-File Critique

### `packages/kernel/src/server.ts`

- [OK] Route registration is correctly gated behind token-or-flag.
- [OK] Disabled managed-agent paths return 404, not a reachable unauthenticated spawn route.
- [LOW] The disabled handlers are registered as `/managed-agents` and `/managed-agents/*`, not a literal `/managed-agents*`; this covers the intended route family but not odd paths like `/managed-agentsfoo`, which is fine.

### `packages/kernel/src/banner.ts`

- [OK] The warning is correctly tied to the dangerous combo: `token === null && allowProcessApiNoAuth === true`.
- [OK] Tests cover local, remote, and container modes, plus no-warning cases.

### `packages/kernel/src/routes/managedAgents.ts`

- [OK] Spawn ordering matches the requested flow.
- [OK] `runtime_id` existence and `suggested_participant_id` format are validated before tmux spawn.
- [OK] Confirm token is one-time and has a 10s TTL in code.
- [MEDIUM] No rollback after successful tmux spawn. A failure in `writeTmuxSession`, `writeRuntime`, `writeActiveSession`, or `appendAgentLog` leaves external state behind.
- [MEDIUM] List route ignores live tmux state for agents. `sessions` is fetched, but only terminals use it.
- [LOW] Confirm-token expiry by wall clock is not tested; the tests prove missing, wrong, valid, and consumed-token stale behavior.
- [LOW] DELETE can be confirmed for any syntactically valid ID. For a nonexistent/unmanaged ID it returns `{ ok: true }` and `appendAgentLog()` can create a new `agents/<id>/log.jsonl` directory.
- [LOW] `logs?since=` is parsed with `Number()` and not range/finite validated. `since=abc`, `0`, or negative values can produce surprising tail behavior.
- [LOW] Concurrency is not serialized. Two simultaneous spawns for the same participant ID, or two terminal spawns that both compute the same next index, can race and rely on tmux failure rather than a clean 409-style response.

### `packages/kernel/src/agents/managed.ts`

- [OK] Helpers round-trip `tmux-session` and `runtime`.
- [OK] `clearManagedSiblings()` keeps `active-session` and `log.jsonl`, satisfying the buddy-flagged requirement.
- [OK] `listManagedAgentIds()` filters to directories with `tmux-session`.
- [LOW] The helper ID regex is looser than `participants.ts` (`ag/us/sys/grp` with 2-12 chars after the prefix). Current route callers validate with `isValidParticipantId`, so this is mostly a public-helper consistency issue.

### `packages/kernel/src/agents/logs.ts`

- [OK] Per-agent `log.jsonl` appends JSON lines with automatic `ts`.
- [OK] Rotation uses a single `.1` backup, not multi-file rotation.
- [MEDIUM] Rotation checks `size > MAX_LOG_BYTES` before appending. This misses exactly-1MiB logs and does not account for the pending line size, so the "bounded at 1MB" contract is not exact.

### Tests

- [OK] The requested test counts are real: managed helpers 7, logs 5, managed routes 14.
- [OK] CLI flag and security gate tests are present and meaningful.
- [OK] The fake tmux runner records calls and verifies all queued expectations are consumed.
- [OK] Exact tmux spawn argv is asserted in `packages/kernel/tests/tmux/manager.test.ts`, including `--`, env args, `-c projectRoot`, and user options. The route tests themselves only assert tmux command prefixes plus route side effects.
- [LOW] Add one test for log rotation at exactly `MAX_LOG_BYTES`, and ideally one for "append would cross the limit".
- [LOW] Add tests for live-list filtering of dead/stale agent tmux sessions.
- [LOW] Add tests for cookie-authenticated mutating routes with bad/missing `Origin` once that security check is implemented.

## Recommendation

Ship only with fixes or tracked follow-ups for the medium findings. The minimum fix set I would want before calling Phase 6 fully complete:

1. Make log rotation enforce the 1MiB bound (`>=`, or check `currentSize + lineBytes > MAX_LOG_BYTES`) and update the rotation test to prove the threshold.
2. Make `GET /managed-agents` join managed sibling files with live verified tmux sessions, or explicitly mark stale agents in the response if the UI needs to show them.
3. Add rollback/cleanup for partial spawn failure after tmux session creation.
4. Implement the Security spec's cookie-auth `Origin` / `Host` validation for mutating process routes, or split it into an explicit later security phase if intentionally deferred.

With those addressed, the rest of Phase 6 looks structurally sound: the route gate is correct, the banner warning is correct, confirm tokens are one-time with TTL, DELETE keeps `active-session` and `log.jsonl`, and the full suite passes with no observed baseline regression.
