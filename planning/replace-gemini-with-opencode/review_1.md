# Review 1: replace Gemini with opencode

## Bottom Line

The plan has the right instinct to put Phase 0 first, but it is not ready to implement after the current assumption matrix. Two assumptions need to become hard blockers before any code is written: whether opencode exposes assistant output in plugin hooks, and whether `permission.ask` can wait for and apply an F-Mark UI decision.

The direct plugin-to-kernel HTTP model is probably the right architecture for opencode, but only if it preserves the existing session-resolution and access-request semantics from `autoStream`. A subprocess bridge would reuse more existing code, but it adds process churn and still needs opencode-specific payload translation; I would prefer direct POSTs plus a small shared adapter/algorithm, not the thinner copy in the current template.

## Blast Radius Completeness

I ran `rg -l "gemini|Gemini|GEMINI" packages` and `find packages -iname '*gemini*'`. The plan covers the main kernel hook/MCP paths, but it misses or under-specifies several real references:

- `packages/kernel/assets/codex-skill/f-mark/SKILL.md:6` points users at the Gemini skill's manual POST flow. This must be rewritten; otherwise the Codex skill will refer to a deleted asset.
- `packages/renderer/src/modals/settings/SettingsModal.tsx:74-80` has the built-in Gemini runtime entry. The plan's renderer file list omits this explicit file, even though Phase 6's broad grep would catch it.
- `packages/renderer/public/agent-icons/gemini-icon.png` is a source asset. The plan mentions icon maps but not the actual public icon asset. Add an opencode icon or intentionally map opencode to `terminal`. Dist copies under `packages/renderer/dist` and `packages/kernel/dist/renderer` should be regenerated, not hand-edited.
- Renderer tests with Gemini references are absent from the plan's test list: `packages/renderer/tests/components/agentChip.test.tsx`, `envProbeBanner.test.tsx`, `plusButton.test.tsx`, `modals/settings/*.test.tsx`, `modals/skills-palette.test.tsx`, and `shell/topBar.test.tsx`.
- Hot scripts missed by the explicit Phase 0 list include `packages/kernel/tests/hot/phase6-guide-hot.mjs` and `packages/kernel/tests/hot/phase16-hook-dump.mjs`.
- `packages/kernel/src/routes/managedAgents.ts` is more than a "verify allowlist" file. It has Gemini-specific native spawn args at `managedAgents.ts:150-168` and terminal access delivery gated to Gemini at `managedAgents.ts:674-678`.
- `packages/kernel/src/hooks/projectTurn.ts:148-160` and `projectTurn.ts:182-186` have real Gemini subagent classification/default-name logic. This is not just a TBD cleanup.

Build artifacts and `*.tsbuildinfo` also contain Gemini strings, but those are rebuild outputs. Do not manually edit them; use a final clean build or ignored grep gate.

## Architectural Soundness

Direct opencode plugin POSTs are sound as the opencode-specific entry point. The SDK exposes in-process async hooks (`~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:170-254`), and the CLI has an official plugin config surface (`index.d.ts:48-51`; local `opencode --pure debug config` showed `"plugin": []`). A subprocess per hook would not avoid opencode-specific mapping; it would just move that mapping into a JSON bridge and pay extra process startup on every event.

The problem is that the proposed template bypasses important behavior:

- Current hooks resolve sessions through `createHookAgentStateStore`, read global and legacy active-session locations, validate `F_MARK_SESSION_ID`, and fall back to the latest session (`packages/kernel/src/hooks/autoStream.ts:78-115`).
- Current permission hooks post an access request and then poll for an access response before returning a runtime decision (`autoStream.ts:911-964`).
- Current turn projection only emits `turn-end` after projected assistant content in the stream path (`packages/kernel/src/hooks/post.ts:22-85`).

Recommendation: keep the direct plugin, but copy or extract the same algorithms for session resolution, access-response polling, and event projection. If extraction is awkward because the plugin is copied into user config, generate a small self-contained helper in the plugin template that mirrors the existing behavior and is tested against the same fixtures.

## Blocking Findings

1. The planned prose hook may post the wrong speaker's text.

The template posts `chat.message` parts as assistant prose (`summary.md:413-426`), but the SDK documents `chat.message` as "Called when a new message is received" and types it as `UserMessage` (`index.d.ts:180-195`). The plan's own A7 only verifies that it fires for user-typed prompts (`summary.md:95`), which would prove the opposite of what F-Mark needs. If opencode does not expose assistant message deltas/final text through `event` or another hook, the plugin architecture cannot provide automatic assistant streaming for the TUI.

Add a blocker assumption: identify the hook/event that contains assistant-visible output, with session ID, message ID, final/delta status, and text parts. If none exists, do not implement the direct prose path as written; fall back to `opencode run --format json` for headless only, MCP/manual POSTs, or delay removal until opencode exposes the needed event.

2. Permission flow fidelity should not be deferred to "future".

The template posts `response_channel: "hook"` but leaves opencode's default `"ask"` status in v1 (`summary.md:442-461`). That creates a broken hybrid: F-Mark will show an approval UI, but approving it will not affect opencode. The existing hook path is synchronous for a reason (`autoStream.ts:923-964`), and the SDK output supports `status: "ask" | "deny" | "allow"` (`index.d.ts:221-223`).

For a Gemini replacement, v1 should await F-Mark's access response and set `output.status`. If A15 fails, the plan should explicitly downgrade opencode access cards to observability-only and avoid presenting UI approval as authoritative. I would treat A6 plus A15 as implementation blockers, not optional fidelity work.

3. MCP detection as written will report stale installs.

The proposed opencode MCP config writes `environment: spec.env` (`summary.md:856`) and the test asserts `environment.F_MARK_MCP_VERSION` (`summary.md:759`). Existing `statusFromServer()` only looks at `server.env.F_MARK_MCP_VERSION` (`packages/kernel/src/mcpInstall/json.ts:41-50`). If the plan calls `statusFromServer(servers?.fmark)` (`summary.md:801-846`), detection will mark a freshly written config as stale.

Hot-test whether opencode accepts `env`, `environment`, or both. Then either write the key that `statusFromServer()` already understands, or add an opencode-specific helper that checks the actual accepted key. Also test existing `opencode.jsonc`; local config commonly uses JSONC, and `readJsonConfig()` currently only parses strict JSON (`json.ts:18-22`).

4. Session correlation is close but weaker than F-Mark's current managed-agent path.

Managed tmux spawn sets `F_MARK_AGENT_ID` (`packages/kernel/src/tmux/manager.ts:72-80`) and passes `F_MARK_RUNTIME_ID`, `F_MARK_PATH`, and optional `F_MARK_SESSION_ID` (`managedAgents.ts:1428-1439`, reconnect at `managedAgents.ts:1094-1105`). Active-session is written only when a spawn request includes `session_id` (`managedAgents.ts:1449-1450`), by `/agents/:id/link` (`packages/kernel/src/routes/agents.ts:52-54`), or during fork handoff (`packages/kernel/src/routes/sessions.ts:514-522`).

The plugin's active-session read from `.f-mark/agents/<id>/active-session` then `F_MARK_SESSION_ID` (`summary.md:377-385`) works for common managed spawns, but it misses the global primary state directory that `createHookAgentStateStore()` reads first (`packages/kernel/src/services/agentState.ts:314-326`), does not validate session existence, and does not fall back to the latest session. Also, Phase 8 says to assert ping registered by checking `active-session` (`summary.md:1126`), but `/agents/:id/ping` only updates presence (`packages/kernel/src/routes/presence.ts:9-17`).

Use the current `autoStream` resolution algorithm as the spec for opencode. Fix the E2E assertion to check presence/ping behavior separately from active-session linkage.

## Install Detection

The comment marker is too brittle. The planned detector extracts `fmark-opencode-plugin-version:` from a comment (`summary.md:321`, `summary.md:593-614`), so a user formatter or edit can make an installed file look missing/stale without changing behavior.

Prefer a generated metadata sidecar, for example `.opencode/plugin/fmark.meta.json`, containing plugin version, sha256 of `fmark.ts`, installed scope, and install time. Detection should verify both sidecar version and file hash. If Phase 0 shows plugins must be registered through `opencode.json`/`opencode.jsonc`, also detect the `plugin` entry as part of hook install status; the SDK config type has an official `plugin?: Array<string | [string, PluginOptions]>` field (`index.d.ts:48-51`).

There is also a scope bug risk: `applyIntegration()` passes a hook `scope` (`packages/kernel/src/mcpInstall/index.ts:296-320`), but the sketched `applyOpencodeHooks(projectRoot?: string)` writes global only when `projectRoot` is undefined (`summary.md:595-599`, `summary.md:664-674`). If `applyAutomaticHookInstall()` always passes `projectRoot`, user-scope opencode installs could accidentally become project installs. Model project/user locations explicitly in `DetectResult.locations`.

## Capabilities

The plan is too pessimistic on opencode capabilities and wrong on one CLI flag:

- Local `opencode --version` is `1.15.11`.
- `opencode run --help` shows prompt text is positional. `-p` is `--password`, so A10's `opencode run -p "<prompt>" --format json` is wrong (`summary.md:98`). Use `opencode run --format json "hello"`.
- `opencode run --help` exposes `--session`, `--fork`, and `--share`. The planned fork capability (`summary.md:940`) should be hot-tested, not left as a guessed string.
- A strings probe of the local opencode binary found slash commands including `/clear`, `/compact`, `/compress`, `/fork`, `/share`, `/unshare`, `/undo`, `/redo`, `/new`, `/help`, `/model`, and `/agent`. That is not a substitute for a TTY hot test, but it means `compact_command: null` (`summary.md:933`) is likely premature.

Add a TTY-based hot test for `/clear`, `/compact`, `/fork`, and whether `command.execute.before` fires for slash commands (`index.d.ts:224-230`). Then update `packages/kernel/src/agents/capabilities.ts:83-108` from evidence.

## Assumption Matrix Gaps

Promote or add these assumptions before implementation:

- Assistant output hook: which hook/event contains assistant text, and is it final, delta, or replay?
- End-of-turn semantics: does `session.idle` fire after tool-free turns, errored turns, interrupted turns, and while a permission prompt is pending?
- MCP tool naming: the template skips only `mcp__fmark__` (`summary.md:430-431`), but opencode may use a different MCP tool naming scheme. Verify before dedupe.
- Permission payload shape: does `permission.ask` include session/tool/call IDs, and do allow/deny outputs map cleanly to opencode behavior?
- Tool failure shape: `tool.execute.after` output has `title`, `output`, and `metadata` (`index.d.ts:245-254`), but no typed success flag. Do not hard-code `success: true` (`summary.md:432-439`) until errors are observed.
- Plugin load mechanism: A1/A2 assume auto-loading from `.opencode/plugin`, but the installed config shows an official `plugin` array. Test auto-load and the config-array fallback.
- Config file precedence: opencode loads user/project config, often JSONC. Test `opencode.json` vs `opencode.jsonc` precedence before writing user config.
- Template typecheck should use the locally bundled SDK version as well as any npm "latest"; this machine has CLI `1.15.11` with plugin package `1.14.33`, and the runtime's bundled types are what matter.

Some assumptions are overlapping: A1 and A16 both test TS plugin loading, and A2/A14 overlap on global plugin positive/negative behavior. Keep them if useful, but the missing assistant-output and permission-decision tests are much more important.

## Test and Typecheck Gap

The plan does include `pnpm -w typecheck` later (`summary.md:966-969`, `summary.md:1158`), but that is too late for this repo's known "tests pass while types are broken" failure mode. Also `RuntimeId` is effectively open-ended because it is `"claude" | "codex" | "gemini" | string` (`packages/shared/src/integrations.ts:1`), so TypeScript will not catch many leftover runtime strings.

Add a typecheck after each TS-heavy phase: hooks installer, MCP installer, runtime/capabilities, hook cleanup, and renderer. The final gate should include:

- `pnpm -w typecheck`
- `pnpm -w test`
- targeted kernel and renderer tests touched by the grep
- `rg -n "gemini|Gemini|GEMINI" packages --glob '!**/dist/**' --glob '!**/*.tsbuildinfo'`

## Phase Ordering

Phase 0 is early enough, but it needs harder stop conditions. The current stop condition only mentions missing session IDs (`summary.md:297-299`). It should also stop if assistant output is not available, plugin fetch cannot post, MCP config shape is wrong, or `permission.ask` cannot block and apply a decision.

I would also reorder later work:

- Add opencode in parallel first.
- Hot-test the opencode E2E before deleting Gemini.
- Only after opencode can post assistant prose, tool-use, turn-end, MCP status, and permission decisions should Phase 7 delete Gemini (`summary.md:1073`).
- Move the managed-agent spawn/readiness check earlier. `managedAgents.ts:150-170` defaults unknown runtimes to tmux prompt injection; that may work for opencode, but it needs a TUI probe before the runtime is declared supported.

## Reversibility Branches

The plan has a brief risk section (`summary.md:1188-1194`), but it needs concrete branches:

- If plugin auto-load fails: install via `opencode.json`/`opencode.jsonc` `plugin` entry, or package a local npm module and use opencode's plugin registration model.
- If assistant output is unavailable in plugin hooks: do not ship auto-streaming from `chat.message`; use headless JSON events only where applicable, MCP/manual posting, or keep Gemini until opencode exposes output hooks.
- If permission blocking fails: mark access requests as observability-only, remove/disable UI approval for opencode, or build a verified terminal-delivery path. Do not post `response_channel: "hook"` without consuming responses.
- If session correlation is unreliable: add a kernel endpoint or generated sidecar to resolve the active F-Mark session instead of direct file reads.
- If MCP config shape differs: split `statusFromOpencodeServer()` from generic `statusFromServer()` and support both JSON and JSONC config locations.

## Other Pushback

The plugin's `event: session.idle` turn-end can emit empty turns if no assistant prose has actually been posted (`summary.md:462-472`). Gate turn-end on having posted assistant content for that session/turn.

`packages/kernel/src/skills/scanner.ts:6` hardcodes known agent skill roots. Replacing Gemini with opencode there changes skill discovery behavior, so include tests for `.opencode/skills` if that directory is part of the intended skill story.

`packages/renderer/src/components/ParticipantAvatar.tsx:4-37` has no opencode avatar kind, and runtime/name detection only recognizes Gemini at `ParticipantAvatar.tsx:58` and `ParticipantAvatar.tsx:71`. Decide whether opencode gets a real asset or intentionally falls through to terminal, then update tests accordingly.
