# Replace Gemini with Opencode — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Hot-test every assumption flagged with `🔥` against a live opencode session before relying on it.

## Triage of `review_2.md` (Codex)

Review #2 confirmed disposition of all 22 review_1 findings (most lands, 4 partial flagged). New issues addressed in this same revision:

| # | review_2 issue | Disposition |
|---|----------------|-------------|
| R2-1 | Plugin used nonexistent `GET /sessions/:id` and treated `GET /sessions` response as array | **FIXED**. New `resolveValidatedFmarkSessionId` lists `/sessions` once, intersects candidates, falls back to `sessions[0].id`. |
| R2-2 | Access-response polling used `?kind=` (singular) and array unwrap | **FIXED**. Now `?kinds=access-response` and unwraps `{events: [...]}`. Verified against `routes/events.ts:654-678`. |
| R2-3 | Hook install scope plumbing inconsistent (`local`/`global` vs `project`/`user`) | **FIXED**. Step 2.5 explicitly maps `global → user`, `local|project → project`. |
| R2-4 | Phase 5 snippet returned `{executable, env}` but `spawnArgsForRuntime` only returns `{args, nativeNameApplied, launchPromptDelivery}` | **FIXED**. Step 5.2 rewritten to match the real signature; uses `--prompt <text>` for native delivery. |
| R2-5 | Plugin registration fallback (opencode.json `plugin` array) underspecified | **FIXED**. New Step 2.9 adds the fallback gated on Phase 0 A1/A2 results. |
| R2-6 | JSONC stripper missed trailing commas | **FIXED**. Step 3.3.b switches to `jsonc-parser` npm package. |
| R2-7 | Phase 8 autoStream deletion should be surgical (keep claude/codex paths intact) | **AGREED — already explicit**. Step 8.3 lists exact line ranges (`:233-281`, `:262`, `:458-459, 482, 488, 517`) and the rest is untouched. |
| R2-8 | Six more stop conditions for Phase 0 | **FIXED**. Stop conditions expanded from 6 to 12. |
| R2-9 | Triage row 19 said `.opencode/skills` test in Phase 7, body didn't have it | **FIXED**. Phase 6.3 ADDs `opencode-skill`; add explicit assertion to E2E test in Phase 7.1 that scanner returns the opencode-skill. |
| R2-10 | A0 partial-pass case (deltas only, no final marker) | **ADDED to stop conditions** (#2). If only deltas exist, plan needs an accumulator step. |

Verdict: thumbs-up to begin Phase 0 hot-tests. Phase 1 cannot begin until Phase 0 verdict matrix is in.

---

## Triage of `review_1.md` (Codex)

| # | Finding | Disposition |
|---|---------|-------------|
| 1 | `chat.message` is `UserMessage` — current template posts user input as assistant prose | **FIX (architectural)**. Plugin must use `event` hook filtered on `message.part.updated`/`message.part.delta`/`message.updated` for assistant text; remove `chat.message`-as-prose path entirely. SDK `Event` union confirms: `EventMessageUpdated`, `EventMessagePartUpdated`, `EventMessagePartDelta` exist. |
| 2 | Permission flow can't be "future" — `response_channel: "hook"` without consumption = broken UI promise | **FIX**. Make sync block + access-response polling a v1 requirement; if A15 (sync block) fails, downgrade to `response_channel: "terminal"` (observability) and remove the approval UI promise. |
| 3 | MCP `environment` write vs `env` detection mismatch — fresh installs flagged stale | **FIX**. Hot-test which key opencode accepts (`A11.1` new). If only `environment`, add `statusFromOpencodeServer` helper. If both work, use `env` to match existing `statusFromServer`. |
| 4 | Session correlation weaker than `autoStream` (no global state dir, no validation, no latest fallback) | **FIX**. Plugin must mirror `autoStream.ts:78-115` + `agentState.ts:314-326`. Extract a small helper that the plugin can call. |
| 5 | Missed blast radius: `codex-skill/SKILL.md:6`, `SettingsModal.tsx:74-80`, renderer tests, `gemini-icon.png`, `managedAgents.ts:150-168` + `:674-678`, `projectTurn.ts:148-160` + `:182-186`, `phase6-guide-hot.mjs`, `phase16-hook-dump.mjs` | **FIX**. Added to "Files to modify" below. |
| 6 | Comment-marker version detection is brittle | **FIX**. Use `.opencode/plugin/fmark.meta.json` sidecar with `{version, sha256, scope, installed_at}`. Detection verifies both. |
| 7 | Scope bug: `applyOpencodeHooks(projectRoot?)` writes global only when undefined, but `applyAutomaticHookInstall` always passes projectRoot | **FIX**. Add explicit `scope: "project" | "user"` param, drop the implicit-undefined branch. |
| 8 | A10's `-p` flag is `--password` not prompt | **FIX**. Use positional `opencode run --format json "hello"`. |
| 9 | Capabilities too pessimistic — opencode has `/compact`, `/compress`, `/clear`, `/fork`, `/share` | **FIX**. Set `compact_command: "/compact"`, `clear_command: "/clear"`, hot-test `/fork` and add to capabilities. |
| 10 | JSONC support — `opencode.jsonc` is common; `readJsonConfig` parses strict JSON only | **FIX**. Detection must probe both `.json` and `.jsonc`; apply prefers existing file if either present, defaults to `.json` if neither. Extend `readJsonConfig` with a `parseJsonOrJsonc` path. |
| 11 | Phase ordering — delete gemini before E2E proves opencode works | **FIX**. Move deletion to AFTER hot E2E (Phase 7 = E2E, Phase 8 = deletion). Add opencode in parallel first. |
| 12 | `session.idle` turn-end can emit empty turns if no assistant prose posted | **FIX**. Plugin tracks "posted-content-since-last-turn-end" per session; emits turn-end only if true. |
| 13 | MCP tool naming for dedup — template skips `mcp__fmark__` but opencode may use different naming | **HOT-TEST (A17)**. If different, generalize the prefix to a runtime-provided pattern. |
| 14 | Tool failure shape: hardcoded `success: true` | **FIX**. Inspect `output`/`metadata` for opencode's error convention during Phase 0; default to inferred success only after evidence. |
| 15 | Plugin load mechanism — A1/A2 assume auto-load from `.opencode/plugin`, but SDK config has official `plugin?: string[]` field | **FIX**. Hot-test BOTH: auto-load AND `opencode.json.plugin = ["fmark"]` config-array. If only the latter works, install also writes to opencode.json. |
| 16 | Config file precedence (json vs jsonc) | **HOT-TEST (A18)**. |
| 17 | Template typecheck must use locally bundled SDK (1.14.33) not npm latest | **FIX**. Step 1.2 uses `~/.config/opencode/node_modules/@opencode-ai/plugin` for typecheck. |
| 18 | E2E check of `active-session` confuses ping with link | **FIX**. Phase 9 E2E checks presence separately from link state. |
| 19 | Skill discovery — `scanner.ts:6` hardcoded; replacing gemini changes discovery | **FIX**. Phase 7 includes a test that `.opencode/skills` discovery works. |
| 20 | Subprocess-vs-direct architecture trade-off | **AGREE with Codex** — direct plugin + small shared helper is right. No change. |
| 21 | Add typecheck gate after each TS-heavy phase, not only at end | **FIX**. Every phase ends with `pnpm -F kernel typecheck` step before commit. |
| 22 | `RuntimeId = "..." | string` is too loose to catch leftover gemini strings | **FIX**. Final gate adds `rg -n 'gemini\|Gemini\|GEMINI' packages --glob '!**/dist/**' --glob '!**/*.tsbuildinfo'` and fails if non-zero. |

---

**Goal:** Remove the Gemini integration (`gemini` runtime) and replace it with `opencode` (sst/opencode v1.15.x), reusing F-Mark's existing hook/MCP install dispatchers and tmux-managed-agent infrastructure, while accommodating opencode's different extension model (in-process TS plugins instead of declarative JSON hook config).

**Architecture:**
- **Hooks**: opencode does not support subprocess-based hooks via config. F-Mark installs an `.opencode/plugin/fmark.ts` (or global `~/.config/opencode/plugin/fmark.ts`) plugin module that subscribes to opencode's in-process hooks and POSTs directly to the existing kernel HTTP endpoints (`/sessions/<id>/events/{prose,tool-use,access-request,turn-end}`). No new kernel endpoints needed.
  - **Assistant text**: `event` hook filtered on `EventMessageUpdated` / `EventMessagePartUpdated` / `EventMessagePartDelta` (SDK type union `gen/types.gen.d.ts:602`). `chat.message` is `UserMessage` (per SDK `index.d.ts:183-195`) and is therefore the USER side — used only for `user`-kind prose posting.
  - **Tool use**: `tool.execute.after` — input from `args`, output from `output`/`metadata`. Success/failure inferred from the metadata shape (verified in Phase 0).
  - **Permissions**: `permission.ask` — posts an `access-request` event AND blocks awaiting an `access-response` event from F-Mark UI, then returns the decision via `output.status` (`"allow" | "deny" | "ask"`). If A15 proves opencode does not tolerate long-blocking returns, degrades to terminal-channel observability only.
  - **Turn end**: `event` on `EventSessionIdle` — but only emitted if assistant content has been posted since the previous turn-end (avoids empty turns).
  - **Session resolution**: mirrors `autoStream.ts:78-115` + `agentState.ts:314-326` (env → payload → active-session file → latest valid session, with `sessionExists` validation). Extracted into a small in-plugin helper.
- **MCP**: opencode supports stdio MCP via `opencode.json[c]` `mcp.<name>` (`type: "local"`, `command: [argv...]`, `environment: {...}`). Detection probes both `.json` and `.jsonc` and uses the existing file; apply defaults to `.json`. Status check uses an opencode-specific helper (`statusFromOpencodeServer`) because the env key is `environment` not `env`.
- **Plugin install registration**: hot-test confirms whether opencode auto-loads `.opencode/plugin/*.ts` or requires `opencode.json[c].plugin = [...]`. Install writes both as belt-and-suspenders if needed; detection verifies via sidecar `.opencode/plugin/fmark.meta.json` (`{version, sha256, scope, installed_at}`) — robust to user edits.
- **Runtime control**: opencode TUI runs unchanged in the existing tmux manager. Headless one-shots use `opencode run --format json "<prompt>"` (prompt is positional; `-p` is `--password`). Session ID exposed on every plugin hook.

**Tech Stack:** TypeScript (Node 20+), `@opencode-ai/plugin` SDK (v1.14.33+ cached at `~/.config/opencode/node_modules/@opencode-ai/plugin/`), Bun-compatible fetch (the plugin runs inside opencode which uses Bun runtime), Vitest for unit tests, existing F-Mark integration test harness for hot tests.

---

## Blast Radius

### Files to delete (Gemini code)
- `packages/kernel/src/hooksInstall/gemini.ts`
- `packages/kernel/src/mcpInstall/gemini.ts`
- `packages/kernel/tests/hooksInstall/gemini.test.ts`
- `packages/kernel/assets/gemini-skill/` (whole directory: `f-mark/SKILL.md`, `f-mark/api.md`)
- Built artifacts under `packages/kernel/dist/{hooksInstall,mcpInstall}/gemini.{js,d.ts}` (will regenerate)

### Files to create (Opencode code + assets)
- `packages/kernel/src/hooksInstall/opencode.ts` — install/detect/render the plugin file
- `packages/kernel/src/mcpInstall/opencode.ts` — install/detect the MCP server in `opencode.json`
- `packages/kernel/assets/opencode-plugin/fmark.ts` — the plugin template (copied into user/project on install)
- `packages/kernel/assets/opencode-skill/f-mark/SKILL.md` — skill docs (analog to gemini-skill)
- `packages/kernel/assets/opencode-skill/f-mark/api.md` — API reference
- `packages/kernel/tests/hooksInstall/opencode.test.ts`
- `packages/kernel/tests/mcpInstall/opencode.test.ts`

### Files to modify (replace `gemini` → `opencode` references)

**Kernel (src):**
- `packages/kernel/src/hooksInstall/index.ts:14-19, 39-42, 77-83, 155-162` — swap import + runtime branch
- `packages/kernel/src/mcpInstall/index.ts:16, 26, 73, 153` — swap import + dispatchers, also update `executableFor` allowlist
- `packages/kernel/src/runtimes/defaults.ts:6` — swap entry
- `packages/kernel/src/agents/capabilities.ts:83-108` — replace `gemini` capability entry with `opencode`. Use `/compact` (confirmed in `opencode` strings probe), `/clear`, `/fork` (still hot-test interactive behavior — `command.execute.before` may fire for slash commands per SDK `index.d.ts:224-230`)
- `packages/kernel/src/routes/managedAgents.ts:150-168` — Gemini-specific tmux spawn args (must rewrite for opencode; opencode TUI launches with `opencode <project>`)
- `packages/kernel/src/routes/managedAgents.ts:674-678` — Gemini-specific terminal-channel access delivery gate (rewrite or remove; opencode permission goes through `permission.ask` plugin hook, not terminal injection)
- `packages/kernel/src/routes/guide.ts` — if it renders runtime-specific install copy
- `packages/kernel/src/skills/scanner.ts:6` — hardcoded `gemini-skill` path in known agent skill roots
- `packages/kernel/src/hooks/autoStream.ts:233-281` — gemini-specific `Notification`/`ToolPermission` access-request branch (DELETE — opencode doesn't go through this subprocess at all)
- `packages/kernel/src/hooks/autoStream.ts:262` — `runtime_id ?? "gemini"` fallback (replace with `"unknown"` or drop)
- `packages/kernel/src/hooks/autoStream.ts:458-459, 482, 488, 517` — `invoke_agent` Gemini sub-agent extraction (DELETE)
- `packages/kernel/src/hooks/projectTurn.ts:148-160, 182-186` — Gemini subagent classification + default-name logic (DELETE; not a TBD — real code to remove)
- `packages/kernel/src/mcpInstall/json.ts:53-69` — drop `statusFromGeminiServer`. Add `statusFromOpencodeServer` (checks `environment.F_MARK_MCP_VERSION` instead of `env.F_MARK_MCP_VERSION` — opencode config uses `environment`)
- `packages/kernel/src/mcpInstall/json.ts:18-22` — extend `readJsonConfig` to parse JSONC (strip `// …` and `/* … */`) so opencode.jsonc works
- `packages/kernel/assets/codex-skill/f-mark/SKILL.md:6` — points users at the Gemini-skill manual POST flow; rewrite to point at opencode-skill or remove cross-reference

**Kernel (config):**
- `packages/kernel/.f-mark/runtimes.json:18-24` — swap entry
- `packages/kernel/.f-mark/AGENT.md` — if it documents runtimes
- `packages/kernel/assets/AGENT.md` — same

**Shared types:**
- `packages/shared/src/integrations.ts:1` — `RuntimeId = "claude" | "codex" | "opencode" | string` (remove gemini)
- `packages/shared/src/participants.ts` — any runtime allowlist

**Renderer:**
- `packages/renderer/src/runtimes.ts` — runtime labels/icons map
- `packages/renderer/src/modals/IntegrationSetupModal.tsx` — runtime-specific copy
- `packages/renderer/src/modals/settings/SettingsModal.tsx:74-80` — built-in Gemini runtime entry (Codex-found; not in original list)
- `packages/renderer/src/modals/settings/RuntimesPanel.tsx` — list entries
- `packages/renderer/src/modals/settings/HookStatusPanel.tsx`
- `packages/renderer/src/modals/SkillsPaletteModal.tsx`
- `packages/renderer/src/modals/skills/sources.ts`, `active-agent.ts`
- `packages/renderer/src/api/client.ts` — if any gemini-specific endpoint helpers
- `packages/renderer/src/components/ParticipantAvatar.tsx:4-37, 58, 71` — avatar `kind` enum + name-detection branches must add opencode (or intentionally map to terminal fallback; decide + test)
- `packages/renderer/.f-mark/runtimes.json`, `packages/renderer/.f-mark/AGENT.md`

**Renderer public assets:**
- Add `packages/renderer/public/agent-icons/opencode-icon.png` (or intentionally map opencode to the generic terminal icon; decide before Phase 6)
- Existing `packages/renderer/public/agent-icons/gemini-icon.png` removed in Phase 9 (deletion phase)

**Tests (kernel):**
- `packages/kernel/tests/reconcile.test.ts`
- `packages/kernel/tests/project.test.ts`
- `packages/kernel/tests/routes/runtimes.test.ts`
- `packages/kernel/tests/routes/guide.test.ts`
- `packages/kernel/tests/routes/envProbe.test.ts`
- `packages/kernel/tests/routes/hookInstall.test.ts`
- `packages/kernel/tests/hooks/autoStream.test.ts` — gemini-shaped fixtures
- `packages/kernel/tests/mcpInstall/integration.test.ts`

**Tests (renderer) — Codex-found additions:**
- `packages/renderer/tests/components/agentChip.test.tsx`
- `packages/renderer/tests/components/envProbeBanner.test.tsx`
- `packages/renderer/tests/components/plusButton.test.tsx`
- `packages/renderer/tests/modals/settings.test.tsx`
- `packages/renderer/tests/modals/settings/hookStatusPanel.test.tsx`
- `packages/renderer/tests/modals/settings/runtimesPanel.test.tsx`
- `packages/renderer/tests/modals/skills-palette.test.tsx`
- `packages/renderer/tests/shell/topBar.test.tsx`

**Hot test scripts** (`packages/kernel/tests/hot/*.mjs`):
- `phase4-mcp-stdio-hot.mjs`, `phase5-mcp-real-agents-hot.mjs`, `phase6-guide-hot.mjs` (Codex-added), `phase7-preflight-hot.mjs`, `phase8-integration-apply-hot.mjs`, `phase9-spawn-sequencing-hot.mjs`, `phase10-integration-ui-hot.mjs`, `phase11-mcp-full-tools-hot.mjs`, `phase12-wake-inbox-hot.mjs`, `phase13-agent-controls-hot.mjs`, `phase14-agents-ui-hot.mjs`, `phase15-mentions-targeting-hot.mjs`, `phase16-access-requests-hot.mjs`, `phase16-hook-dump.mjs` (Codex-added if it exists; grep showed it), `phase18-session-fork-vendors-hot.mjs`, `phase19-subagent-{backend,vendors}-hot.mjs`, `phase20-subagent-ui-hot.mjs`, `phase22-http-mcp-hot.mjs`, `phase23-full-vendor-e2e-hot.mjs`

---

## Assumptions to Hot-Test 🔥

Each assumption must be validated against a live opencode session before any code path depends on it. Save outputs to `planning/replace-gemini-with-opencode/hot-tests/<NN-name>.md`.

**Hard blockers (🛑)** — if any fail, STOP and re-plan before writing kernel code. The plan as written assumes all 🛑 pass.

| # | Assumption | How to verify |
|---|---|---|
| **A0 🛑** | **There is a hook that exposes assistant-visible output** — message-part `event`s (`EventMessagePartUpdated`, `EventMessagePartDelta`, or `EventMessageUpdated` per SDK `gen/types.gen.d.ts:602`) deliver assistant text with session ID, message ID, and clear final-vs-delta indication. | Probe plugin logs every `event` to `/tmp/opencode-probe.log`. Run `opencode run "tell me a joke"`. Inspect log: assistant text must appear in `event.payload.properties` (or equivalent). Identify the exact event type + payload field. If only deltas exist, design accumulator. If no event exposes assistant output, plugin cannot stream prose — fall back to MCP-only posting or keep gemini until opencode adds the hook. |
| **A6 🛑** | `permission.ask` is called for tool uses (not only shell), and the plugin returning `output.status = "deny"` actually blocks the tool. | Configure a permission rule that triggers ask, deny from plugin, verify tool was not executed (check `tool.execute.after` didn't fire). |
| **A15 🛑** | `permission.ask` tolerates the plugin awaiting an external event (F-Mark access-response) for at least 60s without erroring or timing out the agent turn. | Plugin in `permission.ask` awaits a 30s `setTimeout`, then sets status. Verify opencode does not error and the decision is honored. |
| A1 | A `.ts` file in `.opencode/plugin/<name>.ts` is auto-loaded by opencode without requiring an explicit `plugin: [...]` entry in `opencode.json`. | Drop a minimal plugin that writes to `/tmp/oc-probe.log` on init, run `opencode run "hi" --print-logs`, confirm log appears. |
| A2 | A `.ts` file in `~/.config/opencode/plugin/fmark.ts` is auto-loaded globally for all projects. | Same as A1 but in global path; run `opencode run` from a fresh dir. |
| A3 | Plugin can do `fetch("http://localhost:<port>/...")` without being killed by opencode's runtime sandbox or blocking the agent loop. | Plugin posts to a netcat listener; verify request arrives within 1s of an event. |
| A4 | `event` hook with `event.type === "session.idle"` fires reliably at end-of-turn AND exposes the session ID, AND fires consistently across tool-free turns, errored turns, interrupted turns. | Inspect raw payload via probe plugin. Run 4 scenarios (chat-only, with-tool, with-error, with-interrupt) and verify `session.idle` for each. |
| A5 | `tool.execute.after` provides both structured `args` (input) and `output`/`metadata` (result), AND failures are distinguishable (probably via `output` content / `metadata.error` / thrown exception in `tool.execute.before`). | Probe plugin logs all `tool.execute.before/after`. Run a turn that uses `read` on existing file (success) + a turn that uses `read` on missing file (failure). Compare shapes. |
| A7 | `chat.message` fires for user-typed prompts; `message.parts` contains the prompt text as `type: "text"` parts. | Logging plugin; type a prompt; inspect captured payload. |
| A8 | `F_MARK_AGENT_ID`, `F_MARK_PATH`, `F_MARK_SESSION_ID` env vars set by the tmux manager are visible to the plugin via `process.env`. | Plugin reads `process.env.F_MARK_AGENT_ID` on init, posts to logger; launch via tmux manager, verify env propagates. |
| A9 | Throwing or returning a rejected promise from a non-permission hook does NOT crash the opencode session. | Plugin throws in `event` hook; verify subsequent turns still work. |
| A10 | `opencode run --format json "<prompt>"` (positional prompt; `-p` is `--password`) outputs a parseable JSON event stream for headless flows. | Run `opencode run --format json "hello"` and inspect stdout shape. |
| A11 | `opencode.json[c].mcp.fmark` with `type: "local"`, `command: [...]` (array), `environment: {...}` makes the fmark MCP server reachable; `mcp__fmark__*` (or runtime-equivalent) tools appear. | Apply MCP install, launch opencode, run `opencode mcp` or invoke a tool. |
| **A11.1** | Which env-vars key does opencode accept on MCP server entries — `env`, `environment`, or both? `statusFromServer` currently keys off `env.F_MARK_MCP_VERSION` (`json.ts:41-50`); a mismatch makes fresh installs read as stale. | Apply with both keys (one config per probe), restart opencode each time, run `opencode mcp list` and check which exposes env vars. |
| A12 | Opencode's session ID is a stable string suitable for `runtime_session_id` (no characters that break JSON paths or filenames). | Capture 5 session IDs from `event` hooks. Regex against `^[A-Za-z0-9._-]+$`. |
| A13 | Replacing the plugin file does NOT require restarting opencode (or, if it does, document the requirement). | Edit plugin while session is open, trigger a hook, see if new code runs. |
| A14 | `opencode --pure` skips plugins (negative-control test: confirms plugin path is the ONLY mechanism we rely on). | Run `opencode --pure run "hi"` and confirm probe does NOT log. |
| A16 | The opencode plugin file can be valid TS with no `tsconfig.json` setup needed (opencode runs it with its bundled TS support); typecheck succeeds against the LOCALLY BUNDLED SDK at `~/.config/opencode/node_modules/@opencode-ai/plugin` (1.14.33). | Use `npx tsc --noEmit` referencing local SDK; do NOT use npm `latest`. |
| **A17** | MCP tool naming inside opencode for our fmark server — is it `mcp__fmark__<tool>` (Claude convention) or something else (e.g. `fmark__<tool>` or `fmark.<tool>`)? Affects dedup-skip logic in plugin. | After A11 success, run `opencode run "list available MCP tools"` or check `opencode mcp` output. Record the exact prefix. |
| **A18** | Config-file precedence — does opencode prefer `opencode.json` or `opencode.jsonc` when both exist? Does it accept JSONC (comments) in `opencode.json`? | Create both with conflicting `mcp.fmark` blocks, launch opencode, verify which wins. Then test JSONC in `opencode.json`. |
| **A19** | Plugin load mechanism alternatives — does `opencode.json.plugin = ["./plugin/fmark.ts"]` (or npm-package string) also work? Belt-and-suspenders install option if A1 fails. | Set `plugin: ["./plugin/fmark.ts"]` in opencode.json with no auto-load dir, run, verify probe loads. |
| **A20** | Slash-command behavior — `/compact`, `/clear`, `/fork`, `/share` all exposed; does `command.execute.before` plugin hook fire when user types them in the TUI? | Interactive smoke (open opencode TUI in a tmux pane, type `/compact`, check probe log). |

**Stop conditions for Phase 0** — any of these halts implementation:
1. A0 fails (no assistant-output hook) → fall back to MCP-only or keep gemini.
2. **A0 partial — only deltas, no `status: completed` marker or stable message_id** → must add an in-plugin accumulator with dedupe key. Plan needs a new sub-step before Phase 1.
3. **A0/A4 missing opencode session ID on assistant/idle events** → no way to correlate text to a turn. Block.
4. A4 `session.idle` absent, early, or not correlated after tool-free / error / interrupted / permission-pending turns → cannot reliably emit turn-end; plan must replace with a different turn-end signal (e.g. message-part with `status: completed` on the last assistant part).
5. A6 fails (no permission gating) → permission UI cannot promise blocking; downgrade to observability with explicit user-visible label.
6. A15 fails (sync block disallowed) → permission flow becomes fire-and-forget; degrade UI accordingly.
7. **A6/A15 pass but `permission.ask` lacks enough identity (request_id / sessionID / callID) to match a UI response** → either kernel must mint a request_id and write it into the event before agent visibility (already done in plugin), OR a new opencode-side correlation key is needed.
8. A3 fails (no HTTP from plugin) → architectural redesign needed (subprocess bridge).
9. A8 fails (no env propagation) → need sidecar-file mechanism written by tmux manager.
10. A11 fails (MCP doesn't load) → integration is partial; document limitation.
11. **A1 AND A19 both fail** (no working plugin load path at all) → abort, keep gemini.
12. **Kernel access-response polling cannot observe responses** with the `GET /sessions/:id/events?kinds=access-response` route (verified in plan) → either kernel route needs adjustment, or plugin polls a different endpoint. Re-plan permission flow.

---

## File Structure (created/modified summary)

```
packages/kernel/
├── assets/
│   ├── opencode-plugin/
│   │   └── fmark.ts                       # NEW: plugin template (string-substituted at install)
│   └── opencode-skill/
│       └── f-mark/
│           ├── SKILL.md                   # NEW
│           └── api.md                     # NEW
├── src/
│   ├── hooksInstall/
│   │   ├── opencode.ts                    # NEW: detect/apply/render the plugin file
│   │   └── index.ts                       # MOD: dispatch opencode runtime, drop gemini
│   ├── mcpInstall/
│   │   ├── opencode.ts                    # NEW: detect/apply MCP server in opencode.json
│   │   ├── index.ts                       # MOD: dispatch opencode, drop gemini
│   │   └── json.ts                        # MOD: drop statusFromGeminiServer
│   ├── runtimes/defaults.ts               # MOD: replace gemini entry
│   ├── agents/capabilities.ts             # MOD: opencode capability profile
│   ├── hooks/autoStream.ts                # MOD: drop gemini-specific code paths
│   └── hooks/projectTurn.ts               # MOD: drop gemini-specific projection (TBD)
├── tests/
│   ├── hooksInstall/opencode.test.ts      # NEW
│   ├── mcpInstall/opencode.test.ts        # NEW
│   └── …                                   # MOD: replace gemini fixtures in shared tests
└── .f-mark/runtimes.json                  # MOD: replace gemini entry

packages/shared/src/
├── integrations.ts                        # MOD: RuntimeId union
└── participants.ts                        # MOD: runtime allowlist (if present)

packages/renderer/src/
├── runtimes.ts                            # MOD: label/icon map
├── modals/IntegrationSetupModal.tsx       # MOD
├── modals/settings/RuntimesPanel.tsx      # MOD
├── modals/settings/HookStatusPanel.tsx    # MOD
├── modals/SkillsPaletteModal.tsx          # MOD
├── modals/skills/{sources,active-agent}.ts # MOD
└── components/ParticipantAvatar.tsx       # MOD

planning/replace-gemini-with-opencode/
├── summary.md                             # THIS FILE
├── hot-tests/                             # Hot-test reports per A1–A16
└── review_NNNN.md                         # Buddy reviews
```

---

## Phases & Tasks

### Phase 0: Hot-Test Assumptions (foundational)

**Why first:** Every later task assumes the plugin model behaves as researched. We need ground truth before writing the adapter.

**Files:**
- Create: `planning/replace-gemini-with-opencode/hot-tests/probe-plugin.ts` (throwaway probe plugin)
- Create: `planning/replace-gemini-with-opencode/hot-tests/<NN>.md` for each assumption result

- [ ] **Step 0.1: Write the probe plugin**

```typescript
// planning/replace-gemini-with-opencode/hot-tests/probe-plugin.ts
// Drop a symlink/copy of this into ~/.config/opencode/plugin/probe.ts
import type { Plugin } from "@opencode-ai/plugin";
import { appendFile } from "node:fs/promises";

const LOG = "/tmp/opencode-probe.log";

async function log(label: string, payload: unknown): Promise<void> {
  const line = JSON.stringify({ t: new Date().toISOString(), label, payload }) + "\n";
  await appendFile(LOG, line).catch(() => {});
}

export const ProbePlugin: Plugin = async (input) => {
  await log("init", {
    pid: process.pid,
    cwd: process.cwd(),
    directory: input.directory,
    worktree: input.worktree,
    serverUrl: input.serverUrl?.toString?.(),
    env_F_MARK_AGENT_ID: process.env.F_MARK_AGENT_ID ?? null,
    env_F_MARK_PATH: process.env.F_MARK_PATH ?? null,
    env_F_MARK_SESSION_ID: process.env.F_MARK_SESSION_ID ?? null,
  });
  return {
    // A0/A4 — capture EVERY event in full to find the assistant-output hook
    event: async ({ event }) => { await log("event", event); },
    // A7 — verify chat.message is USER side (per SDK types)
    "chat.message": async (i, o) => { await log("chat.message", { i, parts: o.parts, message: o.message }); },
    // A5 — verify tool input/output/failure shape
    "tool.execute.before": async (i, o) => { await log("tool.execute.before", { i, args: o.args }); },
    "tool.execute.after": async (i, o) => { await log("tool.execute.after", { i, output: o.output, metadata: o.metadata, title: o.title }); },
    // A6/A15 — verify permission gating and sync block tolerance
    "permission.ask": async (i, o) => {
      await log("permission.ask:in", { permission: i, currentStatus: o.status });
      // observability only by default — overridden in specific A6/A15 probes
    },
    "shell.env": async (i, o) => { await log("shell.env", { i, env_keys: Object.keys(o.env || {}) }); },
    "command.execute.before": async (i, o) => { await log("command.execute.before", { i, parts_len: o.parts?.length }); },
  };
};

export default ProbePlugin;
```

- [ ] **Step 0.2: Install probe globally and run a one-shot**

```bash
mkdir -p ~/.config/opencode/plugin
cp planning/replace-gemini-with-opencode/hot-tests/probe-plugin.ts ~/.config/opencode/plugin/probe.ts
rm -f /tmp/opencode-probe.log
opencode run --print-logs "say hi briefly" 2>&1 | tail -30
sleep 1
cat /tmp/opencode-probe.log
```

Expected: `init` line present (confirms A1/A2/A8), at least one `event` line, possibly `chat.message`. Capture output to `planning/replace-gemini-with-opencode/hot-tests/01-plugin-loads.md`.

- [ ] **Step 0.3: Verify env propagation by launching via env-set wrapper**

```bash
F_MARK_AGENT_ID=ag-probe F_MARK_PATH=/tmp F_MARK_SESSION_ID=fs-probe opencode run "hi" --print-logs 2>&1 | tail -5
cat /tmp/opencode-probe.log | grep '"label":"init"' | tail -1
```

Expected: the `env_F_MARK_*` fields in the `init` log are non-null. Capture to `02-env-propagation.md`.

- [ ] **Step 0.4: 🛑 A0 — Identify the assistant-output hook**

```bash
rm -f /tmp/opencode-probe.log
opencode run "tell me a joke in one sentence" --print-logs 2>&1 | tail -10
sleep 2
# Extract all event types
jq -r '.label as $l | .payload.type as $t | "\($l) \($t // "-")"' /tmp/opencode-probe.log | sort -u
# Find which event contains assistant text
jq 'select(.label == "event" and (.payload.properties | tostring | contains("joke") or contains("Why") or contains("walks")))' /tmp/opencode-probe.log
```

Expected: at least ONE event type whose payload contains the assistant's joke text. Likely `message.part.updated` or `message.updated` (per SDK `gen/types.gen.d.ts:602`). Document the exact event-type name + payload path. Capture to `03-assistant-output.md`.

**🛑 If no event contains assistant text → STOP**, do not proceed with Phase 1 as planned. Re-plan with one of: MCP-only writes, headless `opencode run --format json` capture, or keep gemini.

- [ ] **Step 0.5: A4/A7 — Verify event taxonomy across scenarios**

```bash
# Scenario 1: chat-only
rm -f /tmp/opencode-probe.log
opencode run "hi" --print-logs 2>&1 | tail -5
sleep 1
jq -r '.label + " " + (.payload.type // .payload.tool // "-")' /tmp/opencode-probe.log > /tmp/s1.txt

# Scenario 2: with tool
rm -f /tmp/opencode-probe.log
opencode run "read packages/kernel/package.json and print the package name" --print-logs 2>&1 | tail -5
sleep 2
jq -r '.label + " " + (.payload.type // .payload.tool // "-")' /tmp/opencode-probe.log > /tmp/s2.txt
```

Compare both: `session.idle` MUST appear at the end of both. Capture to `04-event-taxonomy.md`.

- [ ] **Step 0.6: A5 — Tool failure shape**

```bash
# Trigger a tool failure
rm -f /tmp/opencode-probe.log
opencode run "use the read tool to read /tmp/this-does-not-exist-xyz" --print-logs 2>&1 | tail -10
sleep 2
jq 'select(.label == "tool.execute.after")' /tmp/opencode-probe.log
```

Document the error-indicator shape (`output` content? `metadata.error`?). Capture to `05-tool-failure.md`.

- [ ] **Step 0.7: A3 — HTTP fetch from plugin**

```bash
# Modify probe.ts to add: try { await fetch("http://localhost:19999/test", { method: "POST", body: "hi" }); } catch {}
# in the event handler
(nc -l -p 19999 < /dev/null > /tmp/nc.log &)
NCPID=$!
sleep 0.5
opencode run "hi" --print-logs 2>&1 | tail -3
sleep 1
kill $NCPID 2>/dev/null
cat /tmp/nc.log
```

Expected: nc received the POST. Capture to `06-fetch-from-plugin.md`.

- [ ] **Step 0.8: 🛑 A6 — Permission gating works**

```bash
# Modify probe to set output.status = "deny" in permission.ask
# Create a project config that requires permission for the bash tool, then attempt a bash call
mkdir -p /tmp/oc-perm-probe && cd /tmp/oc-perm-probe
cat > opencode.json <<'EOF'
{ "$schema": "https://opencode.ai/config.json", "permission": { "bash": "ask" } }
EOF
rm -f /tmp/opencode-probe.log
opencode run "run 'echo hello' via the bash tool" --print-logs 2>&1 | tail -10
sleep 2
# Verify permission.ask:in fired AND tool.execute.after for bash did NOT fire (or fired with denial)
grep '"label":"permission.ask:in"' /tmp/opencode-probe.log
grep '"label":"tool.execute.after"' /tmp/opencode-probe.log | grep bash || echo "PASS: bash tool blocked"
```

Capture to `07-permission-gating.md`. **🛑 If denial doesn't block tool**, permission flow degrades to observability-only in v1.

- [ ] **Step 0.9: 🛑 A15 — `permission.ask` tolerates 30s sync block**

```bash
# Modify probe.permission.ask to: await sleep(30000); output.status = "allow";
cd /tmp/oc-perm-probe
rm -f /tmp/opencode-probe.log
START=$(date +%s)
opencode run "run 'echo waited' via bash" --print-logs 2>&1 | tail -5
END=$(date +%s)
echo "elapsed: $((END - START))s"
```

Expected: elapsed ≥ 30s AND command succeeded. Capture to `08-permission-sync-block.md`. **🛑 If opencode times out**, plan must downgrade access requests to observability-only with explicit UI labelling.

- [ ] **Step 0.10: A14 — `--pure` is the negative control**

```bash
rm -f /tmp/opencode-probe.log
opencode --pure run "hi" --print-logs 2>&1 | tail -3
test ! -s /tmp/opencode-probe.log && echo "PASS" || echo "FAIL: probe ran under --pure"
```

Capture to `09-pure-flag.md`.

- [ ] **Step 0.11: A11 + A11.1 — MCP `env` vs `environment`**

```bash
# Probe A: write env
mkdir -p /tmp/oc-mcp-env && cd /tmp/oc-mcp-env
cat > opencode.json <<'EOF'
{ "$schema": "https://opencode.ai/config.json", "mcp": { "envprobe": {
  "type": "local",
  "command": ["sh", "-c", "echo \"F_MARK_MCP_VERSION=$F_MARK_MCP_VERSION\" >&2; exec cat"],
  "env": { "F_MARK_MCP_VERSION": "probe-env" },
  "enabled": true } } }
EOF
opencode run "list mcp tools" --print-logs 2>&1 | grep -i "F_MARK_MCP_VERSION" || echo "env key did NOT propagate"

# Probe B: write environment
cat > opencode.json <<'EOF'
{ "$schema": "https://opencode.ai/config.json", "mcp": { "envprobe": {
  "type": "local",
  "command": ["sh", "-c", "echo \"F_MARK_MCP_VERSION=$F_MARK_MCP_VERSION\" >&2; exec cat"],
  "environment": { "F_MARK_MCP_VERSION": "probe-environment" },
  "enabled": true } } }
EOF
opencode run "list mcp tools" --print-logs 2>&1 | grep -i "F_MARK_MCP_VERSION" || echo "environment key did NOT propagate"
```

Document which key (or both) opencode honors. Capture to `10-mcp-env-key.md`.

- [ ] **Step 0.12: A17 — MCP tool naming inside opencode**

After A11 verifies the fmark MCP loads (using the real fmark server, not the echo probe):
```bash
cd <a real F-Mark project root with opencode integration applied>
rm -f /tmp/opencode-probe.log
opencode run "list all available tools whose name contains 'fmark'" --print-logs 2>&1 | tail -20
# Extract from log how opencode named the tools
grep -oE '"mcp__[^"]*"|"fmark[^"]*"' /tmp/opencode-probe.log | sort -u
```

Capture to `11-mcp-tool-naming.md`. Record the exact prefix to use in dedup-skip logic.

- [ ] **Step 0.13: A18 — Config file precedence (.json vs .jsonc)**

```bash
mkdir -p /tmp/oc-precedence && cd /tmp/oc-precedence
echo '{"mcp":{"a":{"type":"local","command":["true"],"enabled":true}}}' > opencode.json
echo '{"mcp":{"b":{"type":"local","command":["true"],"enabled":true}}}' > opencode.jsonc
opencode mcp 2>&1 | tail -10
# Then test JSONC in opencode.json (with a // comment)
rm opencode.jsonc
cat > opencode.json <<'EOF'
{
  // this is a comment
  "mcp": { "c": { "type": "local", "command": ["true"], "enabled": true } }
}
EOF
opencode mcp 2>&1 | tail -10
```

Capture to `12-config-precedence.md`.

- [ ] **Step 0.14: A19 — `opencode.json.plugin` config-array path**

```bash
mkdir -p /tmp/oc-cfgplugin && cd /tmp/oc-cfgplugin
cat > opencode.json <<EOF
{ "\$schema": "https://opencode.ai/config.json", "plugin": ["./plugin/probe.ts"] }
EOF
mkdir -p plugin
cp ~/.config/opencode/plugin/probe.ts plugin/probe.ts
rm -f /tmp/opencode-probe.log
# Move global plugin out to isolate
mv ~/.config/opencode/plugin/probe.ts /tmp/probe-saved.ts
opencode run "hi" --print-logs 2>&1 | tail -3
test -s /tmp/opencode-probe.log && echo "PASS: config-array loaded probe" || echo "FAIL"
# Restore
mv /tmp/probe-saved.ts ~/.config/opencode/plugin/probe.ts
```

Capture to `13-plugin-config-array.md`.

- [ ] **Step 0.15: A20 — Slash commands fire `command.execute.before`**

```bash
# Interactive — requires user. Skip if no tmux/TTY available; document as deferred.
# Open opencode in tmux pane with probe loaded, type /compact, then exit.
# Inspect /tmp/opencode-probe.log for command.execute.before entries
```

Capture to `14-slash-commands.md` (or mark as deferred if no TTY available — capabilities can be defaulted conservatively then).

- [ ] **Step 0.16: Clean up probe**

```bash
rm -f ~/.config/opencode/plugin/probe.ts /tmp/opencode-probe.log /tmp/nc.log
```

- [ ] **Step 0.17: Document verdict matrix + stop-condition decisions**

Create `planning/replace-gemini-with-opencode/hot-tests/VERDICT.md` with one row per assumption A0–A20, columns: `Pass/Fail/Deferred`, `Evidence file`, `Plan-impact notes`. Each 🛑 row must be PASS or implementation does not proceed.

- [ ] **Step 0.18: Commit hot-test reports**

```bash
git add planning/replace-gemini-with-opencode/
git commit -m "docs(opencode): hot-test assumptions for opencode integration"
```

---

### Phase 1: Plugin Template

**Files:**
- Create: `packages/kernel/assets/opencode-plugin/fmark.ts`

- [ ] **Step 1.1: Write the plugin template (refined per Phase 0 results)**

This template assumes Phase 0 has confirmed: A0 (assistant text via `event` with type `message.part.updated` or similar), A6 (deny blocks), A15 (sync block tolerated up to 60s+), A8 (env propagation), A17 (MCP tool prefix). Replace the 🔥 placeholders below with the exact event-type names + payload paths recorded in `hot-tests/VERDICT.md`.

The plugin:
- Mirrors `autoStream.ts:78-115` session-resolution: F_MARK_SESSION_ID env → payload sessionID → active-session file → latest valid session (with `sessionExists` validation, fetched via kernel HTTP).
- Mirrors `autoStream.ts:911-964` access-request handler: posts request, polls `/sessions/<sid>/events?kind=access-response` until matching `request_id` lands or timeout (default 300s, configurable via `F_MARK_ACCESS_REQUEST_TIMEOUT_MS`).
- Posts a single tool-use event per `tool.execute.after`, skipping the MCP-fmark prefix from A17.
- Posts an assistant `prose` event per terminal message-part update (only when assistant has finished a part — not on every delta).
- Tracks "posted-content-since-last-turn-end" per opencode session ID; only emits turn-end on `session.idle` if true.

```typescript
// packages/kernel/assets/opencode-plugin/fmark.ts
// DO NOT EDIT — managed by F-Mark integration apply. Version in fmark.meta.json.
import type { Plugin } from "@opencode-ai/plugin";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const PLUGIN_VERSION = "phase-opencode-v1";
const PING_TIMEOUT_MS = 2000;
const ACCESS_RESPONSE_POLL_MS = 250;
const FMARK_MCP_TOOL_PREFIX = process.env.F_MARK_OPENCODE_MCP_PREFIX ?? "mcp__fmark__"; // 🔥 A17 may override

interface Ctx {
  fmarkDir: string;
  kernelUrl: string;
  token: string;
  projectPath: string;
  agentId: string;
}

async function findFmarkDir(start: string): Promise<string | null> {
  let cur = start;
  while (true) {
    const candidate = join(cur, ".f-mark");
    try { if ((await stat(candidate)).isDirectory()) return candidate; } catch {}
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

async function loadCtx(cwd: string): Promise<Ctx | null> {
  const agentId = process.env.F_MARK_AGENT_ID;
  if (!agentId) return null;
  const envPath = process.env.F_MARK_PATH;
  let fmarkDir: string | null = null;
  let projectPath: string | null = null;
  if (envPath) {
    try { await stat(join(envPath, ".f-mark")); fmarkDir = join(envPath, ".f-mark"); projectPath = envPath; } catch {}
  }
  if (!fmarkDir) {
    fmarkDir = await findFmarkDir(cwd);
    if (!fmarkDir) return null;
    projectPath = dirname(fmarkDir);
  }
  const token = (await readFile(join(fmarkDir, ".token"), "utf8")).trim();
  const cfg = JSON.parse(await readFile(join(fmarkDir, "config.json"), "utf8")) as {
    port?: number; host?: string;
  };
  return {
    fmarkDir, agentId, projectPath: projectPath!, token,
    kernelUrl: `http://${cfg.host ?? "localhost"}:${cfg.port ?? 7777}`,
  };
}

async function httpJson<T = unknown>(ctx: Ctx, method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${ctx.kernelUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      process.stderr.write(`f-mark plugin: ${method} ${path} -> ${res.status}\n`);
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    return ct.includes("json") ? (await res.json()) as T : null;
  } catch (err) {
    process.stderr.write(`f-mark plugin: ${method} ${path} threw ${(err as Error).message}\n`);
    return null;
  }
}

// Mirrors autoStream.ts:78-115. Kernel routes (verified):
//   GET  /sessions                       → { sessions: [{ id, ... }] }   (no GET /sessions/:id)
//   GET  /sessions/:id/events?kinds=X,Y  → { events: [...] }
// Session existence: validated by listing once and intersecting candidates.
async function resolveFmarkSessionId(_ctx: Ctx, _opencodeSessionId: string, candidates: string[]): Promise<string | null> {
  for (const c of candidates) if (c) return c; // optimistic — POST 4xx surfaces a stale id
  return null;
}

async function fetchKnownSessionIds(ctx: Ctx): Promise<Set<string>> {
  const res = await httpJson<{ sessions?: Array<{ id: string }> }>(ctx, "GET", `/sessions`);
  return new Set((res?.sessions ?? []).map((s) => s.id));
}

async function resolveValidatedFmarkSessionId(ctx: Ctx): Promise<string | null> {
  const candidates: string[] = [];
  const activeFile = join(ctx.fmarkDir, "agents", ctx.agentId, "active-session");
  try {
    const v = (await readFile(activeFile, "utf8")).trim();
    if (v) candidates.push(v);
  } catch {}
  if (process.env.F_MARK_SESSION_ID) candidates.push(process.env.F_MARK_SESSION_ID);
  const known = await fetchKnownSessionIds(ctx);
  for (const c of candidates) if (known.has(c)) return c;
  // Latest fallback: first id in /sessions response (route returns newest first)
  const res = await httpJson<{ sessions?: Array<{ id: string }> }>(ctx, "GET", `/sessions`);
  return res?.sessions?.[0]?.id ?? null;
}

// Mirrors autoStream.ts:911-964. Polls GET /sessions/:id/events?kinds=access-response, unwraps { events }.
async function awaitAccessResponse(
  ctx: Ctx, sessionId: string, requestId: string, timeoutMs: number,
): Promise<"approve" | "deny" | "expired"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await httpJson<{ events?: Array<{ kind: string; payload: Record<string, unknown> }> }>(
      ctx, "GET", `/sessions/${sessionId}/events?kinds=access-response`,
    );
    for (const e of res?.events ?? []) {
      if (e.payload?.request_id === requestId
          && (e.payload.decision === "approve" || e.payload.decision === "deny")) {
        return e.payload.decision as "approve" | "deny";
      }
    }
    await new Promise((r) => setTimeout(r, ACCESS_RESPONSE_POLL_MS));
  }
  return "expired";
}

// Track per-session "has assistant content since last turn-end" — avoids empty turns
const turnHasContent = new Map<string, boolean>();

export const FmarkPlugin: Plugin = async (input) => {
  const ctx = await loadCtx(input.directory ?? process.cwd());
  if (!ctx) {
    process.stderr.write(`f-mark plugin v${PLUGIN_VERSION}: F_MARK_AGENT_ID not set or .f-mark/ missing; idle\n`);
    return {};
  }
  process.stderr.write(`f-mark plugin v${PLUGIN_VERSION}: agent=${ctx.agentId} kernel=${ctx.kernelUrl}\n`);

  // Ping on load (mirror autoStream.ts:1020)
  fetch(`${ctx.kernelUrl}/agents/${ctx.agentId}/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: "{}",
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  }).catch(() => {});

  return {
    // A0: Assistant text via event hook. Exact event-type from Phase 0 step 0.4
    event: async ({ event }) => {
      const t = (event as any).type as string;
      const props = (event as any).properties ?? {};

      // 🔥 A0 — replace with the exact event type that carries assistant text and final/delta indication
      if (t === "message.part.updated" || t === "message.updated") {
        const part = props.part ?? props;
        if (part?.type !== "text") return;
        const text: string | undefined = part?.text;
        const isFinal: boolean = part?.status === "completed" || event.type === "message.updated";
        if (!isFinal || !text) return; // skip deltas in v1; can switch to streaming later
        const opencodeSid = props.sessionID ?? props.session_id;
        const sid = await resolveValidatedFmarkSessionId(ctx);
        if (!sid) return;
        await httpJson(ctx, "POST", `/sessions/${sid}/events/prose`, {
          participant_id: ctx.agentId,
          content: text,
          arbitrary: false,
          source: "hook",
          path: ctx.projectPath,
        });
        if (opencodeSid) turnHasContent.set(opencodeSid, true);
        return;
      }

      if (t === "session.idle") {
        const opencodeSid = props.sessionID ?? props.session_id;
        if (!opencodeSid) return;
        if (turnHasContent.get(opencodeSid) !== true) return; // gate on content
        const sid = await resolveValidatedFmarkSessionId(ctx);
        if (!sid) return;
        await httpJson(ctx, "POST", `/sessions/${sid}/events/turn-end`, {
          participant_id: ctx.agentId,
          source: "hook",
          path: ctx.projectPath,
        });
        turnHasContent.set(opencodeSid, false);
      }
    },

    "tool.execute.after": async ({ tool, sessionID, callID, args }, { output, metadata, title }) => {
      if (tool.startsWith(FMARK_MCP_TOOL_PREFIX)) return; // fmark MCP writes its own events
      const sid = await resolveValidatedFmarkSessionId(ctx);
      if (!sid) return;
      // 🔥 A5 — refine `success` inference from output/metadata shape captured in Phase 0 step 0.6
      const success = !(metadata && (metadata as any).error) && !((output ?? "") as string).match(/^Error:/i);
      await httpJson(ctx, "POST", `/sessions/${sid}/events/tool-use`, {
        participant_id: ctx.agentId,
        tool_name: tool,
        tool_use_id: callID,
        input: args,
        result: { output, metadata, title },
        success,
        path: ctx.projectPath,
      });
      turnHasContent.set(sessionID, true);
    },

    "permission.ask": async (permission, output) => {
      // 🔥 A6 / A15 — confirmed sync block tolerated; if A15 failed, replace with fire-and-forget + terminal channel
      const sid = await resolveValidatedFmarkSessionId(ctx);
      if (!sid) {
        // No F-Mark session — leave opencode default ("ask")
        return;
      }
      const requestId = `ar-${(permission as any).id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
      await httpJson(ctx, "POST", `/sessions/${sid}/events/access-request`, {
        participant_id: ctx.agentId,
        path: ctx.projectPath,
        schema: "fmark.access-request.v1",
        request_id: requestId,
        status: "open",
        request_type: "permission",
        runtime_id: "opencode",
        runtime_session_id: (permission as any).sessionID,
        title: (permission as any).title ?? (permission as any).type ?? "Permission request",
        message: (permission as any).message ?? JSON.stringify(permission).slice(0, 800),
        tool_name: (permission as any).tool,
        tool_input: (permission as any).callID !== undefined ? { callID: (permission as any).callID } : undefined,
        response_channel: "hook",
        raw: permission,
        created_at: new Date().toISOString(),
      });
      const timeoutMs = Number(process.env.F_MARK_ACCESS_REQUEST_TIMEOUT_MS ?? "300000");
      const decision = await awaitAccessResponse(ctx, sid, requestId, Math.max(1000, timeoutMs));
      if (decision === "approve") output.status = "allow";
      else if (decision === "deny") output.status = "deny";
      else output.status = "deny"; // expired — fail closed
    },
  };
};

export default FmarkPlugin;
```

> 🔥 The exact event types + payload paths for assistant text (A0) and permission shape (A6) are placeholders. Phase 0 results are the source of truth — refine before committing.

- [ ] **Step 1.2: Lint/typecheck the template against the LOCALLY BUNDLED SDK**

Per Codex review (#17), use the SDK that the installed opencode CLI actually runs against — not npm `@latest`.

```bash
mkdir -p /tmp/oc-plugin-typecheck && cd /tmp/oc-plugin-typecheck
rm -rf node_modules package.json package-lock.json
npm init -y >/dev/null
# Link the locally bundled SDK (version 1.14.33 as of this writing)
LOCAL_SDK_VERSION=$(jq -r '.version' ~/.config/opencode/node_modules/@opencode-ai/plugin/package.json)
echo "Local opencode plugin SDK version: $LOCAL_SDK_VERSION"
npm install "@opencode-ai/plugin@$LOCAL_SDK_VERSION" "@opencode-ai/sdk@$LOCAL_SDK_VERSION" typescript@5 @types/node@20 >/dev/null
cp /home/roey/workspace/F-Mark/packages/kernel/assets/opencode-plugin/fmark.ts ./fmark.ts
npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict ./fmark.ts
```

Expected: zero errors. Fix any signature mismatches (likely candidates: `event.properties` is `unknown`, requires narrowing; `permission` shape requires `(permission as any)` casts until the v2 SDK exposes typed `Permission`).

- [ ] **Step 1.3: Commit**

```bash
git add packages/kernel/assets/opencode-plugin/fmark.ts
git commit -m "feat(opencode): add fmark plugin template for opencode"
```

---

### Phase 2: `hooksInstall/opencode.ts`

**Files:**
- Create: `packages/kernel/src/hooksInstall/opencode.ts`
- Modify: `packages/kernel/src/hooksInstall/index.ts`
- Modify: `packages/kernel/src/hooksInstall/command.ts` (add `FMARK_OPENCODE_PLUGIN_VERSION` constant — optional)

- [ ] **Step 2.1: Write failing tests**

The adapter uses an `.opencode/plugin/fmark.meta.json` sidecar (containing `{version, sha256, scope, installed_at}`) for install detection — robust against accidental edits of the plugin file. Detection treats `{matching version + matching sha256}` as `installed`, `{mismatched version}` as `stale`, `{matching version + mismatched sha256}` as `stale` (user edited).

The signature accepts an explicit `scope: "project" | "user"` parameter to fix the Codex-flagged scope bug (#7).

```typescript
// packages/kernel/tests/hooksInstall/opencode.test.ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyOpencodeHooks,
  detectOpencodeHooks,
  loadOpencodePluginFile,
  renderOpencodeInstallSnippet,
  FMARK_OPENCODE_PLUGIN_VERSION,
  type OpencodeHookScope,
} from "../../src/hooksInstall/opencode.js";

let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "fmark-oc-hook-")); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe("hooksInstall/opencode", () => {
  test("detect: project scope, missing", async () => {
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("missing");
    expect(project?.configPath).toBe(join(tmp, ".opencode/plugin/fmark.ts"));
  });

  test("apply project then detect installed (sha256 matches sidecar)", async () => {
    const applied = await applyOpencodeHooks({ scope: "project" as OpencodeHookScope, projectRoot: tmp });
    expect(applied.changed).toBe(true);
    expect(applied.configPath).toBe(join(tmp, ".opencode/plugin/fmark.ts"));
    const meta = JSON.parse(await readFile(join(tmp, ".opencode/plugin/fmark.meta.json"), "utf8"));
    expect(meta.version).toBe(FMARK_OPENCODE_PLUGIN_VERSION);
    expect(meta.scope).toBe("project");
    expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/);
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("installed");
  });

  test("idempotent (second apply does not change file)", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    const second = await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    expect(second.changed).toBe(false);
  });

  test("user-edited plugin → stale (sha256 mismatch)", async () => {
    await applyOpencodeHooks({ scope: "project", projectRoot: tmp });
    // user appends a console.log
    const p = join(tmp, ".opencode/plugin/fmark.ts");
    const orig = await readFile(p, "utf8");
    await writeFile(p, orig + "\nconsole.log('user edit');\n");
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("stale");
  });

  test("ancient version → stale, detectedVersion captured", async () => {
    const dir = join(tmp, ".opencode/plugin");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "fmark.ts"), "// from old install\n");
    await writeFile(join(dir, "fmark.meta.json"), JSON.stringify({
      version: "ancient-v0", sha256: createHash("sha256").update("// from old install\n").digest("hex"),
      scope: "project", installed_at: "2024-01-01T00:00:00Z",
    }));
    const result = await detectOpencodeHooks({ projectRoot: tmp });
    const project = result.locations?.find((l) => l.scope === "local");
    expect(project?.status).toBe("stale");
    expect(project?.detectedVersion).toBe("ancient-v0");
  });

  test("render snippet returns the plugin source plus install instructions", () => {
    const snippet = renderOpencodeInstallSnippet();
    expect(snippet).toContain("FmarkPlugin");
    expect(snippet).toContain(FMARK_OPENCODE_PLUGIN_VERSION);
  });
});
```

- [ ] **Step 2.2: Run the test, expect failures**

```bash
cd packages/kernel && pnpm vitest run tests/hooksInstall/opencode.test.ts
```

Expected: import failures (module not found).

- [ ] **Step 2.3: Implement `opencode.ts`**

Key design points:
- **Explicit scope param** — caller decides project vs user. No implicit-from-undefined behavior (Codex #7).
- **Sidecar metadata** — `fmark.meta.json` keyed by plugin sha256 + version (Codex #6).
- **Both locations always returned** — `DetectResult.locations[]` always has entries for both `local` (project) and `global` (user), matching the pattern in `claude.ts` (`detectClaudeHookLocations`).
- **JSONC config writes deferred** — this adapter only writes the `.ts` + `.meta.json`. The optional `opencode.json.plugin = [...]` write is gated on Phase 0's A19 result and lives in a follow-up step.

```typescript
// packages/kernel/src/hooksInstall/opencode.ts
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DetectResult, HookEntry, HookLocationStatus } from "./types.js";

export const FMARK_OPENCODE_PLUGIN_VERSION = "phase-opencode-v1";
export type OpencodeHookScope = "project" | "user";

function pluginPathForScope(scope: OpencodeHookScope, projectRoot?: string): string {
  if (scope === "project") {
    if (projectRoot === undefined) throw new Error("projectRoot required for project scope");
    return join(projectRoot, ".opencode/plugin/fmark.ts");
  }
  return join(homedir(), ".config/opencode/plugin/fmark.ts");
}

function metaPathFor(pluginPath: string): string {
  return join(dirname(pluginPath), "fmark.meta.json");
}

function pluginTemplatePath(): string {
  const moduleFile = fileURLToPath(import.meta.url);
  const packageRoot = dirname(dirname(dirname(moduleFile))); // src/hooksInstall -> packages/kernel
  return join(packageRoot, "assets/opencode-plugin/fmark.ts");
}

async function readTemplate(): Promise<string> {
  return readFile(pluginTemplatePath(), "utf8");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

interface SidecarMeta {
  version: string;
  sha256: string;
  scope: OpencodeHookScope;
  installed_at: string;
}

async function readMeta(pluginPath: string): Promise<SidecarMeta | null> {
  try {
    const raw = await readFile(metaPathFor(pluginPath), "utf8");
    const parsed = JSON.parse(raw) as Partial<SidecarMeta>;
    if (typeof parsed.version === "string" && typeof parsed.sha256 === "string"
        && (parsed.scope === "project" || parsed.scope === "user")
        && typeof parsed.installed_at === "string") {
      return parsed as SidecarMeta;
    }
    return null;
  } catch { return null; }
}

async function detectOneLocation(
  scope: OpencodeHookScope, configPath: string,
): Promise<HookLocationStatus> {
  const expectedTemplate = await readTemplate();
  const expectedVersion = FMARK_OPENCODE_PLUGIN_VERSION;
  const expectedEntries: HookEntry[] = [{ event: "plugin", command: configPath, version: expectedVersion }];
  let source: string | null = null;
  try { source = await readFile(configPath, "utf8"); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        scope: scope === "project" ? "local" : "global",
        configPath, exists: false, installed: false,
        status: "blocked", expectedVersion, detectedVersion: null,
        detectedEntries: [], expectedEntries,
        error: (err as Error).message,
      };
    }
  }
  if (source === null) {
    return {
      scope: scope === "project" ? "local" : "global",
      configPath, exists: false, installed: false,
      status: "missing", expectedVersion, detectedVersion: null,
      detectedEntries: [], expectedEntries,
    };
  }
  const meta = await readMeta(configPath);
  const detectedVersion = meta?.version ?? null;
  const fileHash = sha256(source);
  const expectedHash = sha256(expectedTemplate);
  const installed = meta !== null
    && meta.version === expectedVersion
    && meta.sha256 === fileHash
    && fileHash === expectedHash;
  return {
    scope: scope === "project" ? "local" : "global",
    configPath, exists: true, installed,
    status: installed ? "installed" : "stale",
    expectedVersion, detectedVersion,
    detectedEntries: [{ event: "plugin", command: configPath, version: detectedVersion ?? undefined }],
    expectedEntries,
  };
}

export async function detectOpencodeHooks(opts: { projectRoot?: string }): Promise<DetectResult> {
  const userLoc = await detectOneLocation("user", pluginPathForScope("user"));
  const locations: HookLocationStatus[] = [userLoc];
  if (opts.projectRoot !== undefined) {
    const projectLoc = await detectOneLocation("project", pluginPathForScope("project", opts.projectRoot));
    locations.unshift(projectLoc);
  }
  const aggregate = locations.find((l) => l.installed) ?? locations[0];
  return {
    installed: locations.some((l) => l.installed),
    status: aggregate?.status,
    configPath: aggregate?.configPath ?? userLoc.configPath,
    expectedVersion: FMARK_OPENCODE_PLUGIN_VERSION,
    detectedVersion: aggregate?.detectedVersion ?? null,
    detectedEntries: locations.flatMap((l) => l.detectedEntries),
    expectedEntries: aggregate?.expectedEntries ?? userLoc.expectedEntries,
    locations,
  };
}

export async function loadOpencodePluginFile(opts: {
  scope: OpencodeHookScope; projectRoot?: string;
}): Promise<{ source: string | null; configPath: string }> {
  const configPath = pluginPathForScope(opts.scope, opts.projectRoot);
  try { return { configPath, source: await readFile(configPath, "utf8") }; }
  catch { return { configPath, source: null }; }
}

export async function applyOpencodeHooks(opts: {
  scope: OpencodeHookScope; projectRoot?: string;
}): Promise<{ changed: boolean; configPath: string }> {
  const configPath = pluginPathForScope(opts.scope, opts.projectRoot);
  const template = await readTemplate();
  const expectedHash = sha256(template);
  let existing: string | null = null;
  try { existing = await readFile(configPath, "utf8"); } catch {}
  const existingMeta = await readMeta(configPath);
  const upToDate = existing === template
    && existingMeta?.version === FMARK_OPENCODE_PLUGIN_VERSION
    && existingMeta?.sha256 === expectedHash;
  if (upToDate) return { changed: false, configPath };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, template, "utf8");
  const meta: SidecarMeta = {
    version: FMARK_OPENCODE_PLUGIN_VERSION,
    sha256: expectedHash,
    scope: opts.scope,
    installed_at: new Date().toISOString(),
  };
  await writeFile(metaPathFor(configPath), JSON.stringify(meta, null, 2) + "\n", "utf8");
  return { changed: true, configPath };
}

export function renderOpencodeInstallSnippet(): string {
  return [
    "F-Mark installs an opencode plugin to capture session events.",
    "",
    "Auto-apply: `f-mark integration apply --runtime opencode --scope project|user`",
    "writes `.opencode/plugin/fmark.ts` plus a sidecar `fmark.meta.json`.",
    "",
    "```typescript",
    "// see packages/kernel/assets/opencode-plugin/fmark.ts for the canonical template",
    `// version: ${FMARK_OPENCODE_PLUGIN_VERSION}`,
    "// export const FmarkPlugin: Plugin = async (input) => { /* ... */ };",
    "```",
  ].join("\n");
}
```

- [ ] **Step 2.4: Run tests, verify they pass**

```bash
cd packages/kernel && pnpm vitest run tests/hooksInstall/opencode.test.ts
```

- [ ] **Step 2.5: Wire into `hooksInstall/index.ts`** — ADD opencode without removing gemini yet

In `packages/kernel/src/hooksInstall/index.ts`:
- Add `import { applyOpencodeHooks, detectOpencodeHooks, loadOpencodePluginFile, renderOpencodeInstallSnippet, type OpencodeHookScope } from "./opencode.js";` (do NOT remove the gemini import yet — that happens in Phase 8 after E2E passes).
- In `checkHookInstallStatus`: add a new `if (opts.runtimeId === "opencode")` branch parallel to gemini.
- In `renderInstallInstructions`: add an opencode branch.
- In `applyAutomaticHookInstall`: add an opencode branch.

**Scope-mapping note** (Codex review_2 #3): `hooksInstall/index.ts` and downstream uses `ClaudeHookScope = "local" | "global"`. `mcpInstall/index.ts` and `applyAutomaticHookInstall` use the broader `IntegrationScope = "project" | "user" | "local"`. The new opencode branch must map:
- `scope === "global" || scope === "user"` → `OpencodeHookScope.user`
- otherwise → `OpencodeHookScope.project`

Concretely, in `applyAutomaticHookInstall`:
```typescript
if (opts.runtimeId === "opencode") {
  const opencodeScope: OpencodeHookScope =
    opts.scope === "global" ? "user" : "project";
  const applied = await applyOpencodeHooks({
    scope: opencodeScope,
    projectRoot: opencodeScope === "project" ? opts.projectRoot : undefined,
  });
  return {
    changed: applied.changed,
    configPath: applied.configPath,
    status: await checkHookInstallStatus(opts),
  };
}
```

The `hookTargetScope` and `IntegrationScope`→`ClaudeHookScope` translations in `mcpInstall/index.ts:131-138, :319` are claude-specific (`global`/`local`). Verify that the opencode branch receives the right scope value at the call site. If not, add an opencode-specific mapping in `mcpInstall/index.ts:applyIntegration` before invoking `applyAutomaticHookInstall`.

- [ ] **Step 2.6: Add dispatch tests for opencode (keep gemini tests intact)**

`packages/kernel/tests/routes/hookInstall.test.ts` and `tests/routes/runtimes.test.ts` — add opencode fixtures alongside existing gemini ones. Do not delete gemini tests yet.

- [ ] **Step 2.7: Typecheck + run hooksInstall test suite**

```bash
pnpm -F kernel typecheck
cd packages/kernel && pnpm vitest run tests/hooksInstall/ tests/routes/hookInstall.test.ts
```

- [ ] **Step 2.8: Commit**

```bash
git add packages/kernel/src/hooksInstall/ packages/kernel/tests/hooksInstall/opencode.test.ts packages/kernel/tests/routes/hookInstall.test.ts
git commit -m "feat(opencode): add hooksInstall adapter that writes opencode plugin file + sidecar meta"
```

- [ ] **Step 2.9: Plugin-registration fallback — opencode.json `plugin` array (gated on A1/A2 results)**

If Phase 0 A1 (project auto-load `.opencode/plugin/*.ts`) AND A2 (user auto-load `~/.config/opencode/plugin/*.ts`) BOTH pass: the fallback is unnecessary; this step is a no-op.

If EITHER fails: `applyOpencodeHooks` must also register the plugin in `opencode.json[c]` via the `plugin` array (SDK `Config.plugin?: Array<string | [string, PluginOptions]>` at `~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:48-51`).

```typescript
// Additional helper in packages/kernel/src/hooksInstall/opencode.ts (only used if A1/A2 fail)
import { readJsonObjectForWrite, writeJsonObjectIfChanged } from "../mcpInstall/json.js";
import { stat } from "node:fs/promises";

async function applyOpencodeConfigPluginEntry(opts: {
  scope: OpencodeHookScope;
  projectRoot?: string;
  pluginPath: string;
}): Promise<{ changed: boolean; configPath: string }> {
  const dir = opts.scope === "project"
    ? opts.projectRoot!
    : join(homedir(), ".config/opencode");
  // Prefer existing .jsonc, else .json
  let configPath = join(dir, "opencode.json");
  try { await stat(join(dir, "opencode.jsonc")); configPath = join(dir, "opencode.jsonc"); } catch {}
  const loaded = await readJsonObjectForWrite(configPath);
  if (!loaded.ok) throw new Error(`opencode config blocked: ${loaded.error}`);
  const plugins = Array.isArray(loaded.value.plugin) ? loaded.value.plugin : [];
  const entry = opts.pluginPath; // relative path string
  if (!plugins.some((p) => p === entry || (Array.isArray(p) && p[0] === entry))) {
    plugins.push(entry);
  }
  loaded.value.plugin = plugins;
  const changed = await writeJsonObjectIfChanged(configPath, loaded.raw, loaded.value);
  return { changed, configPath };
}

// In applyOpencodeHooks, after writing the .ts + sidecar:
if (process.env.F_MARK_OPENCODE_REGISTER_IN_CONFIG === "1" /* set by Phase 0 verdict if A1/A2 fail */) {
  const rel = opts.scope === "project" ? "./.opencode/plugin/fmark.ts" : "./plugin/fmark.ts";
  await applyOpencodeConfigPluginEntry({ scope: opts.scope, projectRoot: opts.projectRoot, pluginPath: rel });
}
```

Detection (`detectOpencodeHooks`) similarly checks the `plugin` array if `F_MARK_OPENCODE_REGISTER_IN_CONFIG=1`; if the entry is missing while the `.ts` file exists, status is `stale`.

```bash
pnpm -F kernel typecheck && cd packages/kernel && pnpm vitest run tests/hooksInstall/opencode.test.ts
git add packages/kernel/src/hooksInstall/opencode.ts
git commit -m "feat(opencode): plugin registration fallback via opencode.json[c] plugin array"
```

---

### Phase 3: `mcpInstall/opencode.ts`

**Files:**
- Create: `packages/kernel/src/mcpInstall/opencode.ts`
- Modify: `packages/kernel/src/mcpInstall/index.ts`
- Modify: `packages/kernel/src/mcpInstall/json.ts` (drop `statusFromGeminiServer`)

- [ ] **Step 3.1: Write failing tests**

```typescript
// packages/kernel/tests/mcpInstall/opencode.test.ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyOpencodeMcp, detectOpencodeMcp } from "../../src/mcpInstall/opencode.js";

let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "fmark-oc-mcp-")); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe("mcpInstall/opencode", () => {
  test("detects missing project config", async () => {
    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env: process.env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("missing");
  });

  test("applies and detects installed", async () => {
    const applied = await applyOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, scope: "project", env: process.env });
    expect(applied.changed).toBe(true);
    const opencodeJson = JSON.parse(await readFile(join(tmp, "opencode.json"), "utf8"));
    expect(opencodeJson.mcp.fmark.type).toBe("local");
    expect(Array.isArray(opencodeJson.mcp.fmark.command)).toBe(true);
    expect(opencodeJson.mcp.fmark.environment.F_MARK_MCP_VERSION).toBeDefined();

    const check = await detectOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, env: process.env });
    const project = check.locations.find((l) => l.scope === "project");
    expect(project?.status).toBe("installed");
  });

  test("apply is idempotent", async () => {
    await applyOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, scope: "project", env: process.env });
    const second = await applyOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, scope: "project", env: process.env });
    expect(second.changed).toBe(false);
  });

  test("preserves unrelated mcp servers", async () => {
    await writeFile(join(tmp, "opencode.json"), JSON.stringify({
      mcp: { other: { type: "local", command: ["echo"], enabled: true } },
    }, null, 2));
    await applyOpencodeMcp({ runtimeId: "opencode", projectRoot: tmp, scope: "project", env: process.env });
    const j = JSON.parse(await readFile(join(tmp, "opencode.json"), "utf8"));
    expect(j.mcp.other).toBeDefined();
    expect(j.mcp.fmark).toBeDefined();
  });
});
```

- [ ] **Step 3.2: Run test, expect failures**

```bash
cd packages/kernel && pnpm vitest run tests/mcpInstall/opencode.test.ts
```

- [ ] **Step 3.3: Implement `opencode.ts`**

Key fixes from Codex review:
- **`environment` key** (per opencode docs) — opencode's MCP config uses `environment`, not `env`. The existing `statusFromServer` looks at `env.F_MARK_MCP_VERSION` so we need a dedicated `statusFromOpencodeServer` checking `environment.F_MARK_MCP_VERSION`. Phase 0 A11.1 confirms which key actually propagates — if `env` also works, prefer it (one less helper).
- **JSONC support** — detection probes both `opencode.json` and `opencode.jsonc`. Apply prefers the existing file; defaults to `.json` if neither exists. Requires extending `readJsonConfig` (done in `json.ts` step below).

```typescript
// packages/kernel/src/mcpInstall/opencode.ts
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationLocation } from "@f-mark/shared";
import {
  ensureObject,
  getObject,
  readJsonConfig,
  readJsonObjectForWrite,
  statusFromOpencodeServer,
  writeJsonObjectIfChanged,
} from "./json.js";
import {
  FMARK_MCP_INSTALL_VERSION,
  fmarkMcpCommandSpec,
  makeCheck,
  configHome,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";

async function existingConfigPath(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    try { await stat(c); return c; } catch {}
  }
  return null;
}

function projectCandidates(projectRoot: string): string[] {
  return [join(projectRoot, "opencode.json"), join(projectRoot, "opencode.jsonc")];
}
function userCandidates(env: NodeJS.ProcessEnv): string[] {
  const base = join(configHome(env), "opencode");
  return [join(base, "opencode.json"), join(base, "opencode.jsonc")];
}

async function detectAt(
  scope: "project" | "user", candidates: string[], safeAutoApply: boolean,
): Promise<IntegrationLocation> {
  const path = (await existingConfigPath(candidates)) ?? candidates[0];
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) {
    return { scope, path, status: "blocked", reason: `invalid JSON/JSONC: ${loaded.error}`, safe_auto_apply: false };
  }
  if (!loaded.exists) {
    return { scope, path, status: "missing", safe_auto_apply: safeAutoApply };
  }
  const servers = getObject(loaded.value, "mcp");
  const current = statusFromOpencodeServer(servers?.fmark);
  return {
    scope, path,
    status: current.status,
    version: current.version,
    reason: current.reason,
    safe_auto_apply: safeAutoApply,
  };
}

export async function detectOpencodeMcp(input: McpDetectInput) {
  return makeCheck([
    await detectAt("project", projectCandidates(input.projectRoot), true),
    await detectAt("user", userCandidates(input.env), true),
  ]);
}

function opencodeServer(input: McpApplyInput): Record<string, unknown> {
  const spec = fmarkMcpCommandSpec(input.projectRoot, input.env);
  return {
    type: "local",
    command: [spec.command, ...spec.args],
    environment: spec.env, // 🔥 A11.1 — switch to `env` if opencode honors that key too
    enabled: true,
  };
}

export async function applyOpencodeMcp(input: McpApplyInput) {
  if (input.scope !== "project" && input.scope !== "user") {
    throw new Error(`Opencode MCP apply does not support scope: ${input.scope}`);
  }
  const candidates = input.scope === "project" ? projectCandidates(input.projectRoot) : userCandidates(input.env);
  const path = (await existingConfigPath(candidates)) ?? candidates[0]; // prefer existing, else default to .json
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  const servers = ensureObject(loaded.value, "mcp");
  servers.fmark = opencodeServer(input);
  const changed = await writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
  return {
    changed,
    location: {
      scope: input.scope, path,
      status: "installed" as const,
      version: FMARK_MCP_INSTALL_VERSION,
      safe_auto_apply: true,
    },
  };
}
```

- [ ] **Step 3.3.b: Extend `json.ts` with `statusFromOpencodeServer` and JSONC parsing**

**JSONC parsing**: use the `jsonc-parser` npm package (Microsoft's reference implementation — handles `//`, `/* */`, trailing commas, strings-containing-comment-chars, escaped quotes). A hand-rolled stripper got flagged by Codex (#6) for missing trailing commas; adopting the library is faster than hardening custom code.

```bash
pnpm -F kernel add jsonc-parser
```

```typescript
// In packages/kernel/src/mcpInstall/json.ts — additions:
import { parse as parseJsonc, ParseError } from "jsonc-parser";

function parseJsonOrJsonc(raw: string, path: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const errors: ParseError[] = [];
  const value = parseJsonc(raw, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    return { ok: false, error: `parse error at offset ${errors[0]!.offset}: ${errors[0]!.error}` };
  }
  return { ok: true, value };
}
// Replace the readJsonConfig body's JSON.parse(raw) with parseJsonOrJsonc(raw, path).
// Safe for plain .json files too — jsonc-parser handles strict JSON identically.

export function statusFromOpencodeServer(server: unknown): {
  status: "installed" | "stale" | "missing"; version?: string; reason?: string;
} {
  if (server === null || typeof server !== "object" || Array.isArray(server)) return { status: "missing" };
  const value = server as Record<string, unknown>;
  // Check `environment` first (opencode's documented key), fall back to `env` to be permissive.
  let env: unknown = (value as any).environment;
  if (env === undefined || env === null || typeof env !== "object") env = value.env;
  let version: string | undefined;
  if (env !== null && typeof env === "object" && !Array.isArray(env)) {
    const raw = (env as Record<string, unknown>).F_MARK_MCP_VERSION;
    if (typeof raw === "string") version = raw;
  }
  return {
    status: version === "phase5-stdio-v1" ? "installed" : "stale",
    version,
  };
}
```

Add tests for `statusFromOpencodeServer` covering: no env, env key only, environment key only, both keys, version mismatch.

- [ ] **Step 3.4: Verify tests pass, then ADD opencode wiring to `mcpInstall/index.ts`** (keep gemini)

ADD (do not replace) opencode imports + dispatch branches alongside gemini. Update `executableFor` to allow `opencode` in addition to claude/codex/gemini.

- [ ] **Step 3.5: Typecheck + run mcpInstall tests**

```bash
pnpm -F kernel typecheck
cd packages/kernel && pnpm vitest run tests/mcpInstall/
```

- [ ] **Step 3.6: Commit**

```bash
git add packages/kernel/src/mcpInstall/ packages/kernel/tests/mcpInstall/opencode.test.ts
git commit -m "feat(opencode): add mcpInstall adapter for opencode.json[c] mcp.fmark"
```

---

### Phase 4: Runtime registration + capabilities — ADD opencode, keep gemini

**Files:**
- Modify: `packages/kernel/src/runtimes/defaults.ts`
- Modify: `packages/kernel/.f-mark/runtimes.json`
- Modify: `packages/renderer/.f-mark/runtimes.json`
- Modify: `packages/kernel/src/agents/capabilities.ts`
- Modify: `packages/shared/src/integrations.ts`

- [ ] **Step 4.1: ADD opencode to default runtime registry (keep gemini)**

In `defaults.ts:6`, add the opencode entry after gemini:
```typescript
opencode: { displayName: "Opencode", executable: "opencode", args: [], icon: "opencode", readyDelayMs: 1500 },
```

Same addition in `packages/kernel/.f-mark/runtimes.json` and `packages/renderer/.f-mark/runtimes.json`.

- [ ] **Step 4.2: Add opencode capability entry (informed by Phase 0 A20 results)**

In `packages/kernel/src/agents/capabilities.ts`, add after `gemini:`:
```typescript
opencode: {
  runtime_id: "opencode",
  compact_command: "/compact",         // strings probe confirmed; Phase 0 A20 verifies command.execute.before fires
  clear_command: "/clear",
  fork: {
    native_supported: true,
    verified: false,
    command: "/fork",                  // strings probe confirmed
    command_accepts_name: false,       // 🔥 verify in A20
    cli_command: "opencode run --session <id> --fork",
    notes: "Opencode exposes /fork slash command and --fork on run. Verified slash-command behavior in A20.",
  },
  subagents: {
    final_result_supported: false,
    progressive_supported: false,
    verified: false,
    sources: [],
    notes: "Opencode v1.15 has no first-class sub-agent dispatch; track via tool.execute hooks if needed.",
  },
  reconnect_supported: true,
  access_modes: ["unknown"],
  access_change_supported: false,
  context_source: "unknown",
},
```

- [ ] **Step 4.3: Add `opencode` to `RuntimeId` literal union (keep gemini for now)**

In `packages/shared/src/integrations.ts:1`:
```typescript
export type RuntimeId = "claude" | "codex" | "gemini" | "opencode" | string;
```

- [ ] **Step 4.4: Run shared + kernel typecheck**

```bash
pnpm -w typecheck
```

Expected: no new errors (we ADDED, didn't REMOVE).

- [ ] **Step 4.5: Commit**

```bash
git add packages/kernel/src/runtimes/defaults.ts packages/kernel/src/agents/capabilities.ts packages/kernel/.f-mark/runtimes.json packages/renderer/.f-mark/runtimes.json packages/shared/src/integrations.ts
git commit -m "feat(opencode): register opencode runtime + capabilities alongside gemini"
```

---

### Phase 5: ManagedAgents support for opencode (spawn + access delivery)

**Files:**
- Modify: `packages/kernel/src/routes/managedAgents.ts:150-168` (spawn args)
- Modify: `packages/kernel/src/routes/managedAgents.ts:674-678` (terminal-channel access delivery)

These were Codex-flagged as gemini-specific (#5). Opencode needs its own spawn shape and does NOT need terminal-channel access delivery (its `permission.ask` plugin hook handles approvals natively).

- [ ] **Step 5.1: Read managedAgents.ts:140-180 and :670-690**

Understand the gemini-specific shapes before changing them. They likely set custom argv like `["--yolo"]` or special env. Opencode's TUI launches with just `opencode <project>`; no special args needed for v1.

- [ ] **Step 5.2: Add opencode spawn branch (keep gemini) — match actual `spawnArgsForRuntime` shape**

`spawnArgsForRuntime` (signature at `managedAgents.ts:121-130`) returns `{args, nativeNameApplied, launchPromptDelivery}`. It does NOT return executable or env (those come from elsewhere — `runtimes/defaults.ts` `executable` + the tmux manager's env injection).

Hot-test launch-prompt delivery (A20.1, NEW): does `opencode --prompt "<text>"` exist? Does `opencode --print` exist? Otherwise opencode TUI may need the prompt injected via tmux `send-keys`.

Based on `opencode --help` output: `--prompt` IS a top-level flag. So:
```typescript
if (input.runtimeId === "opencode") {
  return {
    args: [...input.args, "--prompt", input.launchPrompt],
    nativeNameApplied,
    launchPromptDelivery: "native",
  };
}
```

This goes between the `codex` block (line ~142-148) and the `gemini` block (line ~150-168), preserving the existing fall-through to `tmux` for unknown runtimes.

For `:674-678` (terminal-channel access delivery), the existing code is gemini-only — opencode does NOT need a parallel branch added since the plugin's `permission.ask` hook handles approvals. Just leave the gemini gate alone for now; it will be deleted in Phase 8.

- [ ] **Step 5.3: Typecheck + run managedAgents-related tests**

```bash
pnpm -F kernel typecheck
cd packages/kernel && pnpm vitest run tests/routes/runtimes.test.ts
```

- [ ] **Step 5.4: Commit**

```bash
git add packages/kernel/src/routes/managedAgents.ts
git commit -m "feat(opencode): managed-agent spawn branch + skip terminal-channel access"
```

---

### Phase 6: Renderer + skill assets — ADD opencode entries (keep gemini)

**Files:**
- Modify: every renderer file referencing `gemini` to also handle `opencode`
- Create: `packages/kernel/assets/opencode-skill/f-mark/SKILL.md`
- Create: `packages/kernel/assets/opencode-skill/f-mark/api.md`
- Create: `packages/renderer/public/agent-icons/opencode-icon.png` (or decide to fall through to terminal icon)

- [ ] **Step 6.1: Create opencode-skill assets**

```bash
cp -r packages/kernel/assets/gemini-skill packages/kernel/assets/opencode-skill
# edit SKILL.md / api.md to refer to the opencode plugin install (not .gemini/settings.json)
# Reference the canonical plugin template path: packages/kernel/assets/opencode-plugin/fmark.ts
```

- [ ] **Step 6.2: Decide opencode icon strategy**

Either: add `opencode-icon.png` (asset from opencode's brand) OR map opencode to the generic terminal/fallback icon in `ParticipantAvatar.tsx`. Document the choice in `planning/replace-gemini-with-opencode/icon-decision.md`.

- [ ] **Step 6.3: Update `packages/kernel/src/skills/scanner.ts:6`**

ADD `opencode-skill` to the known agent skill roots (keep `gemini-skill`).

- [ ] **Step 6.4: Renderer pass — ADD opencode handling alongside gemini**

For each file in "Renderer" + "Tests (renderer)" lists above:
1. Read file
2. Locate the `gemini` runtime branches/labels
3. ADD a parallel `opencode` branch with appropriate label `"Opencode"`, icon (per 6.2), and any switch-case extension
4. Renderer tests: add opencode test cases mirroring existing gemini ones

- [ ] **Step 6.5: Typecheck + run renderer tests**

```bash
pnpm -F renderer typecheck
pnpm -F renderer test
```

- [ ] **Step 6.6: Commit**

```bash
git add packages/renderer/ packages/kernel/assets/opencode-skill/ packages/kernel/src/skills/scanner.ts planning/replace-gemini-with-opencode/icon-decision.md
git commit -m "feat(opencode): renderer + skill assets for opencode (alongside gemini)"
```

---

### Phase 7: Hot end-to-end test against live opencode (PROOF — gates deletion)

**Files:**
- Create: `packages/kernel/tests/hot/opencode-e2e-hot.mjs`

This phase must pass GREEN before any gemini deletion (Phase 8) begins.

- [ ] **Step 7.1: Write E2E script**

The script must:
1. Spin up F-Mark kernel in a temp project root
2. Apply opencode integration (`applyIntegration({ runtimeId: "opencode", scope: "project" })`)
3. Verify `.opencode/plugin/fmark.ts` exists, sidecar `fmark.meta.json` has matching sha256
4. Verify `opencode.json` has `mcp.fmark` with `environment.F_MARK_MCP_VERSION = "phase5-stdio-v1"` (or `env` if A11.1 selected that key)
5. Verify `detectOpencodeHooks` reports `installed`, `detectOpencodeMcp` reports `installed`
6. Create an F-Mark session via the kernel HTTP API
7. Launch `F_MARK_AGENT_ID=ag-test F_MARK_PATH=<root> F_MARK_SESSION_ID=<sid> F_MARK_RUNTIME_ID=opencode opencode run "say hi briefly"` as subprocess (with `--print-logs` for diagnostics)
8. Wait for opencode to finish (capped 60s)
9. Read events from `.f-mark/sessions/<sid>/events.jsonl`
10. **Assertions**:
    - At least one `prose` event from `ag-test` with `source: "hook"` and content matching the assistant's reply (substring match)
    - One `turn-end` event from `ag-test`
    - At least one `tool-use` event (if `read` or similar tool was used; otherwise skip)
    - Presence registered: GET `/agents/ag-test/presence` returns recently-seen
    - Active-session linkage: `.f-mark/agents/ag-test/active-session` contains `<sid>` (if a link request was made)
11. Trigger a permission flow (configure `permission: { bash: "ask" }` in opencode.json, ask agent to run bash, post an `access-response` with `approve` via kernel HTTP, verify bash ran).
12. Cleanup: stop kernel, remove temp dir.

Use `phase23-full-vendor-e2e-hot.mjs` as a starting template.

- [ ] **Step 7.2: Run E2E and iterate until green**

```bash
node packages/kernel/tests/hot/opencode-e2e-hot.mjs
```

If it fails: read the printed kernel logs + opencode stderr, find root cause, fix in adapter, retest. Do NOT proceed to Phase 8 until green.

- [ ] **Step 7.3: Document results**

Save full output to `planning/replace-gemini-with-opencode/hot-tests/99-e2e.md`.

- [ ] **Step 7.4: Commit**

```bash
git add packages/kernel/tests/hot/opencode-e2e-hot.mjs planning/replace-gemini-with-opencode/hot-tests/99-e2e.md
git commit -m "test(opencode): end-to-end hot integration test passes green"
```

---

### Phase 8: Delete Gemini (only after Phase 7 green)

**Files:**
- Delete: `packages/kernel/src/hooksInstall/gemini.ts`
- Delete: `packages/kernel/src/mcpInstall/gemini.ts`
- Delete: `packages/kernel/tests/hooksInstall/gemini.test.ts`
- Delete: `packages/kernel/assets/gemini-skill/`
- Delete: `packages/renderer/public/agent-icons/gemini-icon.png`
- Modify: every file with leftover gemini reference (caught by final grep)

- [ ] **Step 8.1: Verify Phase 7 green**

```bash
node packages/kernel/tests/hot/opencode-e2e-hot.mjs
```

If not green, STOP. Do not delete.

- [ ] **Step 8.2: Delete gemini source files**

```bash
rm packages/kernel/src/hooksInstall/gemini.ts
rm packages/kernel/src/mcpInstall/gemini.ts
rm packages/kernel/tests/hooksInstall/gemini.test.ts
rm -rf packages/kernel/assets/gemini-skill
rm -f packages/renderer/public/agent-icons/gemini-icon.png
```

- [ ] **Step 8.3: Remove gemini from dispatchers**

In `packages/kernel/src/hooksInstall/index.ts`: drop the `import` and the `if (opts.runtimeId === "gemini")` branches.
In `packages/kernel/src/mcpInstall/index.ts`: same.
In `packages/kernel/src/runtimes/defaults.ts:6`: remove the gemini entry.
In `packages/kernel/.f-mark/runtimes.json` and `packages/renderer/.f-mark/runtimes.json`: remove the gemini entry.
In `packages/kernel/src/agents/capabilities.ts`: remove the gemini block.
In `packages/shared/src/integrations.ts:1`: drop `"gemini"` from the literal union.
In `packages/kernel/src/mcpInstall/json.ts`: drop `statusFromGeminiServer`.
In `packages/kernel/src/hooks/autoStream.ts`: drop the `:233-281` Notification/ToolPermission branch, the `:262` `?? "gemini"` fallback, and the `:458-459, 482, 488, 517` `invoke_agent` extraction.
In `packages/kernel/src/hooks/projectTurn.ts`: drop the `:148-160, 182-186` Gemini-specific projection.
In `packages/kernel/src/skills/scanner.ts:6`: drop `gemini-skill`.
In `packages/kernel/src/routes/managedAgents.ts:150-168, :674-678`: drop the gemini-only spawn args and terminal-channel branch.
In `packages/kernel/assets/codex-skill/f-mark/SKILL.md:6`: rewrite to point at opencode-skill.

- [ ] **Step 8.4: Renderer cleanup**

Drop `"gemini"` branches in every file enumerated in "Renderer" + "Tests (renderer)". Drop `"Gemini"` labels.

- [ ] **Step 8.5: Final grep gate**

```bash
rg -n 'gemini|Gemini|GEMINI' packages --glob '!**/dist/**' --glob '!**/*.tsbuildinfo' --glob '!**/node_modules/**' | tee /tmp/gemini-leftovers.txt
test ! -s /tmp/gemini-leftovers.txt && echo "PASS: zero gemini references"
```

- [ ] **Step 8.6: Build + typecheck + test**

```bash
pnpm -w build && pnpm -w typecheck && pnpm -w test
```

- [ ] **Step 8.7: Re-run hot E2E (still green after deletion)**

```bash
node packages/kernel/tests/hot/opencode-e2e-hot.mjs
```

- [ ] **Step 8.8: Commit**

```bash
git add -A
git commit -m "chore: remove gemini integration (replaced by opencode)"
```

---

### Phase 9: Final verification

- [ ] **Step 9.1: Run full test suite + typecheck + build**

```bash
pnpm -w build && pnpm -w typecheck && pnpm -w test
```

- [ ] **Step 9.2: Run all hot scripts that previously referenced gemini**

For each phase\*-hot.mjs listed in "Hot test scripts": update to use `opencode` runtime and confirm green. Some scripts may need refactoring (gemini-specific assumptions like terminal-channel access).

- [ ] **Step 9.3: Manual smoke in F-Mark renderer**

Create a new managed agent with runtime `opencode`. Observe:
- Plugin auto-installs cleanly (or surfaces a clear "apply integration" prompt)
- MCP auto-installs cleanly
- Live agent streams prose to the session (assistant output)
- Tool-use events appear with correct success/failure
- Permission request flow works end-to-end (UI shows request, approval routes back to opencode and unblocks the agent)

- [ ] **Step 9.4: Update README / changelog**

If README mentions gemini, update to opencode.

- [ ] **Step 9.5: Final commit + summary**

```bash
git add -A
git commit -m "feat: replace gemini integration with opencode (closes #<issue>)"
```

---

## Self-Review

- **Spec coverage:** Every gemini touchpoint listed in "Files to modify" has a phase that handles it.
  - Phase 0: hot-tests (16 assumption probes, with 🛑 stop conditions for blockers)
  - Phase 1: plugin template (event-based assistant capture, sync permission block, session-resolution mirror)
  - Phase 2: hooksInstall adapter (sidecar metadata, explicit scope param)
  - Phase 3: mcpInstall adapter (JSONC support, opencode-specific status helper)
  - Phase 4: runtime registry (ADD opencode)
  - Phase 5: managedAgents spawn + access delivery (ADD opencode branches)
  - Phase 6: renderer + skill assets (ADD opencode)
  - Phase 7: hot E2E (PROOF before deletion)
  - Phase 8: DELETE gemini (gated on Phase 7 green)
  - Phase 9: final verification + manual smoke
- **Placeholder scan:** Plugin template has explicit `🔥 A0`/`🔥 A5`/`🔥 A17` markers for fields that Phase 0 will pin down. These are intentional unknowns, not vague placeholders.
- **Type consistency:** `OpencodeHookScope = "project" | "user"`, `FMARK_OPENCODE_PLUGIN_VERSION = "phase-opencode-v1"`, `statusFromOpencodeServer` consistently checks `environment` then `env`. Sidecar meta has fixed shape `{version, sha256, scope, installed_at}`.
- **Hot-test-first ordering**: Phase 0 has 6 explicit stop conditions; no code is written until those pass.
- **Reversibility**: ADD-then-DELETE phasing means at any point before Phase 8 the system runs both runtimes. If E2E fails, we revert opencode commits and keep gemini.
- **Test-typecheck gap**: Each TS-heavy phase ends with `pnpm -F kernel typecheck` BEFORE commit; final gate also includes `rg -n 'gemini' packages` to catch leftover strings the loose `RuntimeId` union doesn't.

**Outstanding architectural risks** (each maps to a Phase 0 stop condition):
- **A0 fail**: no assistant-output hook → fall back to MCP-only writes, headless `opencode run --format json` capture, or keep gemini until opencode adds the hook. Phase 1's `event` branch becomes dead code and must be removed.
- **A6/A15 fail**: permission can't block → degrade UI to observability-only; remove the approval CTA for opencode access cards; document loudly.
- **A8 fail**: env doesn't propagate → tmux manager writes a sidecar `{agentId, sessionId}` JSON to `.f-mark/agents/<id>/bind.json` and plugin reads it.
- **A1/A19 both fail**: plugin doesn't load by any mechanism → integration is impossible; abort.
- **A11.1 (`environment` key not honored)**: rewrite adapter to use `env` and remove `statusFromOpencodeServer`'s `environment` first-pass.
