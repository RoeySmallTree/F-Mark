# Phase 10 Buddy Verification - Env Probe + Guide Update

## Executive Summary

**Verdict: FAIL**

The two Phase 10 commits compile and the requested tests pass:

- `a634f59 feat(kernel/routes): GET /env-probe with PATH-based detection + 30s cache`
- `aeeed09 feat(kernel/routes): /guide accepts agent_id + runtime_id; fix stale hooks copy`

The basic implementation is present: `/env-probe` returns the expected probe data with a 30s in-memory cache, `/env-probe` is registered outside the process-spawning API gate, `/guide` accepts `session_id`, the backward-compatible `sessionId` alias, `agent_id`, and `runtime_id`, and the stale "NOT YET SHIPPED" text is gone.

However, Phase 10 is not spec-complete:

- **High:** `/env-probe` does not detect each registered runtime from `.f-mark/runtimes.json`; the assembled server hard-codes `claude`, `codex`, and `gemini`, and `realProbe()` checks runtime ids instead of each runtime entry's configured `executable`.
- **High:** `/guide` renders `UserPromptSubmit` hook snippets with a hard-coded `us-yourname` placeholder instead of the actual user participant id required by the spec.
- **Medium:** there is no cache-bust or re-probe path, and no publisher for the spec's `env-probe.updated` event. The only behavior is passive 30s TTL expiry.
- **Medium:** tests pass but do not cover the real PATH probe, registered/custom runtimes, tmux version failure fallback, process-gate availability, cache expiry/invalidation, actual user participant id rendering, or the no-runtime overview case.

## Test Results

- `pnpm --filter f-mark test tests/routes/envProbe.test.ts tests/routes/guide.test.ts` - **PASS**, 2 files / 13 tests.
  - `tests/routes/envProbe.test.ts` - **PASS**, 2 tests:
    - basic response shape
    - 30s cache
  - `tests/routes/guide.test.ts` - **PASS**, 11 tests:
    - dynamic base URL
    - removed `NOT YET SHIPPED`
    - backward-compatible `sessionId`
    - snake_case `session_id`
    - `agent_id` substitution
    - `runtime_id=claude`
    - `runtime_id=codex`
    - `runtime_id=gemini`
    - session-specific section
    - unknown session 404
    - no-session fallback
- Local real probe smoke check via `realProbe(["claude", "codex", "gemini"])` - **PASS** on this machine:
  - `tmux: true`
  - `tmuxVersion: "3.4"`
  - `runtimes: { claude: true, codex: true, gemini: true }`
  - `installer: "apt"`
  - `os: "linux"`
- `pnpm --filter f-mark test` - **PASS**, 64 files / 357 tests.

## Spec Coverage

- **Env Probe shape:** mostly implemented, with one extra field.
  - Spec says `GET /env-probe` returns `{ tmux: bool, tmuxVersion: string | null, runtimes: Record<runtime_id, bool>, installer: string | null }` at `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:220`.
  - Implementation returns those fields plus `os` at `packages/kernel/src/routes/envProbe.ts:4-10` and `packages/kernel/src/routes/envProbe.ts:46`. The plan scaffold also included `os`, so this is low-risk spec drift, but it is drift.
- **PATH-based tmux/runtime/installer detection:** partially implemented.
  - `realProbe()` uses `which` for tmux, each supplied runtime name, and installers at `packages/kernel/src/routes/envProbe.ts:19-45`.
  - It parses `tmux -V` stdout with `/^tmux\s+(\d+\.\d+)/` at `packages/kernel/src/routes/envProbe.ts:23-26`.
  - It detects installers in the requested order at `packages/kernel/src/routes/envProbe.ts:30-45`.
  - It does not read the runtime registry or configured executable paths.
- **30s cache:** implemented as route-local in-memory state.
  - `cached` and `TTL = 30_000` live inside `registerEnvProbeRoute()` at `packages/kernel/src/routes/envProbe.ts:54-60`.
  - This does not leak across kernel restarts, which is correct.
- **Process API gate:** implemented correctly.
  - `/env-probe` is registered before `processApiEnabled` is computed and outside the guarded managed-agent routes at `packages/kernel/src/server.ts:147-158`.
- **Guide endpoint query support:** implemented.
  - Query type includes `session_id`, `sessionId`, `agent_id`, and `runtime_id` at `packages/kernel/src/routes/guide.ts:6-12`.
  - Handler resolves `session_id ?? sessionId` and passes all fields into `buildGuide()` at `packages/kernel/src/routes/guide.ts:130-146`.
- **Guide runtime snippets:** partially implemented.
  - Claude renders `~/.claude/settings.json` JSON-ish hook content at `packages/kernel/src/routes/guide.ts:20-36`.
  - Codex renders `~/.codex/config.toml` TOML hook content at `packages/kernel/src/routes/guide.ts:38-59`.
  - Gemini renders a manual-stream explanation at `packages/kernel/src/routes/guide.ts:61-66`.
  - No runtime renders an overview pointing to `?runtime_id=claude|codex|gemini` at `packages/kernel/src/routes/guide.ts:68-77`.
- **Guide stale copy removal:** implemented.
  - No `NOT YET SHIPPED` text remains in `packages/kernel/src/routes/guide.ts`, and the test asserts this at `packages/kernel/tests/routes/guide.test.ts:28-36`.

## Per-File Critique

### `packages/kernel/src/routes/envProbe.ts`

- **OK - basic route and cache behavior are present.**  
  `envProbe.ts:50-61` registers `GET /env-probe`, stores a route-local `cached` result, and refreshes it after `TTL = 30_000`.

- **OK - non-zero `tmux -V` does not crash.**  
  `envProbe.ts:23-26` awaits `runner.run(["tmux", "-V"])` and only parses stdout. The real command runner returns structured `{ stdout, stderr, exitCode }` results rather than throwing on command failure at `packages/kernel/src/tmux/commandRunner.ts:16-37`. In the paranoid case where `which tmux` succeeds but `tmux -V` exits non-zero, this should return `tmuxVersion: null` if stdout is empty, not crash.

- **HIGH - registered runtime detection is not implemented.**  
  `envProbe.ts:16-29` accepts a list of strings and runs `which` on each string. The runtime registry is data-driven: `.f-mark/runtimes.json` stores `runtime_id -> { displayName, executable, args, ... }` (`packages/kernel/src/runtimes/registry.ts:9-12`), defaults are initialized by `initProject()` (`packages/kernel/src/project.ts:53-64`), and users can add runtimes through `upsertRuntime()` (`packages/kernel/src/runtimes/registry.ts:60-68`). A custom registered runtime such as `mylocal` with executable `/usr/local/bin/my` will never appear in `/env-probe`, and a user-edited default runtime with a non-id executable will be probed incorrectly.

- **MEDIUM - no cache invalidation or force refresh.**  
  `envProbe.ts:56-60` exposes only a cached GET. There is no `?refresh=1`, no POST refresh route, no exported invalidator, and no connection to the websocket bus. The spec lists `{ type: "env-probe.updated", result }` as a manual re-probe broadcast at `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:263`, but no Phase 10 code can publish it.

### `packages/kernel/src/server.ts`

- **OK - `/env-probe` is outside the process API gate.**  
  `server.ts:147-151` registers the route before `processApiEnabled` is computed at `server.ts:156-158`. This satisfies the requirement that the banner can render even when process-spawning routes are disabled.

- **HIGH - server wires a hard-coded runtime list instead of the registered catalog.**  
  `server.ts:150` calls `realProbe(["claude", "codex", "gemini"])`. That matches the default runtime ids in `packages/kernel/src/runtimes/defaults.ts:3-7`, but not the registered runtime catalog described by the spec and implemented in `packages/kernel/src/runtimes/registry.ts`.

### `packages/kernel/src/routes/guide.ts`

- **OK - query parameters and stale hook copy are handled.**  
  `guide.ts:6-12` defines the new query fields, `guide.ts:132-134` reads them, and no stale `NOT YET SHIPPED` text remains.

- **OK - runtime-specific sections exist.**  
  `guide.ts:20-77` covers Claude, Codex, Gemini, and the no-runtime overview.

- **HIGH - hook snippets use a fake user participant id.**  
  `guide.ts:18` hard-codes `const userPlaceholder = "us-yourname"`, then uses it in the Claude `UserPromptSubmit` command at `guide.ts:31-33` and Codex `UserPromptSubmit` command at `guide.ts:51-54`. The spec says that with `agent_id` + `session_id`, rendered markdown includes runtime-specific hook-install instructions naming the participant id, the user participant id, and the session id (`docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:225-231`). This route has `Paths`, so it can read the project config and find the real user participant instead of emitting a placeholder that would post user prompt events under a nonexistent participant if copied verbatim.

- **LOW - `agent_id` path still carries registration wording.**  
  `guide.ts:89-96` adds an identity line saying the agent is already registered and should skip `POST /participants/register`, but the session section still says "After you register as a participant" and "Replace `<agent id>` with the id returned from `POST /participants/register`." The generated curl uses the supplied `agent_id`, so behavior is mostly correct, but the instructions are contradictory for reconnect/managed-agent flows.

### `packages/kernel/tests/routes/envProbe.test.ts`

- **OK - requested two tests are present and pass.**  
  `envProbe.test.ts:6-27` verifies response shape from an injected probe. `envProbe.test.ts:29-48` verifies repeated requests use the cached result.

- **MEDIUM - tests do not exercise real detection.**  
  The tests never call `realProbe()`, never use `fakeCommandRunner()`, and therefore do not prove `which tmux`, `tmux -V` parsing, runtime probing, installer probing, or non-zero `tmux -V` fallback behavior. They also do not test TTL expiry or any refresh/invalidation behavior.

### `packages/kernel/tests/routes/guide.test.ts`

- **OK - requested compatibility cases are mostly present.**  
  `guide.test.ts:40-54` covers `sessionId`, `guide.test.ts:56-70` covers `session_id`, `guide.test.ts:72-85` covers `agent_id`, and `guide.test.ts:87-133` covers `claude`, `codex`, and `gemini`.

- **MEDIUM - runtime snippet assertions are shallow.**  
  `guide.test.ts:87-118` checks paths and agent ids for Claude/Codex, but does not assert the expected JSON/TOML hook structure or the `UserPromptSubmit` user participant id. `guide.test.ts:120-133` checks Gemini mentions manual-stream mode.

- **MEDIUM - no-runtime hook overview is not explicitly tested.**  
  `guide.ts:68-77` has a fourth branch for missing `runtime_id`, but `guide.test.ts:168-177` only checks "No session selected." It does not assert the runtime overview or the `?runtime_id=claude|codex|gemini` guidance.

### `packages/kernel/src/ws/bus.ts`

- **MEDIUM - event type exists, but no update path uses it.**  
  `bus.ts:46-49` defines `EnvProbeUpdatedMessage`, but repository search found no publisher or route that re-runs the probe and broadcasts it. This leaves the spec's manual re-probe story incomplete for Phase 10.

## Recommendation

Do not accept Phase 10 yet.

Fix `/env-probe` so the server loads `.f-mark/runtimes.json` and probes every registered runtime id using that entry's configured `executable`. The endpoint should still return `Record<runtime_id, boolean>`, but the detection should be based on executable availability, not `which <runtime_id>`.

Fix `/guide` to render the actual user participant id in Claude/Codex `UserPromptSubmit` snippets. Add tests that create a temp project, read the generated user participant id from config or `/participants?kind=user`, fetch `/guide?agent_id=...&session_id=...&runtime_id=claude|codex`, and assert the snippets contain both the agent id and the real user id.

Add an explicit cache refresh path or document why Phase 10 intentionally waits for TTL expiry. If keeping the `env-probe.updated` websocket event in the spec for this phase, add a route or server method that bypasses the cache, re-runs the probe, updates the cache, and publishes the event.

Then strengthen tests:

- `realProbe()` command-runner tests for `which tmux`, `tmux -V` parse, non-zero `tmux -V`, runtime executable probing, and installer priority.
- `createServer()` route test proving `/env-probe` works when `token: null` and `allowProcessApiNoAuth` is false.
- Guide tests for the exact Claude JSON snippet, exact Codex TOML snippet, Gemini manual-stream text, no-runtime overview, actual user participant id, and the `agent_id + session_id` reconnect wording.

## Phase 10 Fix Re-verification (2026-05-23)

**Status: PASS**

- **HIGH: `/env-probe` probes registered runtimes by executable, not by id - addressed.**  
  Commit `4560ca6` changes `realProbe()` to accept `getRuntimes(): Promise<RuntimeProbeEntry[]>`, where each entry has `{ id, executable }`, and stores results by `id` while running `which` against `executable` (`packages/kernel/src/routes/envProbe.ts:34-52`). Server wiring now loads `.f-mark/runtimes.json` via `loadRuntimes(deps.paths.fmarkDir())` and maps registered runtime entries to `{ id, executable }` before passing them into `realProbe()` (`packages/kernel/src/server.ts:170-180`). The focused test covers a custom id/executable split: runtime id `mylocal` is detected by `which /usr/local/bin/my`, not `which mylocal` (`packages/kernel/tests/routes/envProbe.test.ts:185-205`).

- **HIGH: `/guide` uses the real user participant id instead of hardcoded `us-yourname` - addressed.**  
  `/guide` now calls `listParticipants(p)`, selects the first participant with `kind === "user"`, and only falls back to `us-yourname` if no user participant is available or config loading fails (`packages/kernel/src/routes/guide.ts:148-162`). The hook renderer receives `userParticipantId` and injects it into both Claude and Codex `UserPromptSubmit` snippets (`packages/kernel/src/routes/guide.ts:15-21`, `packages/kernel/src/routes/guide.ts:33-35`, `packages/kernel/src/routes/guide.ts:53-56`). Tests verify Claude uses `us-alice`, Codex uses `us-bob`, and the fallback remains available for agent-only configs (`packages/kernel/tests/routes/guide.test.ts:179-246`).

- **MEDIUM: `POST /env-probe/refresh` exists and broadcasts `env-probe.updated` - addressed.**  
  `registerEnvProbeRoute()` now has a shared `fresh()` path that reruns the probe, updates the 30s cache, and publishes `{ type: "env-probe.updated", result }` when a broadcast function is wired (`packages/kernel/src/routes/envProbe.ts:80-84`). `POST /env-probe/refresh` is registered and calls `fresh()` (`packages/kernel/src/routes/envProbe.ts:92`). `createServer()` wires that broadcast to `busRef.publish(m)` (`packages/kernel/src/server.ts:181-184`). Tests assert refresh busts the cache and emits the expected message (`packages/kernel/tests/routes/envProbe.test.ts:56-143`).

- **MEDIUM: `realProbe` accepts injectable `CommandRunner`; tests exercise real detection logic - addressed.**  
  `realProbe()` accepts `runner: CommandRunner = realCommandRunner()` (`packages/kernel/src/routes/envProbe.ts:34-37`). The tests inject `fakeCommandRunner()` and exercise tmux detection, `tmux -V` parsing, non-zero `tmux -V`, runtime executable detection, missing runtime executable detection, tmux-missing behavior, and installer priority (`packages/kernel/tests/routes/envProbe.test.ts:146-248`).

**Test result:** PASS.  
Command: `pnpm --filter f-mark test tests/routes/envProbe.test.ts tests/routes/guide.test.ts`

Vitest result:

- `tests/routes/envProbe.test.ts` - PASS, 11 tests
- `tests/routes/guide.test.ts` - PASS, 14 tests
- Total: 2 files passed, 25 tests passed

Note: the requested expectation said "should be ~13 envProbe + ~12 guide tests"; the current suite reports 11 envProbe + 14 guide, still 25 focused tests total.

**Recommendation:** Accept the Phase 10 fix. All four previously reported HIGH/MEDIUM findings are addressed with focused test coverage.
