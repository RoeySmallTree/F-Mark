# Review 2: Model & Effort Control Implementation

## Bottom Line

The adapter abstraction landed in the right neighborhood, but this implementation is not ready for all-provider hot-testing. Several paths pass unit tests while missing the product contract: `PUT /runtime` kills the pane but does not respawn it, OpenCode's actual plugin integration never posts runtime state, Claude aliases are neither canonicalized nor accepted by validation, and the runtime-state store loses configured override context as soon as the next observed hook arrives.

I would fix the issues below before live hot-tests. The hot-test should validate runtime behavior, not discover that the API shape is lying about restart or that one provider has no read path wired.

## Findings

1. **FIX - `autoStream` probes runtime state on every hook event; gate it to Stop/PostToolUse.**

`maybePostRuntimeState()` is called immediately after ping and before access/tool/user branching (`packages/kernel/src/hooks/autoStream.ts:1050-1058`). It does not inspect `hook_event_name`; it calls the adapter for every user hook, permission hook, notification hook, subagent hook, and assistant hook that reaches this point (`packages/kernel/src/hooks/autoStream.ts:968-994`). The original plan and empirical doc scoped refresh to Stop/PostToolUse (`planning/model-effort-control/findings.md:179-181`).

The benefit of every-event probing is tiny because model/effort changes only at spawn/respawn in this design. The cost is real: Claude/Codex reread JSONL transcripts repeatedly (`packages/kernel/src/runtimes/adapters/claude.ts:38-62`, `packages/kernel/src/runtimes/adapters/codex.ts:101-104`), and OpenCode can spawn a CLI process. Worse, this happens before permission handling (`packages/kernel/src/hooks/autoStream.ts:1060-1078`), so a slow probe can delay an access prompt. Gate to `Stop` and `PostToolUse`, and consider deduping unchanged state.

2. **HOT-TEST - Codex `transcript_path` is passed through raw, but the implementation has no fallback if it is not the rollout path.**

The Codex hook installer only registers the `f-mark hook auto-stream` command for `Stop`, `UserPromptSubmit`, and `PermissionRequest`; it does not wrap or rewrite stdin (`packages/kernel/src/hooksInstall/codex.ts:317-359`, `packages/kernel/src/hooksInstall/command.ts:23-48`). So the adapter is relying entirely on Codex's raw hook payload. If Codex supplies the rollout JSONL as `transcript_path`, the parser is correct: it scans `turn_context.payload.{model,effort}` (`packages/kernel/src/runtimes/adapters/codex.ts:117-140`; fixture at `packages/kernel/tests/runtimes/adapters/fixtures/codex/rollout-sample.jsonl:1-5`).

But this is not proven by an end-to-end Codex hook fixture, and the fallback promised in the plan is missing. `readCurrent()` returns `null` after `transcriptPath` fails or is absent (`packages/kernel/src/runtimes/adapters/codex.ts:98-105`), instead of scanning recent `~/.codex/sessions/**` by cwd or reading config (`planning/model-effort-control/summary.md:123-125`). Add the fallback or mark this as a hot-test blocker.

3. **FIX - Claude aliases are observed live but not canonicalized, so badges and validation drift.**

Phase 0 observed `sonnet`, `opus`, `claude-haiku-4-5-20251001`, and `<synthetic>` in Claude transcripts, and explicitly required alias canonicalization plus dropping `<synthetic>` (`planning/model-effort-control/hot-test-results.md:35-42`). The adapter drops `<synthetic>`, but otherwise returns raw `message.model` (`packages/kernel/src/runtimes/adapters/claude.ts:57-65`). The hardcoded list contains only three canonical undated slugs (`packages/kernel/src/runtimes/adapters/claude.ts:11-15`).

The badge formatter handles canonical/date-suffixed slugs, so `claude-haiku-4-5-20251001` shortens to `Haiku 4.5`, but aliases like `opus` and `sonnet` fall through as lowercase raw text (`packages/renderer/src/components/AgentChip.tsx:33-42`). `PUT /runtime` also exact-matches the hardcoded list (`packages/kernel/src/routes/managedAgents.ts:1841-1846`), so observed-valid aliases/date suffixes cannot be selected through the API.

4. **FIX - OpenCode runtime-state read is not wired into the actual OpenCode integration, and the fallback CLI path fails silently.**

OpenCode hook install uses an in-process plugin, not the generic `auto-stream` command (`packages/kernel/src/hooksInstall/opencode.ts:177-208`). That plugin posts prose, turn-end, tool-use, and access events (`packages/kernel/assets/opencode-plugin/fmark.ts:247-348`), but it never posts `/managed-agents/:id/runtime-state`. Therefore the OpenCode adapter's `readCurrent()` is not used in the real OpenCode path.

If `autoStream` is somehow used for OpenCode, it still does not pass the runtime `session_id` into `adapter.readCurrent()` (`packages/kernel/src/hooks/autoStream.ts:980-987`), so OpenCode falls back to cwd and can pick the wrong session in a multi-agent workspace (`packages/kernel/src/runtimes/adapters/opencode.ts:187-191`). If `opencode` is missing from PATH, `spawn()` errors are converted to `{code:1}` (`packages/kernel/src/runtimes/adapters/opencode.ts:25-42`), `readCurrent()` returns `null` (`packages/kernel/src/runtimes/adapters/opencode.ts:191-192`), and `maybePostRuntimeState()` swallows it (`packages/kernel/src/hooks/autoStream.ts:983-993`). That is safe for turns, but the badge simply never appears and the route gives no diagnostic.

5. **FIX - `PUT /runtime` says restart but only kills and disconnects.**

The route persists the override and sets an optimistic runtime state (`packages/kernel/src/routes/managedAgents.ts:1859-1870`), then, when restart is enabled, kills the tmux session and clears managed sibling files (`packages/kernel/src/routes/managedAgents.ts:1872-1888`). It never calls the reconnect/spawn path, yet returns `restarted: true` (`packages/kernel/src/routes/managedAgents.ts:1890-1895`).

That is not the respawn-with-args flow described in the task. It is also awkward API ergonomics: clients must know to call `POST /reconnect` after a successful `PUT`, and the current renderer client has no runtime-control methods at all. Auto-reconnect is preferable. The failure mode is still manageable: if kill succeeds and respawn fails, keep the persisted override, return a clear error/partial state, log it, and leave the agent reconnectable. The current two-step flow has the same failure mode, but hides it behind a misleading success response.

6. **AGREE - Override arg ordering is acceptable for current runtimes, but add spawn-level tests.**

`applyRuntimeOverride()` sanitizes existing args then appends adapter args (`packages/kernel/src/routes/managedAgents.ts:125-135`). `spawnArgsForRuntime()` then appends the launch prompt for Claude/Codex (`packages/kernel/src/routes/managedAgents.ts:159-164`) and appends `--prompt <launchPrompt>` for OpenCode (`packages/kernel/src/routes/managedAgents.ts:187-195`). Tmux executes the runtime as `executable, ...args` without wrapper reordering (`packages/kernel/src/tmux/manager.ts:86-98`).

I do not see a current runtime that requires the launch prompt before model/effort flags. The hook install files only register hooks/plugins; they do not wrap the runtime CLI. Still, this is only unit-tested at `applyRuntimeOverride()` level (`packages/kernel/tests/runtimes/adapters/applyRuntimeOverride.test.ts:25-64`), not via spawn/reconnect argv capture. Add a spawn-level regression for Claude, Codex, and OpenCode.

7. **FIX - Runtime state is in-memory only and observed updates drop configured override context.**

The service is a module-level `Map` (`packages/kernel/src/services/runtimeState.ts:8-15`) and status rows read only that map (`packages/kernel/src/routes/managedAgents.ts:629`). On kernel restart, badges go dark even though overrides are persisted in participants (`packages/kernel/src/participants.ts:320-348`). That might be tolerable for purely observed live state, but not for configured overrides the user just set.

There is a second bug: `PUT /runtime` stores `configuredModel/configuredEffort` in the optimistic state (`packages/kernel/src/routes/managedAgents.ts:1865-1870`), but the hook POST route reconstructs state from only `model/effort/provider/source/observedAt` (`packages/kernel/src/routes/managedAgents.ts:1725-1735`). The next Claude transcript update has no observable effort, so the configured effort disappears from the badge even though the participant still has it. Merge persisted overrides into every runtime state row, and either persist latest observed state or synthesize `source:"override"` from participant overrides after restart.

8. **FIX - `PUT /runtime` model validation is too exact for live provider behavior.**

The route exact-matches `body.model` against `adapter.listModels()` (`packages/kernel/src/routes/managedAgents.ts:1841-1846`). For OpenCode, the adapter caches `opencode models --verbose` for five minutes (`packages/kernel/src/runtimes/adapters/opencode.ts:125-162`), so a newly added registry model is rejected until cache expiry unless the user first hits the models endpoint with `refresh=true`. On a cache miss, retry with refresh before rejecting.

Claude has the same shape problem without caching: live transcripts include aliases and a date-suffixed Haiku slug (`planning/model-effort-control/hot-test-results.md:35-42`), but `listModels()` exposes only undated canonical slugs (`packages/kernel/src/runtimes/adapters/claude.ts:11-15`). The API rejects `claude-haiku-4-5-20251001`, `opus`, `sonnet`, and `haiku` even though Phase 0 observed/endorsed those forms.

9. **AGREE with caveat - `managed-agent.updated` can populate TopBar state, but `addManagedAgent` replaces rather than merges.**

`addManagedAgent()` filters out the old row and appends the new one (`packages/renderer/src/state/presence.ts:66-74`). A `managed-agent.spawned` message creates a row without `runtime_state` (`packages/renderer/src/state/store.ts:812-817`), and a later `managed-agent.updated` creates a replacement row with `runtime_state` (`packages/renderer/src/state/store.ts:829-837`). So the specific "spawned then updated" path works.

The caveat: replacement semantics mean any later row without `runtime_state` clears the badge. Initial renderer load uses `GET /managed-agents` (`packages/renderer/src/App.tsx:206-207`), and that list route returns agent rows without `runtime_state` (`packages/kernel/src/routes/managedAgents.ts:1668-1683`). The badge will be absent until the next `managed-agent.updated` even if the kernel has runtime state in memory.

10. **AGREE - Disconnected-agent overrides are applied on later reconnect.**

`PUT /runtime` persists `model_override` and `effort_override` immediately (`packages/kernel/src/routes/managedAgents.ts:1859-1862`). The reconnect handler reads the participant record and builds `overridePatch` from those persisted fields (`packages/kernel/src/routes/managedAgents.ts:1117-1125`), then calls `spawnArgsForRuntime()` with that patch (`packages/kernel/src/routes/managedAgents.ts:1126-1132`). This path should apply the override to a later disconnected reconnect.

This only holds because participant `runtime_id` is persisted; after `PUT /runtime` clears managed sibling files, reconnect still finds the agent through participants/status rather than `/managed-agents` list membership.

11. **AGREE - Adapter import cold-start cost is probably acceptable; probe work is the real cost.**

`autoStream` statically imports the adapter registry (`packages/kernel/src/hooks/autoStream.ts:23`), and the registry statically imports all adapters (`packages/kernel/src/runtimes/adapters/index.ts:1-3`), including OpenCode's `child_process` import (`packages/kernel/src/runtimes/adapters/opencode.ts:1`). That adds some module load work to every hook process.

I would not block on this alone. The cold-start cost of a few Node built-ins is much smaller than reading full transcripts or shelling `opencode db`. If hook latency becomes visible, gate first, then lazy-load adapters inside `maybePostRuntimeState()` only for Stop/PostToolUse.

12. **FIX - The write feature is not exposed in the renderer client/UI.**

The kernel adds `GET /runtime/models`, `GET /runtime/efforts`, and `PUT /runtime` (`packages/kernel/src/routes/managedAgents.ts:1755-1896`), but the renderer client interface has no methods for these endpoints (`packages/renderer/src/api/managedAgents.ts:44-98`) and the implementation ends at runtime registry CRUD, not model/effort control (`packages/renderer/src/api/managedAgents.ts:193-354`). `AgentChip` even defines `onModelBadgeClick` (`packages/renderer/src/components/AgentChip.tsx:29-30`), but `TopBar` never passes it (`packages/renderer/src/shell/TopBar.tsx:468-478`).

That means the branch exposes a badge but no user-facing model/effort picker. If the intended v1 write surface is REST-only, document that; otherwise add the modal/client path before hot-test, because the current user story says "lets the user change them".

13. **FIX - The adapter contract includes `buildSpawnEnv()`, but spawn/reconnect never applies it.**

The interface requires `buildSpawnEnv()` (`packages/kernel/src/runtimes/adapters/types.ts:27-28`), and all adapters implement it as `{}` today (`packages/kernel/src/runtimes/adapters/claude.ts:79-81`, `packages/kernel/src/runtimes/adapters/codex.ts:150-152`, `packages/kernel/src/runtimes/adapters/opencode.ts:229-231`). But both spawn and reconnect only pass `runtime.env` plus F-Mark env into tmux (`packages/kernel/src/routes/managedAgents.ts:1137-1144`, `packages/kernel/src/routes/managedAgents.ts:1483-1490`). This is harmless with current adapters, but the abstraction is misleading and future runtime env overrides will silently not work.

## Specific Answers

1. **autoStream probe rate:** **FIX.** It should be gated to Stop/PostToolUse. Every-event probing adds repeated file/CLI work and can delay permission hooks (`packages/kernel/src/hooks/autoStream.ts:1050-1078`) with little benefit because model/effort changes only on spawn.

2. **Codex `transcript_path`:** **HOT-TEST/FIX.** The wiring passes raw Codex stdin to `auto-stream` and does not transform `transcript_path` (`packages/kernel/src/hooksInstall/codex.ts:317-359`). If Codex points it at rollout JSONL, the adapter works; if not, the missing cwd/config fallback makes the badge dark (`packages/kernel/src/runtimes/adapters/codex.ts:98-105`).

3. **Claude canonicalization:** **FIX.** `<synthetic>` is skipped, but `opus`/`sonnet`/`haiku` are returned raw (`packages/kernel/src/runtimes/adapters/claude.ts:57-65`). `shortenModel()` renders aliases raw and only prettifies canonical/date slugs (`packages/renderer/src/components/AgentChip.tsx:33-42`).

4. **OpenCode CLI shelling from autoStream:** **FIX.** Actual OpenCode uses the plugin and never posts runtime state (`packages/kernel/assets/opencode-plugin/fmark.ts:247-348`). If autoStream does invoke the adapter, missing `opencode` resolves to code 1 and is swallowed, so the badge silently stays absent (`packages/kernel/src/runtimes/adapters/opencode.ts:25-42`, `packages/kernel/src/hooks/autoStream.ts:983-993`).

5. **PUT restart semantics:** **FIX.** The route kills and clears state but does not respawn (`packages/kernel/src/routes/managedAgents.ts:1872-1889`). Auto-reconnect is the more ergonomic API; if respawn fails after kill, return a partial failure with the override persisted and the agent reconnectable.

6. **Override ordering:** **AGREE.** Current runtime invocation keeps flags before prompt (`packages/kernel/src/routes/managedAgents.ts:148-195`, `packages/kernel/src/tmux/manager.ts:86-98`). I found no runtime wrapper requiring prompt before model/effort flags.

7. **Durability:** **FIX.** A module-level `Map` loses state on kernel restart (`packages/kernel/src/services/runtimeState.ts:8-15`). Persist latest state or synthesize it from participant overrides so configured badges survive.

8. **Model validation:** **FIX.** OpenCode cache can stale-reject valid new models (`packages/kernel/src/runtimes/adapters/opencode.ts:125-162`), and Claude validation rejects observed aliases/date suffixes (`packages/kernel/src/routes/managedAgents.ts:1841-1846`).

9. **TopBar propagation:** **AGREE with caveat.** `addManagedAgent()` replaces, not merges (`packages/renderer/src/state/presence.ts:66-74`). Spawned-without-state followed by updated-with-state works (`packages/renderer/src/state/store.ts:812-837`), but initial `/managed-agents` load and any row without state clear the badge.

10. **Disconnected PUT then reconnect:** **AGREE.** Reconnect reads persisted participant overrides and passes them to spawn args (`packages/kernel/src/routes/managedAgents.ts:1117-1132`).

11. **Adapter import cold-start:** **AGREE.** Static adapter imports add some hook-process load (`packages/kernel/src/hooks/autoStream.ts:23`, `packages/kernel/src/runtimes/adapters/index.ts:1-3`), but the larger cost is the ungated probe work.

12. **Anything else:** **FIX.** The renderer has no client methods or UI for the new runtime-control endpoints (`packages/renderer/src/api/managedAgents.ts:44-98`, `packages/renderer/src/shell/TopBar.tsx:468-478`), and `buildSpawnEnv()` is dead contract surface.

## Top 3 Changes Before Hot-Testing

1. Make `PUT /managed-agents/:id/runtime` perform the actual respawn-with-args flow, or rename the current behavior so it honestly reports "killed, reconnect required"; add route tests for connected and disconnected agents.

2. Gate runtime-state probes to Stop/PostToolUse, pass runtime session IDs into adapters, and wire OpenCode runtime-state posting through the real OpenCode plugin or a kernel-side endpoint that can query by `sessionID`.

3. Canonicalize/validate provider model IDs from live evidence, merge configured overrides into every observed state update, and make runtime state survive kernel/renderer reloads.

## Executive Summary

This branch has the skeleton of model/effort control, but several integration joints are still loose enough that hot-testing will mostly rediscover implementation bugs. The biggest issue is write semantics: `PUT /runtime` persists the override and kills the tmux pane, then returns `restarted: true` without starting a replacement process. That violates the requested respawn-with-args flow and leaves clients to know about a hidden second `reconnect` step. The read side is also uneven. `autoStream` probes on every hook event, including permission events, while OpenCode's actual plugin path never posts runtime state at all. Claude parsing ignores the observed alias reality, so `opus` renders raw and valid-looking Claude slugs are rejected by validation. State handling needs another pass: the in-memory map loses badges on kernel restart, and observed hook updates drop configured override fields, which matters especially for Claude's unobservable effort. Renderer work is incomplete too; the API client and TopBar expose the badge but not model/effort controls. The implementation should also add route-level tests for the new endpoints and a live Codex transcript-path check before trusting the rollout parser. Fix these before hot-tests so live sessions validate provider behavior rather than basic control-flow gaps.

needs rework before hot-test
