# Final buddy review: tmux agent orchestration v0.4

## Executive summary

**Verdict: NO-GO for declaring v0.4 done.**

The core kernel and renderer suites are green at the expected counts, the build passes, v0.3.0 auto-stream behavior is preserved, and the explicit v0.4 non-goals are respected in shipped code.

However, the release gate is not satisfied: buddy review files only exist for phases 2-11, the manual smoke checklist exists but there is no execution record, and phases 12-16 have no buddy verification artifacts.

There are also two real integration blockers: successful managed spawns are not pushed into renderer chip state, and spawn never performs hook-status detection or kickoff delivery, so the "one-click agent spinup" goal is not actually complete.

Recommendation: address the specific blockers below before shipping v0.4.

## Inputs checked

- Spec: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md`
- Plan: `docs/superpowers/plans/2026-05-23-tmux-agent-orchestration-v04.md`
- Buddy reviews present in `planning/buddy-reviews/`
- Current source tree and release commit `8338ae9 chore: 0.4.0 - tmux agent orchestration`

Note: `git log --oneline v0.3.0..HEAD` could not run because the local `v0.3.0` tag is absent. I used the requested fallback, `git log --oneline HEAD~50..HEAD`.

## Per-phase status

| Phase | Shipped | Buddy verified | Issues |
|---|---:|---:|---|
| 1. Regression tripwire | ✓ | ✗ | Current suites are green, but there is no Phase 1 buddy file and no baseline commit visible in the fallback log. |
| 2. Tmux Manager | ✓ | ✓ | Initial FAIL addressed by `599e5ce`; argv/send-keys tests are present. |
| 3. Runtime Registry | ✓ | ✓ | Buddy was PASS-WITH-FIXES; current code includes top-level validation and control-char hardening. |
| 4. Presence Tracker + ping route | ✓ | ✓ | Buddy was PASS-WITH-FIXES; current code clears the ticker on close and tests include `presence/server-close.test.ts`. |
| 5. autoStream ping | ✓ | ✓ | Current `postPing()` is best-effort with a 2s timeout; focused tests pass. |
| 6. Managed-agent routes | ✓ | ✓ | Buddy findings around rollback, live list, log bound, and Origin gate are addressed in current code. |
| 7. Pane WS subsystem | ✓ | ✓ | Buddy findings around plugin scope and pipe races addressed; race tests present. |
| 8. Command route + shared queue | ✓ | ✓ | Shared input queue integration test present and passing. |
| 9. Startup reconcile | ✓ | ✓ | Initial FAIL fixed by `340b5fd`; tracker now seeds stale and pane-dead states. |
| 10. Env probe + guide | ✓ | ✓ | Registry-driven probe and real user id fix present. |
| 11. Hook install status | ✓ | Partial | Phase 11 buddy ended PASS-WITH-FOLLOW-UP; late fix `34cc9b2` wires `projectRoot` through route and reconcile, but there is no post-fix buddy file. I verified the code path directly. |
| 12. Renderer UI | ✗ | ✗ | Components exist and renderer tests pass, but spawn/terminal results do not update chip state. No Phase 12 buddy file. |
| 13. Settings panels | Partial | ✗ | Panels exist, but Runtime save/update/remove callbacks are no-ops in `SettingsModal`; no Phase 13 buddy file. |
| 14. Optional tmux smoke | ✓ | ✗ | Test exists and ran against real tmux locally; no Phase 14 buddy file. |
| 15. Docs + skill bundles | ✓ | ✗ | README, AGENT.md, and skill bundles updated; no Phase 15 buddy file. |
| 16. Manual smoke pass | ✗ | ✗ | Checklist exists, but no `planning/v0.4-smoke-findings.md` or checked-off execution record. No Phase 16 buddy file. |

## Spec compliance

### Goals

- **One-click agent spinup:** **Fail / partial.** `POST /managed-agents/spawn` starts tmux and writes sibling files, but it returns `hooks_status: "unknown"` unconditionally and does not call hook-install status. It also does not send the kickoff guide when hooks are installed. The renderer opens the hook modal whenever status is not `"installed"`, so the installed-hooks happy path is currently not delivered.
- **Managed chips after spawn:** **Fail.** The shared WS type includes `managed-agent.spawned` and the renderer handles it, but `registerManagedAgentsRoutes()` does not publish that message. The renderer also does not add the `SpawnResponse` to local state. Result: a successful spawn can leave no chip visible until a later reload/list refresh.
- **Terminal spawn UI:** **Fail / same class.** `POST /managed-agents/terminal` returns a terminal session, but no `managed-agent.terminal-spawned` message is published and the renderer does not add the returned terminal locally.
- **Presence = TTL + tmux liveness:** Pass. `postPing()`, `PresenceTracker`, route wiring, and reconcile seeding are present and covered.
- **Pane I/O and shared queue:** Pass. `/ws/pane` uses a single pipe per pane and the shared input queue is used by both `/command` and pane WS input.
- **Reconcile on startup:** Pass in current code.
- **Runtime registry / Settings UI:** Partial. Kernel registry exists and env-probe is registry-driven. The Settings runtime panel is currently a read-only/no-op UX despite showing a Save action.
- **Docs:** Pass for README, AGENT.md, and skill bundles.

### Non-goals

- **No supervisor daemon:** Pass. No shipped implementation files reference `supervisor`; mentions are only in design/planning text or ordinary wording like "supervised."
- **No token telemetry / `context_pct`:** Pass. No shipped package code contains `context_pct`, `tokens_used`, `last_tool`, or `awaiting_approval`.
- **No auto hook installer write side:** Pass. `packages/kernel/src/hooksInstall/*` and `routes/hookInstall.ts` read config and render instructions only. I found no `writeFile`/`appendFile` to `settings.json` or `config.toml`.
- **No env package installer:** Pass. No `/env/install` route exists. The shipped route surface is probe/refresh only.
- **No external slash-command RPC:** Pass. Runtime control is best-effort `tmux send-keys`.

### Runtime coverage

- **Claude:** Pass. `hooksInstall/claude.ts` detects `Stop` and `UserPromptSubmit`; rendered JSON is a parseable full object.
- **Codex:** Pass in current code. `hooksInstall/codex.ts` detects user-level and project-local TOML, supports multiline command arrays, strips comments, and route/reconcile now pass `projectRoot`.
- **Gemini:** Pass for v0.4 scope. `hooksInstall/gemini.ts` is a stub reporting manual-stream mode.

## Critical buddy findings

- **Phase 2, tmux manager argv tests:** Addressed by `599e5ce`; current tmux manager tests assert argv shapes including `send-keys -l --`.
- **Phase 7, WS plugin scope + pipe races:** Addressed by `a39f3d`; current code hoists the websocket plugin and serializes pipe lifecycle.
- **Phase 8, shared input queue:** Addressed by `2764e06`; integration tests prove `/command` and `/ws/pane` share one queue.
- **Phase 10, registry-driven probe + real user id:** Addressed by `4560ca6`; current guide route selects the real user participant id when available.
- **Phase 11, Codex multiline + project-local + Claude parseable JSON:** Addressed in code by `5470d9c` plus late `34cc9b2`. Missing only a post-late-fix buddy artifact.

## Test results

### v0.3.0 hook CLI regression

Command:

```text
pnpm --filter f-mark test tests/cli/hook-autoStream.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
Duration    308ms
```

### Kernel

Command:

```text
pnpm --filter f-mark test
```

Result:

```text
Test Files  69 passed (69)
Tests       401 passed (401)
Duration    5.52s
```

This included `tests/smoke/tmux.smoke.test.ts` running against real tmux on this machine.

### Renderer

Command:

```text
pnpm --filter @f-mark/renderer test
```

Result:

```text
Test Files  46 passed (46)
Tests       463 passed (463)
Duration    8.10s
```

Caveat: jsdom emitted repeated `HTMLCanvasElement.prototype.getContext` stderr warnings from xterm imports. The suite still exited 0.

### Build

Command:

```text
pnpm -r build
```

Result:

```text
packages/shared build: Done
packages/kernel build: Done
packages/renderer build: built in 3.17s
```

Build exited 0. Vite emitted a non-fatal chunk-size warning for the renderer bundle.

## Red flags and known limitations

1. **Ship blocker: spawn state is not integrated into the UI.** The kernel defines managed-agent WS messages, and the renderer handles them, but the routes never publish them. The renderer also ignores the successful spawn/terminal response for local chip insertion. This makes the primary `+` workflow feel broken.

2. **Ship blocker: hook-status/kickoff flow is not implemented in spawn.** The spec says spawn checks hook status and sends kickoff text when hooks are already installed. Current spawn returns `hooks_status: "unknown"` every time and sends no guide/kickoff text. Renderer tests mask this by stubbing `hooks_status: "installed"`.

3. **Release evidence blocker: no Phase 12-16 buddy reviews and no manual smoke execution record.** The plan explicitly requires per-phase buddy verification and `planning/v0.4-smoke-findings.md` before declaring v0.4 done.

4. **Settings Runtime panel is a no-op.** `SettingsModal` wires runtime add/update/remove to `noopRuntimeMutation()`, while the panel still shows Save/Edit/Remove controls. This is at least a UX caveat, and possibly a Phase 13 miss depending on how strictly "Manage Runtimes" is interpreted.

5. **Test coverage gap around the primary workflow.** Current renderer tests assert that clicking `+ -> Claude` POSTs to spawn, but do not assert that a chip appears, that hook modal behavior matches actual kernel status, or that terminal spawn appears. Kernel tests assert spawn side effects but not hook status, kickoff, or WS publish.

6. **Manual smoke is still a checklist, not evidence.** The checklist file exists, but every item is unchecked and there is no findings file. Given this feature depends on real tmux and real runtime CLIs, that gap matters.

7. **Minor security hardening:** `tmux pipe-pane` ultimately runs a shell command containing the FIFO path (`cat >> ${fifo}`). The FIFO is generated under `os.tmpdir()`, so practical risk is low, but quoting the path would reduce shell interpretation exposure.

## Recommendation

**Do not ship v0.4 as done yet.**

Minimum fixes before ship:

1. Publish `managed-agent.spawned`, `managed-agent.terminal-spawned`, and `managed-agent.killed` messages from the kernel routes, or update renderer state directly from successful route responses. Add tests proving the chip/terminal appears immediately after `+`.
2. Implement the spawn hook-status contract: call `checkHookInstallStatus()` with project root and real user participant id, return `installed` or `missing`, set presence hook status, and send the kickoff guide through the shared input queue when hooks are installed. Add kernel and renderer tests using the real response shape.
3. Execute the manual smoke checklist for Claude, Codex, Gemini, terminal, fan-out, reconcile, and security; record results in `planning/v0.4-smoke-findings.md`.
4. Add or recover buddy reviews for phases 1 and 12-16, or explicitly document why those phase gates were waived.
5. Either wire runtime Settings CRUD to real kernel routes or make the panel honestly read-only by disabling Save/Edit/Remove.

After those are addressed, rerun:

```text
pnpm --filter f-mark test
pnpm --filter @f-mark/renderer test
pnpm -r build
```

The foundation is close, but the last-mile workflow is not ready to declare complete.

## Post-Blocker Verification (2026-05-23)

**Status: GO-WITH-CAVEATS.**

The four concrete code/UX ship blockers called out in the NO-GO review are addressed. I do not see a remaining code ship blocker in the managed-agent spawn, hook-status/kickoff, renderer chip state, or RuntimesPanel read-only paths.

### Blocker 1: routes publish WS messages

Addressed.

- `packages/kernel/src/routes/managedAgents.ts:21` imports `Bus`; `packages/kernel/src/routes/managedAgents.ts:34-53` adds `bus: Bus` to `ManagedAgentsDeps`.
- `packages/kernel/src/routes/managedAgents.ts:124` destructures `bus` from deps.
- `packages/kernel/src/routes/managedAgents.ts:297-303` publishes `managed-agent.spawned` after successful spawn.
- `packages/kernel/src/routes/managedAgents.ts:349` publishes `managed-agent.killed` after DELETE cleanup.
- `packages/kernel/src/routes/managedAgents.ts:362-366` publishes `managed-agent.terminal-spawned` after terminal spawn.
- `packages/kernel/src/server.ts:202-210` passes a live bus wrapper into `registerManagedAgentsRoutes()`.
- Tests now prove the publishes: `packages/kernel/tests/routes/managedAgents.test.ts:16-23` defines `fakeBus()`, and `packages/kernel/tests/routes/managedAgents.test.ts:484-570` asserts spawned, killed, and terminal-spawned messages.

### Blocker 2: spawn returns real hooks_status + kickoff

Addressed.

- `packages/kernel/src/routes/managedAgents.ts:233-261` performs best-effort hook detection, finds the first registered user participant id at `packages/kernel/src/routes/managedAgents.ts:242-250`, and calls `checkHookInstallStatus()` with `runtimeId`, managed `participantId`, `userParticipantId`, and `projectRoot: paths.root()` at `packages/kernel/src/routes/managedAgents.ts:254-259`.
- `packages/kernel/src/routes/managedAgents.ts:260` calls `tracker.setManagedHookStatus(participantId, detect.installed)`.
- `packages/kernel/src/routes/managedAgents.ts:261` maps detection to `hooksStatus = "installed"` or `"missing"`; the initialized `"unknown"` value remains only if detection throws.
- `packages/kernel/src/routes/managedAgents.ts:263-292` sends the installed-hooks kickoff through the shared `inputQueue.enqueue(...)`, `tmux.sendLiteralText(...)`, and `tmux.sendKey(..., "C-m")` path.
- `packages/kernel/src/routes/managedAgents.ts:305-310` returns the computed `hooks_status`.
- Tests cover installed and missing outcomes: `packages/kernel/tests/routes/managedAgents.test.ts:572-674`. The installed case expects the two tmux `send-keys` calls and verifies `hooks_status: "installed"`; the missing case verifies `hooks_status: "missing"` and no kickoff sends.

### Blocker 3: renderer adds spawn response to local state

Addressed.

- `packages/renderer/src/shell/TopBar.tsx:64-65` reads `addManagedAgent` and `addManagedTerminal` from the store.
- `packages/renderer/src/shell/TopBar.tsx:141-156` adds the successful `SpawnResponse` to local managed-agent state immediately.
- `packages/renderer/src/shell/TopBar.tsx:177-192` adds the terminal spawn response to local managed-terminal state immediately.
- `packages/renderer/tests/shell/topBar.test.tsx:280-302` asserts a new `AgentChip` appears after `+ -> Claude` without waiting for WS.
- `packages/renderer/tests/shell/topBar.test.tsx:329-347` asserts a new `TerminalChip` appears after `+ -> Terminal`.

### UX caveat: RuntimesPanel read-only mode

Addressed for v0.4.

- `packages/renderer/src/modals/settings/RuntimesPanel.tsx:88-95` derives read-only mode from `readOnlyNote`.
- `packages/renderer/src/modals/settings/RuntimesPanel.tsx:194-205` renders the read-only note.
- `packages/renderer/src/modals/settings/RuntimesPanel.tsx:345-363` disables Edit and Remove when read-only.
- `packages/renderer/src/modals/settings/RuntimesPanel.tsx:404-411` hides the Add runtime button when read-only.
- `packages/renderer/src/modals/settings/SettingsModal.tsx:202-209` passes `READ_ONLY_NOTE` into `RuntimesPanel`.
- `packages/renderer/tests/modals/settings/runtimesPanel.test.tsx:263-317` verifies the note renders, Edit/Remove are disabled, and Add is hidden.

### v0.3.0 regression

Preserved.

- The focused CLI regression test still covers default assistant hooks, `--kind user`, and missing participant usage: `packages/kernel/tests/cli/hook-autoStream.test.ts:3-30`.
- Focused run: `pnpm --filter f-mark test tests/cli/hook-autoStream.test.ts` passed 1 file / 3 tests.
- Full kernel suite also passed with the hook and auto-stream integration coverage included.

### Test results

- Focused route blocker test: `pnpm --filter f-mark test tests/routes/managedAgents.test.ts` passed 1 file / 21 tests.
- Focused renderer blocker tests: `pnpm --filter @f-mark/renderer test tests/shell/topBar.test.tsx tests/modals/settings/runtimesPanel.test.tsx` passed 2 files / 26 tests. jsdom emitted the known `HTMLCanvasElement.prototype.getContext` warning from xterm imports; exit code was 0.
- Full kernel suite: `pnpm --filter f-mark test` passed 69 files / 406 tests.
- Full renderer suite: `pnpm --filter @f-mark/renderer test` passed 46 files / 468 tests. Same non-fatal jsdom/xterm canvas warnings appeared.
- Build: `pnpm -r build` exited 0. Vite emitted the existing non-fatal chunk-size warning for the renderer bundle.

### Remaining caveats

Acceptable for v0.4 ship:

- Runtime CRUD HTTP routes remain deferred; the Settings runtime surface is now honestly read-only instead of presenting no-op mutations.
- Hook installer write-side remains deferred; v0.4 provides detection and manual instructions only.
- `planning/v0.4-smoke-findings.md:84-93` records the original smoke findings and notes the follow-up commits addressed them. `planning/v0.4-smoke-findings.md:103-105` still treats real Claude/Codex/Gemini CLI end-to-end smoke as a release-time/manual activity.
- Separate Phase 12-16 buddy-review files are still not present in `planning/buddy-reviews/`. This appended post-blocker verification covers the actual blocker fixes, but if the release process requires one file per phase, that is a process artifact caveat rather than a code blocker.
- Renderer tests still print the jsdom/xterm canvas warning, and the production build still prints the Vite chunk-size warning. Both are non-fatal and pre-existing in this review trail.

Not acceptable / blocking:

- None found in the verified blocker paths.

### Final recommendation

Ship v0.4 with the caveats above documented. The four original code/UX blockers are closed, the v0.3.0 regression test is preserved, and the requested kernel, renderer, and build checks are green.
