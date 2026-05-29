# Model & Effort Control — Design + Implementation Plan (v2, post review_1)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Hot-test every assumption flagged with `🔥` against a live session before relying on it. Treat this doc as the strategic plan; `findings.md` is the empirical evidence; `review_1.md` is the buddy review that drove v2.

**Goal:** Expose, broadcast, and reliably change the **model** and **effort** for every managed agent in F-Mark (claude, codex, opencode), via a per-runtime adapter abstraction. Read live values for the UI badge; write via spawn-args + respawn — never mid-session slash-command injection.

**Architecture (one-liner):** Kernel-side `RuntimeAdapter` implementations own `listModels / listEfforts / readCurrent / buildSpawnArgs / sanitizeArgs`. Hook events trigger `readCurrent` from `autoStream`; results POST to a new kernel route that persists per-agent runtime state and publishes a single `managed-agent.updated` over the existing WS bus. Renderer store carries the new state on `ManagedAgent` so `AgentChip` can render a model/effort badge. Change = respawn after the kernel writes the override to `participants.json`, sanitizes the runtime's existing args, and re-spawns the tmux process.

**Tech Stack:** TypeScript (Node 20+; no `node:sqlite`, no `better-sqlite3`), existing F-Mark hook + WS infra, Vitest with real-file fixtures, no mocks of the file system or external CLIs (use real cached fixtures captured from live runs).

---

## Triage of `review_1.md` (Codex)

| # | Finding | Disposition in v2 |
|---|---------|-------------------|
| 1 | RuntimeAdapter shape: behavior in kernel, only DTOs in shared | **APPLIED**. Interface + registry moved to `packages/kernel/src/runtimes/adapters/`. Shared exports `ModelDescriptor`, `EffortDescriptor`, `CurrentRuntimeState`, `RuntimeOverridePatch`. `source` enum widened to `rollout | transcript | opencode-db | export | config | override | unknown`. |
| 2 | `readCurrent()` single state object is right; no stream | **AGREE** (no change). |
| 3 | OpenCode HTTP-first → use `opencode db`/SQLite/export | **APPLIED**. Primary = `opencode db --format json` keyed by hook-provided session ID. Fallback = direct SQLite read of `opencode.db` (still no native driver — use `opencode db`'s own SQLite path via the CLI). Last resort = `opencode export`. No `opencode serve`. |
| 4 | OpenCode variants via `opencode models --verbose` | **APPLIED**. Primary `listEfforts` path = parse `--verbose` JSON `variants` block. Hardcoded map = degraded fallback only. |
| 5 | Spawn-arg append unsafe (Codex/OpenCode duplicate-flag failures) | **APPLIED**. New per-runtime `sanitizeArgs(existing, overrideKeys)` step strips conflicting flags before appending the override. Cover `-m value`, `-m=value`, `--model value`, `--model=value`, `-c model=…`, `-c model_reasoning_effort=…`, `--effort value`, `--effort=value`, `--variant value`, `--variant=value`. |
| 6 | AgentStatusRow extension won't reach AgentChip — store reduces to ManagedAgent subset | **APPLIED**. Extend `ManagedAgent` in shared with `runtime_state?: CurrentRuntimeState`. Update `dispatchManagedAgentWsMessage` (`packages/renderer/src/state/store.ts:530-537`) to preserve it. Extend `AgentChipProps` and `TopBar` chip-prop builder (`packages/renderer/src/shell/TopBar.tsx:362-383`) to carry model/effort through. |
| 7 | Hook wire-up belongs in `autoStream`, not `post.ts` | **APPLIED**. Adapter `readCurrent` invocation lives in `autoStream.ts` after the existing session/participant resolution. POST result to a new kernel endpoint that persists + publishes ONE `managed-agent.updated`. `post.ts` gets a thin `postRuntimeState(payload)` helper, no adapter logic. |
| 8 | Codex readCurrent: `turn_context`, not `session_meta` line 1 | **APPLIED**. Codex adapter scans for the last `turn_context.payload.{model,effort}`. `session_index.jsonl` fallback removed — cwd-matched scan of `~/.codex/sessions/**` rollout files instead. |
| 9 | Claude has `--effort`; current-effort observability unknown | **HOT-TEST in Phase 0**. Plan includes effort for Claude both in `buildSpawnArgs` and `listEfforts`. If hot-test confirms no observability of *current* effort, the UI distinguishes "configured override" from "observed live state" and shows `—` for live effort while still allowing the override to be set. |
| 10 | Claude parser reuse not implementable as written | **APPLIED**. Claude adapter ships its own small JSONL metadata extractor (top-level `{type:"assistant", message:{model, ...}}` shape). `transcript.ts` not touched. |
| 11 | Override persistence + respawn are under-specified | **APPLIED**. Plan now includes: (a) extending `Participant` with `model_override?, effort_override?`, (b) widening the participant update route's `additionalProperties: false` (`packages/kernel/src/routes/participants.ts:92-107`) — but adding the new fields to a separate `PUT /managed-agents/:id/runtime` route instead of overloading the participant patch route, (c) explicit connected-agent restart sequence (kill tmux session, spawn with new args, preserve active F-Mark session, update runtime-session metadata, update presence). |
| 12 | `node:sqlite` conflicts with Node ≥20 + ignores `opencode db` | **APPLIED**. No native SQLite. All OpenCode DB reads via `opencode db --format json`. |
| — | `spawnArgsForRuntime` location: `routes/managedAgents.ts:121-170`, not `agents/managed.ts` | **APPLIED**. All file refs in this doc corrected. |

---

## Design

### 1. The adapter interface (kernel) + DTOs (shared)

**Shared — `packages/shared/src/runtimeAdapters.ts`** (DTOs only):

```ts
export type EffortLevel = string;

export interface ModelDescriptor {
  id: string;
  displayName: string;
  description?: string;
  provider?: string;
  efforts?: EffortDescriptor[];
  defaultEffort?: EffortLevel;
}

export interface EffortDescriptor {
  id: EffortLevel;
  displayName: string;
  description?: string;
}

export type RuntimeStateSource =
  | "rollout"        // codex
  | "transcript"     // claude
  | "opencode-db"    // opencode primary
  | "export"         // opencode last-resort
  | "sqlite"         // opencode middle fallback
  | "config"         // codex global config.toml
  | "override"       // we just wrote it; not yet observed
  | "unknown";

export interface CurrentRuntimeState {
  model?: string;
  effort?: EffortLevel;
  provider?: string;
  source: RuntimeStateSource;
  observedAt: number;     // epoch ms
  configuredModel?: string;
  configuredEffort?: EffortLevel;
}

export interface RuntimeOverridePatch {
  model?: string;
  effort?: EffortLevel;
}
```

**Kernel — `packages/kernel/src/runtimes/adapters/types.ts`** (behavior interface):

```ts
import type {
  ModelDescriptor, EffortDescriptor, CurrentRuntimeState, RuntimeOverridePatch
} from "@f-mark/shared";

export interface RuntimeAdapter {
  runtimeId: "claude" | "codex" | "opencode";

  listModels(opts?: { refresh?: boolean }): Promise<ModelDescriptor[]>;
  listEfforts(modelId?: string): Promise<EffortDescriptor[]>;

  readCurrent(ctx: {
    sessionId?: string;        // runtime session id (from hook)
    cwd?: string;
    transcriptPath?: string;   // primary input from autoStream
  }): Promise<CurrentRuntimeState | null>;

  buildSpawnArgs(opts: RuntimeOverridePatch): string[];
  buildSpawnEnv(opts: RuntimeOverridePatch): Record<string, string>;

  /**
   * Strip flags from `existing` that would conflict with the override keys
   * present in `patch`. Returns a NEW array, never mutates input.
   * Critical because Codex/OpenCode crash on duplicate -m/--variant.
   */
  sanitizeArgs(existing: string[], patch: RuntimeOverridePatch): string[];
}

export function getAdapter(runtimeId: string): RuntimeAdapter | null;  // null for unknown/custom
```

### 2. Per-runtime adapter behaviors

#### Codex (`adapters/codex.ts`)

- `listModels({refresh})`: read `~/.codex/models_cache.json`, filter `visibility === "list"`, map to `ModelDescriptor` with `efforts` from `supported_reasoning_levels`.
- `listEfforts(modelId)`: look up the same cache. If `modelId` omitted, return union.
- `readCurrent(ctx)`:
  1. If `transcriptPath` present → scan file (forward; keep latest `turn_context.payload.{model,effort}`). Return `{model, effort, source:"rollout"}`.
  2. Else → glob recent rollouts under `~/.codex/sessions/YYYY/MM/DD/`, bounded to last N=20 files by mtime, parse `session_meta.payload.cwd` and match against `ctx.cwd`. Take latest match; do the same scan.
  3. Last resort → parse `~/.codex/config.toml` `{model, model_reasoning_effort}`; return with `source:"config"`.
- `buildSpawnArgs({model, effort})`:
  - `model` → `["-m", model]`
  - `effort` → `["-c", `model_reasoning_effort=${effort}`]`
- `sanitizeArgs(existing, patch)`:
  - If `patch.model` → strip `-m`/`--model` plus their values, AND `-c model=…` (both forms). Codex rejects duplicate `-m`.
  - If `patch.effort` → strip `-c model_reasoning_effort=…` (both forms).
  - Forms covered: space-separated and `=`-separated. Tests for each.

#### Claude (`adapters/claude.ts`)

- `listModels()`: hardcoded `[{id:"claude-opus-4-7", displayName:"Opus 4.7"}, {id:"claude-sonnet-4-6", displayName:"Sonnet 4.6"}, {id:"claude-haiku-4-5", displayName:"Haiku 4.5"}]` + alias forms. Optionally probed via `claude --help` once at startup and cached for 24h.
- `listEfforts()`: hardcoded `[{id:"low"}, {id:"medium"}, {id:"high"}, {id:"xhigh"}, {id:"max"}]` (matches `claude --help` output for Claude Code 2.1.128).
- `readCurrent(ctx)`:
  - If `transcriptPath` → read JSONL backwards (or read fully, scan to end), find latest entry with `entry.message?.model`. Return `{model: entry.message.model, source:"transcript", observedAt:now}`.
  - **Effort observability is a Phase 0 hot-test**. If observable → include `effort`. If not → return `effort: undefined` and let the UI render configured-override-only.
- `buildSpawnArgs({model, effort})`:
  - `model` → `["--model", model]`
  - `effort` → `["--effort", effort]`
- `sanitizeArgs(existing, patch)`:
  - If `patch.model` → strip `--model`/`-m` and value (both forms).
  - If `patch.effort` → strip `--effort` and value (both forms).

#### OpenCode (`adapters/opencode.ts`)

- `listModels({refresh})`:
  - Run `opencode models --verbose` (subprocess), parse interleaved `provider/model\n{json}\n…` blocks.
  - Cache for 5 minutes; `refresh:true` invalidates and re-runs (optionally with `--refresh`).
  - Each entry → `ModelDescriptor { id: "provider/model", displayName: jsonName, provider: providerID, efforts: variants → EffortDescriptor[] }`.
- `listEfforts(modelId)`:
  - Look up the cached `--verbose` JSON for that model; extract `variants` block.
  - Fallback (`models --verbose` unavailable / model not found): provider hardcoded map — `openai: [low,medium,high,xhigh]`, `github-copilot: [low,high,max]`, `google: [low,medium,high]`.
- `readCurrent(ctx)`:
  1. Primary: `opencode db --format json "SELECT model, agent, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write FROM session WHERE id = ?"` parameterised on `ctx.sessionId`. Parse `model` column JSON `{id, providerID, variant}`.
  2. If no `sessionId` → similar query keyed by `directory = ctx.cwd ORDER BY time_updated DESC LIMIT 1`.
  3. Fallback: `opencode export <sessionID>` — heavy, only if `db` fails.
- `buildSpawnArgs({model, effort})`:
  - `model` → `["-m", model]` (already in `provider/model` form)
  - `effort` → `["--variant", effort]`
- `sanitizeArgs(existing, patch)`:
  - If `patch.model` → strip `-m`/`--model` (OpenCode duplicate -m crashes with `D.split is not a function`).
  - If `patch.effort` → strip `--variant` (both forms; duplicate variants fail validation).

### 3. Data flow

**Read flow:**
```
runtime turn ends
  → hook fires (Stop / PostToolUse) → autoStream.ts
  → adapter.readCurrent({sessionId, cwd, transcriptPath})
  → POST /managed-agents/:participantId/runtime-state {model, effort, provider, source, observedAt, tokens?, cost?}
  → kernel persists in-memory + appends to runtime-state log (optional file)
  → kernel publishes ONE managed-agent.updated containing the row + new runtime_state
  → renderer dispatchManagedAgentWsMessage preserves runtime_state on ManagedAgent
  → TopBar builds chip props with model/effort/provider
  → AgentChip renders <ModelBadge>
```

**Write flow:**
```
user picks model/effort in modal
  → PUT /managed-agents/:participantId/runtime {model?, effort?}
  → kernel validates patch via adapter listModels/listEfforts
  → kernel writes participant.model_override / participant.effort_override to participants.json
  → kernel begins restart sequence:
      - kill existing tmux session (if any)
      - sanitizedArgs = adapter.sanitizeArgs(runtime.args, patch)
      - spawnArgs = [...sanitizedArgs, ...adapter.buildSpawnArgs(patch), launchPrompt]
      - spawnEnv = {...runtime.env, ...adapter.buildSpawnEnv(patch)}
      - reuse spawnArgsForRuntime path in routes/managedAgents.ts:121-170
      - preserve F-Mark session binding (don't reissue session id)
      - update runtime-session metadata
      - update presence/tracker
  → publish ONE managed-agent.updated with runtime_state.source = "override"
  → on next hook fire, readCurrent confirms via "rollout"/"transcript"/"opencode-db"
```

### 4. UI surface

- **`ModelBadge.tsx`** — small pill child of `AgentChip`. Format: `Opus 4.7 · high` or `gpt-5.5 · xhigh`. Tooltip shows `provider`, `source`, age, configured vs observed.
- **`RuntimeControlModal.tsx`** — opened via chip click:
  - Two selects: Model, Effort (efforts re-fetched when model changes).
  - Confirm button labeled "Restart agent with new model/effort" — the modal is explicit about restart.
  - On confirm → PUT, modal closes when respawn completes (WS confirms `runtime_state.source !== "override"`).
- **Asymmetry handling**: For Claude, if Phase 0 confirms no current-effort observability, badge shows `—` for live effort but the override picker still works (label: "Configured: high · live: —").

### 5. Files to create / modify

#### Create

- `packages/shared/src/runtimeAdapters.ts` — DTO types
- `packages/kernel/src/runtimes/adapters/types.ts` — `RuntimeAdapter` interface
- `packages/kernel/src/runtimes/adapters/codex.ts`
- `packages/kernel/src/runtimes/adapters/claude.ts`
- `packages/kernel/src/runtimes/adapters/opencode.ts`
- `packages/kernel/src/runtimes/adapters/index.ts` — `getAdapter(runtimeId)`
- `packages/kernel/src/runtimes/argSanitizer.ts` — generic flag-stripping helpers used by adapters
- `packages/kernel/src/services/runtimeState.ts` — in-memory store + publish helper
- `packages/kernel/src/routes/runtimeControl.ts` — REST endpoints
- `packages/kernel/tests/runtimes/adapters/{codex,claude,opencode}.test.ts`
- `packages/kernel/tests/runtimes/argSanitizer.test.ts` — duplicate-flag matrix
- `packages/kernel/tests/runtimes/respawn.test.ts` — connected-agent restart
- `packages/renderer/src/components/ModelBadge.tsx`
- `packages/renderer/src/modals/RuntimeControlModal.tsx`

#### Modify (verified line refs from review_1)

- `packages/shared/src/managedAgents.ts:24-31` — `RuntimeEntry` untouched
- `packages/shared/src/managedAgents.ts:167-183` — extend `AgentStatusRow` with `runtime_state?: CurrentRuntimeState` (and optional `tokens?`, `cost?` if we surface them v1)
- `packages/shared/src/managedAgents.ts` (`ManagedAgent` type, wherever it lives) — add `runtime_state?: CurrentRuntimeState`
- `packages/shared/src/participants.ts:3-19` — add `model_override?: string`, `effort_override?: string` to `Participant`
- `packages/kernel/src/participants.ts:245-275, 288-317` — extend write helpers to update override fields
- `packages/kernel/src/routes/managedAgents.ts:121-170` (`spawnArgsForRuntime`) — call `adapter.sanitizeArgs(runtime.args, patch)` then concat `adapter.buildSpawnArgs(patch)` BEFORE `launchPrompt`. Same for env.
- `packages/kernel/src/routes/managedAgents.ts:1088-1093, 1421-1426` — pass participant override to spawn
- `packages/kernel/src/routes/managedAgents.ts:630-637` (publisher) — include new `runtime_state` in the published row
- `packages/kernel/src/routes/managedAgents.ts:1055-1064` (reconnect) — if override changed since last spawn, route through restart path instead
- `packages/kernel/src/hooks/autoStream.ts:1012-1114` — after session/participant resolution on `PostToolUse` and Stop, call `adapter.readCurrent(...)` and POST to new route via `postRuntimeState`
- `packages/kernel/src/hooks/post.ts` — add `postRuntimeState(payload)` thin helper (mirrors `postEvent`)
- `packages/renderer/src/state/store.ts:530-537` (`dispatchManagedAgentWsMessage`) — preserve `runtime_state` from incoming row
- `packages/renderer/src/state/presence.ts:13-23` (`ManagedAgent`) — add field
- `packages/renderer/src/shell/TopBar.tsx:362-383` — pass `runtime_state.model/effort/provider` into chip props
- `packages/renderer/src/components/AgentChip.tsx:19-29` — extend `AgentChipProps`; render `<ModelBadge>` after the state dot
- `packages/renderer/src/components/chips.css` — `.agent-chip-model-pill` style matching existing pill
- `packages/renderer/src/panels/right/RightAgents.tsx:86-104` — surface model/effort/provider/tokens in the agent detail panel

#### Lightly touch / verify only

- `packages/kernel/src/runtimes/defaults.ts:3-6` — still has `gemini`; OpenCode adapter implementation does NOT require gemini→opencode rename to land first, but Phase 10 E2E does (see Phase 0 / dependency note).
- `packages/shared/src/integrations.ts:1` — `RuntimeId` type; widen if needed.

### 6. Dependency on `replace-gemini-with-opencode`

Review_1 §11 caught this: OpenCode is not yet a registered runtime in `defaults.ts`. Plan: implement adapters and end-to-end paths now; **the OpenCode adapter is testable against fixtures without OpenCode being a registered runtime**. The end-to-end Phase 10 with all three runtimes is gated on `replace-gemini-with-opencode` landing. Until then, Phase 10 runs against claude + codex only; OpenCode coverage is unit/integration with real-CLI calls.

---

## Phased implementation plan

Each phase ends with `pnpm -F kernel typecheck && pnpm -F shared typecheck` minimum. Frontend phases also `pnpm -F renderer typecheck`.

### Phase 0 — Hot-tests (no code yet; results to `hot-test-results.md`)

- [ ] **🔥 Codex `models_cache.json` refresh trigger**: does ANY codex subcommand re-fetch? (`codex doctor`, `codex models` if exists, `codex --version`). Run each, diff `fetched_at`. Document trigger or confirm "client-internal only".
- [ ] **🔥 Codex rollout schema stability**: across 3+ recent rollouts on this machine, verify `turn_context.payload.{model,effort}` is consistently present. Note any older-format rollouts (legacy `reasoning_effort` key).
- [ ] **🔥 Codex cwd-scan fallback feasibility**: simulate "no transcriptPath" — given a cwd and ~20 latest rollouts, can we match the right session in <100ms?
- [ ] **🔥 Claude current-effort observability**: spawn `claude --effort high` and look for the effort in `~/.claude/projects/.../*.jsonl`, `~/.claude/settings.json`, and any debug output. Record where (if anywhere) the live value can be read.
- [ ] **🔥 Claude transcript metadata extractor**: confirm assistant entries have `{type:"assistant", message:{model, ...}}` across Opus, Sonnet, Haiku sessions. Three sessions.
- [ ] **🔥 OpenCode `models --verbose` parse**: capture stdout against this machine; confirm interleaved `provider/model` + `{json}` shape with `variants` block.
- [ ] **🔥 OpenCode `db --format json` query**: run an actual SELECT against `~/.local/share/opencode/opencode.db` via the CLI. Confirm output shape; measure latency.
- [ ] **🔥 OpenCode `export <sessionID>` for fallback**: confirm `info.model` shape against a real session.
- [ ] **🔥 Spawn arg duplicate-flag matrix**: capture exact error/behavior for each runtime, each flag:
  - codex: `-m`, `--model`, `-c model=…`, `-c model_reasoning_effort=…` (effort already verified; redo for completeness)
  - claude: `--model`, `--effort`, `-m`
  - opencode: `-m`, `--variant`
- [ ] Write `planning/model-effort-control/hot-test-results.md` with one section per probe.
- [ ] Commit: `chore(model-effort): hot-test results for v2 adapter design`

### Phase 1 — Shared DTOs + AgentStatusRow + ManagedAgent extensions

- [ ] Create `packages/shared/src/runtimeAdapters.ts` (DTOs only).
- [ ] Extend `AgentStatusRow` (`packages/shared/src/managedAgents.ts:167-183`) with `runtime_state?: CurrentRuntimeState`. Optional `tokens?`, `cost?` deferred to a later phase.
- [ ] Extend `ManagedAgent` in shared with `runtime_state?: CurrentRuntimeState`.
- [ ] Extend `Participant` (`packages/shared/src/participants.ts:3-19`) with `model_override?`, `effort_override?`.
- [ ] `pnpm -F shared build && pnpm -F kernel typecheck && pnpm -F renderer typecheck`
- [ ] Commit: `feat(shared): runtime adapter DTOs + ManagedAgent/AgentStatusRow runtime_state field`

### Phase 2 — Generic arg sanitizer (used by all adapters)

- [ ] **Failing test** `argSanitizer.test.ts`: given `["-m","old","--effort","low","-c","model=foo"]` and patch `{model:"new"}`, return `["--effort","low"]` (only `model`-related stripped). Cover space- and equals-separated forms. Cover `-c model=…`.
- [ ] Implement `stripFlag(args, name, options?: {alsoStripValue:true|false, alsoCKey?: string})` and a higher-level `sanitizeArgs(args, runtime, patch)`.
- [ ] Run tests → green.
- [ ] Commit: `feat(kernel/runtimes): generic arg sanitizer with duplicate-flag stripping`

### Phase 3 — Codex adapter

- [ ] **Failing test**: `listModels()` reads a fixture `models_cache.json` and returns 7 descriptors with efforts populated.
- [ ] Implement.
- [ ] **Failing test**: `readCurrent({transcriptPath})` extracts model + effort from a fixture rollout JSONL by finding last `turn_context` entry.
- [ ] Implement.
- [ ] **Failing test**: `readCurrent({cwd, no transcriptPath})` cwd-scan fallback against fixture `sessions/` dir.
- [ ] Implement.
- [ ] **Failing test**: `readCurrent` config.toml last-resort.
- [ ] Implement.
- [ ] **Failing test**: `buildSpawnArgs({model:"gpt-5.5",effort:"xhigh"})` returns `["-m","gpt-5.5","-c","model_reasoning_effort=xhigh"]`.
- [ ] Implement.
- [ ] **Failing test**: `sanitizeArgs(["-m","old","-c","model_reasoning_effort=low","--other"], {model:"new",effort:"high"})` returns `["--other"]`. Plus matrix tests for `-m=foo` and `-c model=foo`.
- [ ] Implement (via Phase 2 helpers).
- [ ] Commit: `feat(adapters): codex runtime adapter (list/read/build/sanitize)`

### Phase 4 — Claude adapter

- [ ] **Failing test**: `listModels()` returns hardcoded list.
- [ ] Implement.
- [ ] **Failing test**: `listEfforts()` returns the 5 levels from `claude --help` (`low/medium/high/xhigh/max`).
- [ ] Implement.
- [ ] **Failing test**: `readCurrent({transcriptPath})` reads a fixture Claude JSONL and extracts last `entry.message.model`.
- [ ] Implement a small adapter-local JSONL extractor (do NOT touch `transcript.ts`).
- [ ] **Failing test**: `readCurrent` returns `effort: undefined` until Phase 0 result says otherwise (if Phase 0 finds observability, add a follow-up test for that path).
- [ ] **Failing test**: `buildSpawnArgs({model,effort})` returns `["--model", model, "--effort", effort]`.
- [ ] Implement.
- [ ] **Failing test**: `sanitizeArgs` strips `--model`/`-m` and `--effort`.
- [ ] Implement.
- [ ] Commit: `feat(adapters): claude runtime adapter (list/read/build/sanitize)`

### Phase 5 — OpenCode adapter

- [ ] **Failing test**: `listModels()` parses captured `opencode models --verbose` stdout fixture into N descriptors with `variants`.
- [ ] Implement subprocess wrapper + parser.
- [ ] **Failing test**: `listEfforts("openai/gpt-5.5")` returns the model's `variants` block as EffortDescriptors.
- [ ] Implement.
- [ ] **Failing test**: `readCurrent({sessionId})` shells out to `opencode db --format json` against a fixture DB (use a small SQLite created at test setup OR a captured CLI-stdout fixture). Returns `{id, providerID, variant}` parsed correctly.
- [ ] Implement.
- [ ] **Failing test**: `readCurrent({cwd, no sessionId})` query by `directory` column.
- [ ] Implement.
- [ ] **Failing test**: `buildSpawnArgs({model,effort})` returns `["-m", model, "--variant", effort]`.
- [ ] Implement.
- [ ] **Failing test**: `sanitizeArgs` strips `-m`/`--model` and `--variant`.
- [ ] Implement.
- [ ] Commit: `feat(adapters): opencode runtime adapter (list/read/build/sanitize)`

### Phase 6 — Adapter registry + spawn-args wire-up

- [ ] Create `adapters/index.ts` with `getAdapter(runtimeId): RuntimeAdapter | null`. Unknown id returns `null` (not throw — custom runtimes are valid).
- [ ] **Failing test**: registry returns each adapter; unknown returns null.
- [ ] Implement.
- [ ] Modify `spawnArgsForRuntime` (`packages/kernel/src/routes/managedAgents.ts:121-170`) to take an optional `RuntimeOverridePatch` parameter. Logic:
  ```
  baseArgs = runtime.args
  if (adapter && patch) {
    baseArgs = adapter.sanitizeArgs(baseArgs, patch);
    baseArgs = [...baseArgs, ...adapter.buildSpawnArgs(patch)];
  }
  return [...baseArgs, ...prependName, ...launchPrompt];
  ```
- [ ] Modify call sites (`:1088-1093, :1421-1426`) to pass the participant's override.
- [ ] **Failing test**: spawning codex with `participant.model_override="gpt-5.4", effort_override="high"` and a `runtimes.json.args = ["-m","gpt-5.5"]` produces final args containing `-m gpt-5.4 -c model_reasoning_effort=high` and NOT containing `-m gpt-5.5`.
- [ ] Implement & run.
- [ ] Commit: `feat(kernel/spawn): adapter-driven sanitize+inject for model/effort overrides`

### Phase 7 — Server-side runtime state service + hook wire-up

- [ ] Create `services/runtimeState.ts`: in-memory `Map<participantId, CurrentRuntimeState>`, getter, setter, optional disk log.
- [ ] **Failing test (unit)**: setter publishes `managed-agent.updated` with `runtime_state` populated.
- [ ] Implement.
- [ ] Create `routes/runtimeControl.ts` `POST /managed-agents/:participantId/runtime-state` — body validates against `CurrentRuntimeState` shape; updates service; publishes.
- [ ] **Failing test (route)**: POSTing a payload updates the row published.
- [ ] Implement.
- [ ] Add `postRuntimeState(participantId, state)` helper to `packages/kernel/src/hooks/post.ts` (no adapter logic).
- [ ] Modify `packages/kernel/src/hooks/autoStream.ts:1012-1114`:
  - On Stop / PostToolUse, after session/participant resolution: `adapter = getAdapter(runtime_id); if (adapter) { state = await adapter.readCurrent({sessionId, cwd, transcriptPath}); if (state) await postRuntimeState(participantId, state); }`
- [ ] **Failing test (integration)**: a fake codex Stop hook fires through `autoStream`, the rollout fixture is consulted, the WS bus emits a `managed-agent.updated` with `runtime_state.model="gpt-5.5"`.
- [ ] Implement & run.
- [ ] Same integration test for claude (transcript fixture) and opencode (db fixture).
- [ ] Commit: `feat(kernel/hooks): publish runtime state on Stop/PostToolUse via adapters`

### Phase 8 — Runtime control REST endpoints + override persistence

- [ ] Create `routes/runtimeControl.ts` (additional endpoints):
  - `GET /managed-agents/:id/runtime/state` → current `CurrentRuntimeState` from service
  - `GET /managed-agents/:id/runtime/models?refresh=` → adapter `listModels`
  - `GET /managed-agents/:id/runtime/efforts?model=` → adapter `listEfforts`
  - `PUT /managed-agents/:id/runtime` body `{model?, effort?}` → validate, persist participant override, restart
- [ ] **Failing test**: `GET /models` returns the adapter list.
- [ ] Implement.
- [ ] **Failing test**: `GET /efforts?model=…` returns the right list.
- [ ] Implement.
- [ ] **Failing test**: `PUT /` validates the patch against `listModels/listEfforts`; rejects unknown model/effort with 400.
- [ ] Implement.
- [ ] Extend `participants.ts` write helpers (`packages/kernel/src/participants.ts:245-275, 288-317`) with override persistence.
- [ ] **Failing test**: PUT persists override to participants.json AND triggers the restart sequence (use a test fake for tmux spawn).
- [ ] Implement restart sequence:
  1. read participant; merge patch; write participants.json
  2. if managed agent is connected: kill tmux session via existing helper
  3. spawn with `spawnArgsForRuntime(runtime, participant.overrides)` (now sanitizing+injecting)
  4. preserve `active_session` binding (re-bind)
  5. update runtime-session metadata
  6. publish ONE `managed-agent.updated` with `runtime_state.source = "override"`
- [ ] Commit: `feat(kernel/routes): runtime control endpoints + override persistence + restart`

### Phase 9 — Renderer store + UI badge + modal

- [ ] Extend `ManagedAgent` in `packages/renderer/src/state/presence.ts:13-23` with `runtime_state?`.
- [ ] Update `dispatchManagedAgentWsMessage` (`packages/renderer/src/state/store.ts:530-537`) to preserve `runtime_state`.
- [ ] **Manual UI test**: spawn a Codex agent, do a turn, kernel publishes; verify store carries `runtime_state` (DevTools).
- [ ] Create `ModelBadge.tsx`. Accept `{model, effort, provider, source}` props; render compact pill.
- [ ] Extend `AgentChipProps` in `AgentChip.tsx:19-29` and `TopBar.tsx:362-383` builder to pass model/effort/provider.
- [ ] Render `<ModelBadge>` after the state dot.
- [ ] Style in `chips.css` matching existing `.agent-chip-pill`.
- [ ] **Manual UI test**: badge shows for codex / claude / opencode after first turn each.
- [ ] Create `RuntimeControlModal.tsx`:
  - Open via chip click (or context menu entry).
  - Fetches `/runtime/models`, populates model select.
  - On model change, fetches `/runtime/efforts?model=` and populates effort select.
  - Confirm button "Restart agent with new model/effort" — explicit about restart.
  - Calls `PUT /runtime`, shows progress, closes on the WS update with non-override `source`.
- [ ] **Manual UI test**: change model on a codex agent; agent respawns; badge updates from "override" → "rollout".
- [ ] Commit: `feat(renderer): runtime state badge + control modal`

### Phase 10 — Final gates

- [ ] `pnpm -F shared build && pnpm -F kernel typecheck && pnpm -F renderer typecheck`
- [ ] `pnpm -F kernel test && pnpm -F renderer test`
- [ ] Manual E2E (gated on which runtimes are registered in this tree):
  - claude: model badge shows, change works, respawn observed
  - codex: same
  - opencode: gated on `replace-gemini-with-opencode` landing. If not, document deferral in `progress.md` and run the OpenCode adapter against its unit/integration tests only.
- [ ] Update CLAUDE.md / runtime docs if user-facing instructions reference model/effort selection.
- [ ] Commit: `chore(model-effort-control): final typecheck + tests + docs`

---

## Risks / non-goals

- **Not**: a unified model/effort taxonomy. Each runtime keeps its own labels (gpt-5.5 vs claude-sonnet-4-6 vs github-copilot/claude-sonnet-4.6). The badge shows what the runtime calls them.
- **Not**: mid-session change via slash-command injection. Unreliable; respawn is the contract.
- **Not**: Anthropic / OpenAI / Google API key handling for model discovery. F-Mark stays out of API keys.
- **Not**: token/cost telemetry in v1 even though OpenCode hands it to us. Add in a follow-up after badge ships.
- **Risk**: Codex `models_cache.json` format changes between codex versions. Mitigation: detect `client_version` and gracefully degrade to "model list unknown — type the slug" if shape mismatches.
- **Risk**: `opencode db` CLI gates on the DB not being locked by a running opencode TUI. Mitigation: SQLite uses WAL; concurrent reads should be safe; if not, `opencode export` is the fallback.
- **Risk**: Claude effort observability comes back negative from Phase 0; UI must handle the asymmetry. Mitigation: design the badge with "configured vs live" already in mind.
