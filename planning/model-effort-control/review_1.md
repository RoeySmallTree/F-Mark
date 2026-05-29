# Review 1: Model & Effort Control

## Bottom Line

The adapter direction is right, but this plan is not ready to implement. The core fixes are not cosmetic: OpenCode should not be HTTP-first for v1, spawn arg merging must strip conflicting flags instead of relying on order, and extending `AgentStatusRow` alone will not make the top-bar badge work because the renderer currently stores only a `ManagedAgent` subset.

The plan also has two stale runtime assumptions from the live machine: Claude Code now exposes `--effort`, and Codex rollout model/effort is not in line-1 `session_meta.payload`. Treat the empirical doc as useful evidence, not an implementation spec.

## Triage

| # | Finding | Disposition |
|---|---------|-------------|
| 1 | `RuntimeAdapter` is the right abstraction, but the interface should not live wholesale in shared and should plug into the existing runtime config/capability split. | **FIX** |
| 2 | `readCurrent()` returning one state object is right for v1; token deltas do not need a stream. | **AGREE** |
| 3 | OpenCode HTTP-first adds a server lifecycle F-Mark has not otherwise adopted; use hook session ID plus `opencode db`/SQLite/export for v1. | **FIX** |
| 4 | OpenCode variants are exposed by `opencode models --verbose`; hardcoded variants and HTTP probing are unnecessary as the primary path. | **FIX** |
| 5 | Appending override args after `runtime.args` is mechanically possible, but unsafe. Duplicate model/variant flags break Codex and OpenCode. | **FIX** |
| 6 | `AgentStatusRow` optional fields are wire-safe, but the renderer drops them before `AgentChip`, so the badge will not update. | **FIX** |
| 7 | Hook wire-up belongs at the `autoStream` decision point plus a server-side runtime-state update path, not inside generic `post.ts`; avoid also wiring event routes. | **FIX** |
| 8 | Codex `readCurrent` path is wrong: current rollouts put model/effort in `turn_context`, not line-1 `session_meta.payload`, and `session_index.jsonl` is not a cwd index. | **FIX** |
| 9 | Claude effort assumption is stale: local Claude Code exposes `--effort`; reading current effort is still unproven. | **HOT-TEST** |
| 10 | The plan's "reuse transcript parser" claim is wrong for Claude model extraction; current parser returns only `TurnBlock[]` and keeps `RawEntry` private. | **FIX** |
| 11 | Runtime-control PUT/respawn is under-specified: no existing route writes participant overrides or respawns a connected agent. | **FIX** |
| 12 | Phase order skips real dependencies: OpenCode is still not registered in this codebase, and `node:sqlite` conflicts with the repo's Node >=20 engine. | **FIX** |

## Findings

1. **FIX - RuntimeAdapter shape: keep behavior in kernel, share only DTOs.**

The plan puts the full function-bearing interface in `packages/shared/src/runtimeAdapters.ts` (`summary.md:17-57`). That does not match the current split: shared owns wire/config types like `RuntimeEntry` (`packages/shared/src/managedAgents.ts:24-31`), while kernel owns validation, storage, defaults, and behavior (`packages/kernel/src/runtimes/validation.ts:63-86`, `packages/kernel/src/runtimes/registry.ts:20-44`, `packages/kernel/src/runtimes/store.ts:23-27`). Kernel also already has runtime behavior capability tables for compact/clear/fork (`packages/kernel/src/agents/capabilities.ts:30-126`).

Recommendation: put `RuntimeAdapter` and adapter registry in kernel. Put only serializable DTOs in shared: `ModelDescriptor`, `EffortDescriptor`, `CurrentRuntimeState`, maybe `RuntimeOverridePatch`. Custom runtime IDs are allowed by registry and shared types (`packages/shared/src/integrations.ts:1`, `packages/kernel/src/routes/runtimes.ts:16-19`), so unknown/custom runtimes need a clean "unsupported" response rather than an adapter registry throw.

`readCurrent()` returning a single `CurrentRuntimeState | null` is correct for model/effort badges. Token/cost deltas do not need a stream for v1; hooks can refresh aggregate fields opportunistically. If tokens/cost are kept, include them in `CurrentRuntimeState` and add sources such as `"opencode-db"`, `"export"`, and `"override"`; the current source enum does not cover the likely v1 paths (`summary.md:37-43`).

2. **FIX - OpenCode v1 should not be HTTP-first.**

The plan makes `opencode serve` the primary read path (`summary.md:123-126`, `summary.md:206`, `summary.md:260-261`) and calls it "the proper integration point" in findings (`findings.md:131-140`). That conflicts with the replacement plan's chosen architecture: OpenCode TUI remains in the existing tmux manager, and the plugin/hook surface exposes the OpenCode session ID on hook events (`planning/replace-gemini-with-opencode/summary.md:45`). Current `autoStream`-style hook payloads already carry runtime `session_id`, `transcript_path`, `cwd`, and `hook_event_name` (`packages/kernel/src/hooks/autoStream.ts:28-33`).

Operationally, `opencode serve` is another long-lived process per workspace, with random-port behavior by default from local `opencode serve --help`, plus attach/auth/port discovery. F-Mark's managed-agent spawn path currently launches one tmux runtime process and injects F-Mark env (`packages/kernel/src/routes/managedAgents.ts:1421-1438`); there is no server supervisor, PID file, or port registry to reuse.

For v1, prefer:

- Primary: OpenCode session ID from plugin/hook plus `opencode db --format json "<query>"`, which is an existing CLI wrapper around the SQLite DB and avoids a new dependency.
- Fallback: direct SQLite read if CLI output is unavailable or too slow.
- Last fallback: `opencode export <sessionID> --sanitize`; it includes `info.model`, `info.tokens`, and `info.cost` for real sessions, but dumps the full message tree and is too heavy as the default. `findings.md:135` is correct that export exists, but not enough to justify HTTP.

3. **FIX - OpenCode variant discovery is better than the plan says.**

The plan says variants are not directly exposed and proposes hardcoded provider maps unless HTTP reveals more (`findings.md:107-112`, `summary.md:112-121`). Local `opencode models openai --verbose` exposes a `variants` object per model with `reasoningEffort` values. `opencode models --help` also advertises `--verbose` metadata and `--refresh`.

Recommendation: use `opencode models [provider] --verbose` as the primary `listModels/listEfforts` path, cache it, and parse the model/JSON blocks. Keep the hardcoded provider map only as a degraded fallback. This reduces the need for HTTP and avoids shipping stale effort lists.

4. **FIX - Spawn arg append ordering is achievable, but double-flag behavior makes it unsafe.**

The plan points at the wrong file: `spawnArgsForRuntime` is not in `packages/kernel/src/agents/managed.ts`; it is local to `packages/kernel/src/routes/managedAgents.ts:121-170`. Existing spawn and reconnect call it with raw `runtime.args` (`packages/kernel/src/routes/managedAgents.ts:1088-1093`, `packages/kernel/src/routes/managedAgents.ts:1421-1426`), so appending adapter args after `runtime.args` is mechanically easy. For Claude/Codex, the launch prompt is appended after args (`packages/kernel/src/routes/managedAgents.ts:142-145`), so the correct final order would be `runtime.args + sanitizedOverrideArgs + launchPrompt`.

Do not rely on "last wins":

- Codex v0.133 rejects duplicate `-m/--model`: local probe returned `error: the argument '--model <MODEL>' cannot be used multiple times`.
- Codex `-m` wins over `-c model=...` regardless of order in local probes, so switching the adapter to `-c model=...` does not safely override a user-set `-m`.
- Claude Code 2.1.128 accepts duplicate `--model` and selected the last invalid model in a local probe, but relying on that still bakes in parser behavior.
- OpenCode 1.15.11 does not last-win. Duplicate `-m` became an array and hit `D.split is not a function`; duplicate `--variant` became `["high","max"]` and failed validation.

Recommendation: add a per-runtime arg sanitizer before appending override args. When `model` is set, strip existing model flags from `runtime.args`; when `effort` is set, strip existing effort/variant flags. Cover `-m value`, `-m=value`, `--model value`, `--model=value`, Codex `-c model=...`, Codex `-c model_reasoning_effort=...`, Claude `--effort`, OpenCode `--variant value`, and `--variant=value`. Preserve user args when no override exists. Add tests for each conflicting form.

5. **FIX - `AgentStatusRow` extension is wire-safe, but it will not reach `AgentChip`.**

Adding optional fields to `AgentStatusRow` will not break existing consumers by itself. The shared type is structural (`packages/shared/src/managedAgents.ts:167-183`), `ManagedAgentUpdatedMessage` just carries the row (`packages/shared/src/managedAgents.ts:278-280`), the renderer WS guard checks only `type` (`packages/renderer/src/App.tsx:62-72`), and there is no zod/exact-key schema for status rows. `GET /managed-agents/status` returns plain objects without an AJV body schema (`packages/kernel/src/routes/managedAgents.ts:731-733`).

The problem is propagation. The top bar does not store `AgentStatusRow`; it stores `ManagedAgent[]` (`packages/renderer/src/state/presence.ts:13-23`). On `managed-agent.updated`, the store copies only `participant_id`, `tmux_session`, `runtime_id`, `runtime_session`, and `alive` (`packages/renderer/src/state/store.ts:530-537`). `TopBar` then builds chip props from `managedAgents` plus participants (`packages/renderer/src/shell/TopBar.tsx:362-383`), and `AgentChipProps` has no model/effort fields (`packages/renderer/src/components/AgentChip.tsx:19-29`).

Recommendation: either extend `ManagedAgent` with `runtime_state?: CurrentRuntimeState` and preserve it in `dispatchManagedAgentWsMessage`, or add a separate `agentRuntimeStateById` store. Then pass `model/effort/provider` through `TopBar` into `AgentChip`. The right-side `RightAgents` panel can read the full `AgentStatusRow` already (`packages/renderer/src/panels/right/RightAgents.tsx:86-104`), but the requested badge path cannot.

6. **FIX - Hook wire-up belongs in `autoStream` plus a server-side update route/service, not generic `post.ts`.**

`post.ts` is a generic hook-process HTTP client for event writes and ping (`packages/kernel/src/hooks/post.ts:22-85`, `packages/kernel/src/hooks/post.ts:111-122`). It does not know the runtime, hook event name, or transcript path. `autoStream.ts` has those inputs and already branches on `PostToolUse` and Stop before projecting events (`packages/kernel/src/hooks/autoStream.ts:1012-1114`).

There is no current hook-side `AgentStatusRow` emitter. Managed-agent updates are published by route code after control actions (`packages/kernel/src/routes/managedAgents.ts:630-637`) and by fork session rebinding (`packages/kernel/src/routes/sessions.ts:589-622`). Event writes publish only `event_added`/`event_superseded` (`packages/kernel/src/services/eventPublisher.ts:16-31`), including turn-end writes (`packages/kernel/src/routes/events.ts:622-646`).

Recommendation: trigger `readCurrent` from `autoStream` after session/participant resolution on `PostToolUse` and Stop, then POST the result to a new kernel route/service that persists latest runtime state and publishes one `managed-agent.updated`. Keep `post.ts` as a small helper by adding a `postRuntimeState` function if desired, but do not put adapter logic there. Do not also wire `/sessions/:id/events/*` routes to read runtime state, or Stop hooks will double-emit after `autoStream` posts events.

7. **FIX - Codex `readCurrent` needs to scan `turn_context`, not line-1 `session_meta`.**

The plan says to read Codex rollout line 1 and return `payload.model` (`summary.md:76-80`). Current local Codex 0.133 rollouts on this machine have `session_meta.payload.model_provider`, but `payload.model` is undefined on line 1; model and effort appear in a later `turn_context` payload. The existing parser already treats Codex as a special JSONL shape via payload/item records (`packages/kernel/src/hooks/transcript.ts:22-26`, `packages/kernel/src/hooks/transcript.ts:79-93`), so a dedicated helper should scan entries for `turn_context.payload.model` and `turn_context.payload.effort`, then fall back to older keys like `reasoning_effort`.

The fallback in `summary.md:78` is also wrong: `~/.codex/session_index.jsonl` is not a cwd index in the observed local file and cannot find "most recent session matching cwd" as written. Use `transcriptPath` from hook payload first. Without it, scan recent rollout files under `~/.codex/sessions/**` and match `session_meta.payload.cwd` or `turn_context.payload.cwd`, bounded by time/count. Only then fall back to `~/.codex/config.toml` (`findings.md:73-80`).

8. **HOT-TEST - Claude effort is no longer absent; current read path is the real unknown.**

`findings.md` says Claude has no effort knob (`findings.md:154-158`), and the plan returns `[]` from `listEfforts()` and ignores effort in `buildSpawnArgs()` (`summary.md:98-104`). Local `claude --help` for Claude Code 2.1.128 exposes `--effort <level>` with `low, medium, high, xhigh, max`. That changes the product decision: Claude may need an effort control, but the observed transcript sample did not show an obvious effort field.

Recommendation: add Phase 0 hot tests for Claude `--effort` set behavior and persistence. Verify whether effort appears in transcript JSONL, settings, or debug output. If current effort is not observable, the UI should distinguish "configured override" from "observed current state" instead of showing a fake live effort.

9. **FIX - The Claude parser reuse plan is not implementable as written.**

The plan says to widen `RawEntry` so the adapter can read `message.model` through the existing parser (`summary.md:99-101`, `summary.md:189`). But `RawEntry` is private, direct `role/content` shaped, and `parseJsonl` is private (`packages/kernel/src/hooks/transcript.ts:12-20`, `packages/kernel/src/hooks/transcript.ts:35-40`). The exported function returns only `TurnBlock[]` (`packages/kernel/src/hooks/transcript.ts:343-424`), which discards model metadata.

Also, local Claude Code transcript entries are top-level objects with nested `message.role`, `message.content`, and `message.model`, not direct `role/content`. Build a separate metadata extractor for Claude JSONL, or export a generic parsed-entry helper that preserves raw metadata. Do not couple model extraction to `extractLastAssistantTurn`.

10. **FIX - Runtime override persistence and respawn are missing, not just a route add.**

The plan says `PUT /managed-agents/:id/runtime` writes `{model_override, effort_override}` into participants and respawns (`summary.md:147-153`, `summary.md:285-293`). Current participant types have no override fields (`packages/shared/src/participants.ts:3-19`, `packages/kernel/src/project.ts:15-20`). Existing participant update route accepts only `name` and `color` with `additionalProperties: false` (`packages/kernel/src/routes/participants.ts:92-107`), and kernel participant write helpers currently only update runtime/name/color paths (`packages/kernel/src/participants.ts:245-275`, `packages/kernel/src/participants.ts:288-317`).

There is also no "respawn connected agent with new args" route. `reconnect` returns the current row if already connected (`packages/kernel/src/routes/managedAgents.ts:1055-1064`); `goodbye` kills and clears managed siblings (`packages/kernel/src/routes/managedAgents.ts:1560-1586`). The runtime-control route must implement its own connected-agent restart sequence: validate override, persist it, kill existing tmux session if present, spawn with sanitized args/env, preserve active F-Mark session, update runtime-session metadata, update presence/tracker, append logs, and publish one status update.

11. **FIX - Phase order assumes OpenCode is already registered, but this tree still has Gemini.**

Current defaults still register `gemini`, not `opencode` (`packages/kernel/src/runtimes/defaults.ts:3-6`), and shared `RuntimeId` still names Gemini (`packages/shared/src/integrations.ts:1`). The OpenCode replacement plan documents this as in-progress and says the TUI runtime stays under the tmux manager (`planning/replace-gemini-with-opencode/summary.md:45`). Model-effort Phase 10 asks for one of each runtime including OpenCode (`summary.md:313-319`), but that is not possible until the replacement work lands or this plan explicitly registers OpenCode first.

Recommendation: make "OpenCode runtime registered and hook/plugin session ID available" a hard prerequisite, or add an early dependency phase that completes just enough of the OpenCode runtime registration for model-effort tests.

12. **FIX - SQLite dependency note conflicts with Node >=20 and ignores `opencode db`.**

The plan says "use `better-sqlite3` if not already a dep, else `node:sqlite`" (`summary.md:257-259`). The repo advertises Node `>=20` (`package.json:7-9`), and `node:sqlite` is not a safe Node 20 assumption. There is no existing SQLite dependency in the package manifests/lockfile from `rg`.

Recommendation: for v1, avoid adding a native dependency by using `opencode db --format json` for narrow reads. If direct SQLite is still needed, choose an explicit package and update engines/CI accordingly. Do not write code that imports `node:sqlite` while claiming Node 20 support.

## Specific Answers

1. **RuntimeAdapter shape:** Adapter abstraction is right, but the function interface belongs in kernel; shared should contain serializable DTOs only. Existing runtime abstractions are config/validation (`RuntimeEntry`, `RuntimeEntryShape`) and control capabilities, not model/effort adapters. `readCurrent` as a single state object is right; no token-delta stream for v1.

2. **OpenCode HTTP-first vs CLI/SQLite-only:** HTTP-first is not sound for v1. The existing OpenCode plan keeps the TUI in tmux and gets a runtime session ID from hooks. `opencode export <sessionID>` is structurally sufficient for real sessions but too heavy as primary. Use `opencode db --format json` or SQLite by session ID/cwd, with export as fallback.

3. **Spawn-args merge:** Appending after `runtime.args` is achievable in `spawnArgsForRuntime`, but unsafe. Codex rejects duplicate `-m`; OpenCode duplicate `-m`/`--variant` fails; Claude appears last-wins but should not be relied on. Strip conflicting flags before appending overrides.

4. **AgentStatusRow extension:** Optional fields will not break current consumers or schemas. There is no exact-key narrowing for status rows. But the top-bar store drops the new fields, so the UI will not work unless `ManagedAgent` or a separate runtime-state store is extended.

5. **Hook wire-up location:** `autoStream.ts` is the right hook decision point because it has participant/session/runtime/transcript context. `post.ts` can have a helper function only. The server-side update/broadcast should be a new route/service, and only one hook path should call it to avoid double emits.

6. **Missing/wrong:** The plan misses connected-agent respawn mechanics, override persistence helpers, OpenCode registration dependency, Codex rollout field location, Claude effort, OpenCode verbose variant discovery, Node 20 SQLite constraints, and the renderer store propagation gap.

## Top 3 Plan Changes Before Implementation

1. Replace OpenCode HTTP-first with a CLI/DB-first v1 path: session ID from hook/plugin, `opencode db --format json` primary, export/direct SQLite fallback, no long-lived `opencode serve`.
2. Replace append-only spawn merging with per-runtime conflict stripping and tests for duplicate/conflicting flags.
3. Redesign status propagation: persist latest runtime state server-side, include it in `AgentStatusRow`, and carry it through the renderer store to `AgentChip`.

Final verdict: **needs redesign before implementation**.
