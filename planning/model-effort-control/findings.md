# Model & Effort Control — Empirical Findings (v2, post-review_1)

> Verified against live local sessions on 2026-05-27 → 2026-05-28. Every file path / field name / flag below was confirmed by reading actual data or running the CLI on this machine; none of this is inferred from docs. v2 corrects three stale claims from v1 caught in `review_1.md`: Claude has `--effort`, Codex model lives in `turn_context` (not line-1 `session_meta`), and OpenCode exposes structured variants via `opencode models --verbose`.

## Question

Can F-Mark **reliably get and set** the model + reasoning effort for each runtime (claude, codex, opencode), via commands rather than scraping files where possible? What are the actual surfaces each runtime exposes?

## TL;DR per runtime

| Runtime  | List models                                            | List efforts                                           | Current (live) model                                                   | Current (live) effort                              | Set model                                | Set effort                                                       |
|----------|---------------------------------------------------------|---------------------------------------------------------|-------------------------------------------------------------------------|-----------------------------------------------------|-------------------------------------------|-------------------------------------------------------------------|
| codex    | `~/.codex/models_cache.json` (auto-refreshed)          | per-model `supported_reasoning_levels[]` in same file  | rollout JSONL — scan for last `turn_context.payload.model`              | same `turn_context.payload.effort`                  | `codex exec -m <slug>`                    | `-c model_reasoning_effort=<eff>`                                 |
| claude   | hardcode (small set); optional `claude --help` probe   | `low/medium/high/xhigh/max` (from `claude --help`)     | transcript JSONL — last assistant entry `message.model`                 | **unknown** — not yet observed in transcript; needs hot-test | `claude --model <name>` at startup        | `claude --effort <level>` at startup                              |
| opencode | `opencode models --verbose` (structured JSON per model)| `models --verbose` → per-model `variants` block        | `opencode db --format json "SELECT model FROM session WHERE id=?"`      | same column's JSON `variant`                        | `opencode run -m <prov>/<model>`          | `--variant <name>`                                                |

## Codex — most structured surface

### Models + efforts registry

`~/.codex/models_cache.json` is an auto-refreshed registry maintained by the codex client. Shape:

```json
{
  "fetched_at": "2026-05-27T10:13:16Z",
  "etag": "W/\"...\"",
  "client_version": "0.133.0",
  "models": [
    {
      "slug": "gpt-5.5",
      "display_name": "GPT-5.5",
      "default_reasoning_level": "medium",
      "supported_reasoning_levels": [
        {"effort": "low",    "description": "Fast responses with lighter reasoning"},
        {"effort": "medium", "description": "Balances speed and reasoning depth for everyday tasks"},
        {"effort": "high",   "description": "Greater reasoning depth for complex problems"},
        {"effort": "xhigh",  "description": "Extra high reasoning depth for complex problems"}
      ],
      "supported_in_api": true,
      "priority": 9,
      "visibility": "list",
      ...
    }
  ]
}
```

7 models present locally: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`, `codex-auto-review`. Filter by `visibility === "list"` to drop hidden entries.

**Refresh behavior:** The cache is refreshed by the codex client itself on its own cadence. F-Mark should treat it as read-only; staleness is bounded by user activity. No need to invoke a refresh subcommand from F-Mark.

### Current per-session — CORRECTED (review_1 §7)

Codex rollouts live at `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<session-id>.jsonl`.

**Line 1 is `session_meta`** with payload keys `{id, timestamp, cwd, originator, cli_version, source, thread_source, model_provider, base_instructions, git}` — note `model_provider` is present but **`model` is NOT**.

**Model + effort live in `turn_context` entries** (one per turn). Payload keys: `{turn_id, cwd, current_date, timezone, approval_policy, sandbox_policy, permission_profile, model, personality, collaboration_mode, realtime_active, effort, summary}`.

Verified: `grep -m1 '"type":"turn_context"'` on a live rollout returns `{model: "gpt-5.5", effort: "xhigh"}`.

**Read strategy for `readCurrent`:**
1. If `transcriptPath` from hook payload exists → scan the file for the last `turn_context` entry; return `{model, effort, source: "rollout"}`.
2. Else (no transcript path) → scan recent rollout files under `~/.codex/sessions/**` (bounded by mtime/count), match on `session_meta.payload.cwd === ctx.cwd`, return the latest match.
3. Last resort → `~/.codex/config.toml` `{model, model_reasoning_effort}`.

⚠️ **`~/.codex/session_index.jsonl` is NOT a cwd index** (review_1 caught this). Each line is `{id, thread_name, updated_at}` — no cwd field. Earlier draft of this doc claimed it could be used for cwd matching; it cannot.

### Current global

`~/.codex/config.toml`:

```toml
model = "gpt-5.5"
model_reasoning_effort = "xhigh"
```

### Set — via spawn args

- `codex exec -m gpt-5.4` — sets model
- `codex -c model_reasoning_effort=high` — sets effort
- Both slot directly into F-Mark's `RuntimeEntry.args` array.

**Conflict behavior (review_1 §4, verified):**
- Codex v0.133 rejects duplicate `-m/--model`: `error: the argument '--model <MODEL>' cannot be used multiple times`. ⚠️ Last-wins is NOT supported.
- Codex `-m` takes precedence over `-c model=...` regardless of order. → The arg sanitizer must strip BOTH `-m value` AND `-c model=value` when applying a model override.

## OpenCode — best CLI integration surface

### Models registry — `opencode models --verbose`

`opencode models --verbose` prints both the `provider/model` line AND a JSON block per model. The JSON includes `capabilities.reasoning`, `cost`, `limit`, and crucially a `variants` block with per-provider reasoning levels:

```text
opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  ...
  "capabilities": { "reasoning": true, ... },
  "cost": { "input": 0, "output": 0, "cache": {...} },
  "limit": { "context": 200000, "input": 160000, "output": 32000 }
}
```

Per `opencode models --help`: `--refresh` forces re-fetch; `--verbose` includes the JSON metadata.

**Variants discovery (review_1 §3):** `opencode models openai --verbose` returns each model's `variants` object with `reasoningEffort` values. Use this as the primary `listEfforts()` source; hardcoded per-provider variant maps are a degraded fallback only.

### Current per-session — via `opencode db --format json` (review_1 §2 + §12)

`opencode db` is a CLI wrapper around the SQLite DB:

```
opencode db [query]     open an interactive sqlite3 shell or run a query
opencode db path        print the database path
opencode db migrate     migrate JSON data to SQLite
  --format <json|tsv>   default tsv
```

Example: `opencode db --format json "SELECT id, agent, model, cost, tokens_input, tokens_output FROM session WHERE id = 'ses_...'"` returns JSON, no SQLite driver dependency required.

The `session.model` column is a JSON blob: `{"id":"gemini-3.1-pro-preview","providerID":"github-copilot","variant":"high"}`. So in one query F-Mark gets model + provider + effort variant.

Additional columns of interest: `agent`, `cost`, `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write` — free telemetry for AgentStatusRow if we want it later.

**Fallback chain for `readCurrent`:**
1. Primary: `opencode db --format json "SELECT model, agent, ... FROM session WHERE id = ?"` keyed by the OpenCode session ID delivered via the hook/plugin (see `planning/replace-gemini-with-opencode/summary.md:45` — hooks expose session ID).
2. Fallback: direct SQLite read at `~/.local/share/opencode/opencode.db` (no native driver needed if we use `opencode db`; only used if CLI is broken).
3. Last resort: `opencode export <sessionID>` — JSON dump of the full session, `info.model/info.tokens/info.cost` at top level. Heavy.

⚠️ **No HTTP, no `opencode serve` supervision.** Earlier draft made HTTP the primary path; review_1 §2 correctly flagged the operational complexity. The OpenCode replacement plan already keeps the TUI in tmux and provides session IDs via hooks — that's enough.

### Set — via spawn args

- `opencode run -m <provider>/<model> --variant <name>` — non-interactive
- F-Mark's `RuntimeEntry.args` carries these into the tmux spawn.

**Conflict behavior (review_1 §4, verified):**
- OpenCode 1.15.11 does NOT last-win on duplicate `-m`: results in `D.split is not a function`.
- Duplicate `--variant` also fails validation (e.g. `["high","max"]`).
- → Sanitizer must strip both before applying overrides.

## Claude Code — CORRECTED (review_1 §8)

### Models list

No on-disk registry. Options:
1. **Hardcoded static list** (primary): `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5` (plus aliases `opus`, `sonnet`, `haiku`).
2. Optional refresh by parsing `claude --help` — the help text lists model examples but not the canonical list. Best as a sanity check, not source of truth.

### Effort list — IT EXISTS

`claude --help` (Claude Code 2.1.128) advertises:

```
--effort <level>   Effort level for the current session (low, medium, high, xhigh, max)
```

That's a 5-level effort scale matching Codex's plus `max`. **v1 of the plan claimed Claude had no effort knob; this was wrong.**

⚠️ **Current effort observability is unknown.** The flag exists for *setting*, but it's unclear whether the current effort is recorded anywhere observable — not in the transcript JSONL (initial inspection didn't show it), possibly in `~/.claude/settings.json` or a session-state file. Phase 0 must hot-test this. If no observation path exists, the UI must distinguish "configured override" from "observed live effort" rather than showing a fake reading.

### Current per-session model

`~/.claude/projects/<sanitized-cwd>/<session-id>.jsonl` — each assistant event has top-level shape `{type:"assistant", message:{role:"assistant", model:"claude-opus-4-7", content:[...]}}`. The `message.model` is what we want.

⚠️ **The existing `transcript.ts` parser cannot be reused as-is (review_1 §10).** `RawEntry` (`packages/kernel/src/hooks/transcript.ts:12-20`) is private, shaped `{role, content}` directly (no nested `message`), and `parseJsonl` is private. `extractLastAssistantTurn` returns only `TurnBlock[]` and drops metadata. The Claude adapter needs its own light parser.

### Set — via spawn args

- `claude --model <name>` — sets model at startup; flows through F-Mark's existing `RuntimeEntry.args`.
- `claude --effort <level>` — sets effort at startup.

**Conflict behavior (review_1 §4, verified):**
- Claude Code 2.1.128 accepts duplicate `--model` and takes the last (last-wins observed in local probe), but **we should not rely on this**. Sanitizer strips and replaces, same as the others.

## Stream-hook context relevance — UNCHANGED

The `autoStream` hook payload still carries `session_id, transcript_path, cwd, hook_event_name` and **no model/effort**. The hook remains useful as a "when to refresh" trigger — on `Stop` / `PostToolUse`, F-Mark invokes the runtime's adapter `readCurrent` and broadcasts an update. The hook itself is observe-only.

## Key insights for design (v2)

1. **Three structurally different surfaces, but all reducible to CLI/file reads.** No HTTP supervisor required for v1.
2. **`args` injection is the universal write path,** but raw appending is dangerous — Codex and OpenCode both fail on duplicate flags. A per-runtime arg sanitizer is non-optional.
3. **Mid-session change is not reliable for any provider** — respawn is the only honest option. UI must say so.
4. **Effort is now universal across runtimes** (Codex/OpenCode/Claude all support it via CLI). UI can show effort for all three. But Claude's *observability* of current effort is unverified — hot-test before depending on it.
5. **The "set" surface is uniform** (a single arg sanitizer-then-apply path). The "read" surface is wildly different (codex JSONL turn_context scan, claude transcript scan, opencode db query). Adapter abstracts read; sanitizer abstracts write.
6. **F-Mark's existing transcript parser is not a substrate.** Claude metadata extraction needs its own implementation; codex `turn_context` parsing is adjacent to but distinct from the existing `extractLastAssistantTurn`.
