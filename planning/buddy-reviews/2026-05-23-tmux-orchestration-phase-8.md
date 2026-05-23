# Phase 8 Buddy Verification - Managed-Agent Command Route

## Executive Summary

**Verdict: FAIL pending one spec-critical integration fix.**

The Phase 8 `/managed-agents/:id/command` route is implemented and its focused tests pass. For managed panes, it supports `interrupt`, `slash`, and `message`; validates bad slash names and message control characters; returns the required unmanaged-pane `409`; sends slash/message text as literal text followed by a separate Enter; propagates tmux send failures back to the caller; and appends a command log entry on successful sends.

However, the critical spec property is broader than just command requests: the "Inbound Pane Input" section requires one per-pane queue for both kernel-injected commands and overlay-typed WebSocket input so bytes cannot interleave. The command route creates and uses its own queue inside `registerManagedAgentsRoutes`, but `/ws/pane` still calls `tmux.sendLiteralText` / `tmux.sendKey` directly. In the assembled server, a user typing through the terminal overlay can still interleave with a concurrent `/command` send.

## Test Results

- `pnpm --filter f-mark test tests/routes/managedAgentsCommand.test.ts` - **PASS**, 1 file / 7 tests.
  - Covers interrupt -> `C-c`.
  - Covers slash compact -> literal `/compact` then `C-m`.
  - Covers message -> literal text then `C-m`.
  - Covers unmanaged participant -> `409 { reason: "unmanaged_pane", offer: "open_overlay" }`.
  - Covers bad slash command -> `400`.
  - Covers message newline/control char -> `400`.
  - Covers unknown type -> `400`.
- `pnpm --filter f-mark test` - **PASS**, 64 files / 357 tests.
  - No v0.3.0 regression observed in the current kernel package suite.

## Spec Coverage

- **Endpoint shape:** satisfied.
  - Spec lists `POST /managed-agents/:participant_id/command` with `slash`, `interrupt`, and `message` bodies at `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:202-207`.
  - Implementation registers `POST /managed-agents/:id/command` at `packages/kernel/src/routes/managedAgents.ts:315-373`.
- **Three command modes:** satisfied in the route.
  - `interrupt` at `managedAgents.ts:335-336`.
  - `slash` at `managedAgents.ts:337-347`.
  - `message` at `managedAgents.ts:348-358`.
- **Unmanaged panes:** satisfied.
  - Route returns `409` with `reason: "unmanaged_pane"` and `offer: "open_overlay"` at `managedAgents.ts:324-328`.
  - Test coverage is at `packages/kernel/tests/routes/managedAgentsCommand.test.ts:129-140`.
- **Slash validation:** satisfied.
  - Route requires a string at `managedAgents.ts:337-341`.
  - Regex validation is called at `managedAgents.ts:342`.
  - Regex is `^[a-zA-Z][a-zA-Z0-9_-]{0,31}$` at `packages/kernel/src/runtimes/validation.ts:2`.
  - Bad-name test is at `managedAgentsCommand.test.ts:145-157`.
- **Message control-character validation:** satisfied.
  - Route requires a string at `managedAgents.ts:348-352`.
  - Validation is called before enqueue at `managedAgents.ts:353`.
  - `validateMessageText` rejects characters below `0x20` except tab, plus `0x7f`, at `validation.ts:20-24`.
  - Newline rejection is covered at `managedAgentsCommand.test.ts:162-170`.
- **Best-effort framing:** satisfied in the route.
  - `interrupt` sends `C-c` without presence/idle gating at `managedAgents.ts:335-336`.
  - `slash` sends literal text via `tmux.sendLiteralText(session, "/" + cmd)` and then a separate `tmux.sendKey(session, "C-m")` at `managedAgents.ts:344-347`.
  - `message` sends literal text and then a separate `C-m` at `managedAgents.ts:355-358`.
  - The concrete tmux manager uses `send-keys -l -- <text>` for literal text at `packages/kernel/src/tmux/manager.ts:148-151` and `send-keys -- <key>` for Enter / control keys at `manager.ts:153-156`.
- **Successful command logging:** satisfied but not directly tested in the Phase 8 route tests.
  - `appendAgentLog` is called after the queued send completes at `managedAgents.ts:363-366`.

## Per-File Critique

### `packages/kernel/src/routes/managedAgents.ts`

- **OK - command requests use one shared queue for this route registration.**  
  `managedAgents.ts:111-114` creates one `inputQueue` closure for the Fastify route registration, not one per request. Every command handler invocation reaches that same queue object.

- **OK - command queue key is the tmux session name.**  
  `managedAgents.ts:324` reads the managed agent's tmux session, and `managedAgents.ts:336`, `managedAgents.ts:344`, and `managedAgents.ts:355` enqueue with that `session` key. If 100 `/command` requests hit the same pane simultaneously, they all use the same queue tail.

- **OK - interrupt is not gated.**  
  `managedAgents.ts:335-336` directly enqueues `tmux.sendKey(session, "C-c")`; there is no presence/idle gate in the kernel path, matching the spec's "Always allowed" requirement.

- **OK - slash/message framing avoids composite sends.**  
  `managedAgents.ts:344-347` and `managedAgents.ts:355-358` send literal text first and Enter as a second tmux send. This matches the spec's best-effort TUI framing.

- **OK - tmux send failures propagate to the HTTP response and do not poison the queue.**  
  The route awaits `inputQueue.enqueue(...)`; if `tmux.sendLiteralText` or `tmux.sendKey` rejects, control reaches the catch block at `managedAgents.ts:368-371` and the caller receives `400 { error: <message> }`. The queue implementation stores `next.catch(() => undefined)` as the future tail, so later sends still run after a failed send.

- **OK - TypeScript narrowing is safe.**  
  There is no `body.command!` or `body.text!` non-null assertion in the current implementation. The route validates `typeof body.command === "string"` / `typeof body.text === "string"` and copies to `const cmd` / `const text` before the async queue closure at `managedAgents.ts:337-355`, so the values are stable across awaits.

- **MEDIUM - command log behavior is untested.**  
  `managedAgents.ts:363-366` logs successful commands, but `managedAgentsCommand.test.ts` never reads `log.jsonl`. A small assertion would prevent future refactors from dropping the Phase 8 "recording the action" requirement.

### `packages/kernel/src/tmux/inputQueue.ts`

- **OK - FIFO serialization per pane key.**  
  `inputQueue.ts:7-13` stores a promise tail per `paneKey`. Each `enqueue` chains the new task after the prior tail with `prev.then(() => task(), () => task())`, so same-key tasks run sequentially and in call order even if a previous task rejects.

- **OK - rejection propagation plus recovery.**  
  `inputQueue.ts:11-13` returns the original `next` promise to the caller, so rejection propagates, while storing a caught tail so the next queued task is not permanently blocked.

- **OK - existing unit tests cover core queue behavior.**  
  `packages/kernel/tests/tmux/inputQueue.test.ts:6-15` verifies same-pane ordering, `inputQueue.test.ts:17-24` verifies different panes can run concurrently, and `inputQueue.test.ts:26-29` verifies rejection propagation.

### `packages/kernel/src/ws/pane.ts`

- **CRITICAL - overlay input bypasses the command route's queue, so the spec-critical no-interleaving property is not met.**  
  The spec says the per-pane input queue serializes all keystrokes touching a pane, including kernel-injected `/command` input and overlay-typed WS input, at `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:237-239`. But `pane.ts:86-90` sends overlay `pane.input` and `pane.key` directly through `tmux.sendLiteralText` / `tmux.sendKey`. Meanwhile `managedAgents.ts:111-114` owns a private queue inside the managed-agent route module. These are not the same queue, so `/command` and `/ws/pane` can race at the tmux byte level.

### `packages/kernel/src/server.ts`

- **CRITICAL - the assembled server has no shared input queue between managed commands and pane WS.**  
  `server.ts:163-168` registers managed-agent routes, whose queue is internally created in `managedAgents.ts:114`. `server.ts:183` then registers the pane websocket with only `{ tmux, hub }`. There is no shared `InputQueue` dependency passed to both subsystems.

### `packages/kernel/tests/routes/managedAgentsCommand.test.ts`

- **OK - required seven Phase 8 route cases are covered.**  
  Interrupt: `managedAgentsCommand.test.ts:69-85`; slash compact: `managedAgentsCommand.test.ts:87-107`; message: `managedAgentsCommand.test.ts:109-127`; unmanaged pane: `managedAgentsCommand.test.ts:129-143`; bad slash name: `managedAgentsCommand.test.ts:145-160`; message control char: `managedAgentsCommand.test.ts:162-173`; unknown type: `managedAgentsCommand.test.ts:175-185`.

- **MEDIUM - no route-level concurrency test.**  
  The queue itself is tested, and the route does call it, but no test fires many concurrent `/command` requests against the same managed pane to prove the route wiring preserves request order. This is less severe than the WS bypass, but adding one focused test would protect the exact Phase 8 integration point.

- **MEDIUM - no send-failure test.**  
  There is no route test that makes `tmux.sendLiteralText` reject and asserts the route returns an error and the next queued command still runs. The code path looks correct via `managedAgents.ts:368-371` plus `inputQueue.ts:11-13`, but it is worth pinning down.

- **MEDIUM - no command log assertion.**  
  The tests do not verify `appendAgentLog` output after a successful interrupt/slash/message command.

## Recommendation

Do not accept Phase 8 as fully spec-compliant yet.

Keep the command route implementation shape, but lift the input queue to a shared server-level dependency and pass it into both `registerManagedAgentsRoutes` and `registerPaneWebSocket`. Then change `pane.input` and `pane.key` handling to enqueue on the same pane key before calling tmux. Add an integration test with concurrent `/command` and `/ws/pane` input against the same session, plus smaller route tests for command logging and tmux send rejection recovery.

After that fix, the Phase 8 command route itself should be acceptable.

## Phase 8 Fix Re-verification (2026-05-23)

- **Status:** PASS-WITH-FIXES.
- **Findings addressed?** Yes for the blocking Phase 8 finding. Commit `2764e06` lifts `createInputQueue()` into `packages/kernel/src/server.ts` and passes the same `paneInputQueue` to both `registerManagedAgentsRoutes(...)` and `registerPaneWebSocket(...)`. `packages/kernel/src/routes/managedAgents.ts` now accepts `deps.inputQueue` and no longer creates a local command-route queue. `packages/kernel/src/ws/pane.ts` now wraps `pane.input`, `pane.key`, and `pane.resize` through `inputQueue.enqueue(paneId, ...)`, so overlay input and `/managed-agents/:id/command` share the same per-pane queue.
- **Integration-test proof:** `packages/kernel/tests/integration/inputQueueShared.test.ts` proves the shared-queue invariant in two ways: a deterministic wiring test instruments one `InputQueue` instance and verifies both route modules enqueue against it, and a createServer-level concurrency smoke test overlaps `/command` and `/ws/pane` traffic and asserts no literal+Enter pair is interleaved in the recorded tmux `send-keys` stream.
- **Test result:** `pnpm --filter f-mark test` PASS - 68 test files passed, 391 tests passed.
- **Recommendation:** Accept the Phase 8 fix. The original buddy-review FAIL condition is resolved; the remaining earlier medium notes around extra command-log/send-failure assertions are non-blocking hardening opportunities, not blockers for this fix.
