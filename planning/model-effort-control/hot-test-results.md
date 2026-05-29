# Phase 0 Hot-Test Results

> Verified 2026-05-28. Captures live behavior of the three runtimes on this machine. Resolves open questions from `summary.md` Phase 0 before adapter implementation.

## 1. Codex rollout schema stability ✅ STABLE

Across 3 recent rollouts under `~/.codex/sessions/2026/05/**`:

| Rollout                                                    | turn_context entries | model    | effort | cwd consistency             |
|------------------------------------------------------------|----------------------|----------|--------|------------------------------|
| `rollout-2026-05-27T19-40-13-019e6a85-...jsonl`            | 1                    | gpt-5.5  | xhigh  | cabal-be                     |
| `rollout-2026-05-26T15-17-46-019e646f-...jsonl`            | 18                   | gpt-5.5  | xhigh  | cabal-be                     |
| `rollout-2026-05-27T14-06-51-019e6954-...jsonl`            | 2                    | gpt-5.5  | xhigh  | cabal-be                     |

- `session_meta.payload.cwd` and `turn_context.payload.cwd` both present and equal.
- `turn_context.payload.{model,effort}` present on every observed turn_context entry.
- `turn_context` count == number of turns (variable, 1–18 observed).

**Implication**: Codex adapter scans for the LAST `turn_context` entry to get current model+effort. No need to read line 1.

## 2. Codex cwd-scan fallback timing ✅ ACCEPTABLE

`find ~/.codex/sessions -name "rollout-*.jsonl"` + sort by mtime + parse session_meta line 1 of 20 most recent files: **~0.6s wall**. Acceptable for an opportunistic fallback (only used when hook doesn't provide `transcript_path`).

## 3. Codex models_cache refresh trigger ⚠️ UNVERIFIED — DEFERRED

Did not probe (would have required token-spending or interactive subcommands). Decision: treat the cache as read-only; refresh cadence is the codex client's responsibility. F-Mark just reads it on demand and accepts that staleness is bounded by user activity. If users notice stale lists, we can add a manual "refresh" button later.

## 4. Claude transcript structure ✅ CONFIRMED + RICH

Top-level keys per JSONL entry: `{parentUuid, isSidechain, message, requestId, type, uuid, timestamp, userType}`.

`message` keys (assistant entries): `{model, id, type, role, content, stop_reason, stop_sequence, stop_details}`.

Models observed in transcripts (varied — good sample):
- `claude-opus-4-7`
- `sonnet` (alias form)
- `opus` (alias form)
- `claude-haiku-4-5-20251001` (full slug with date)
- `<synthetic>` (Claude Code internal — likely for haiku-driven summaries/sidechains; skip in UI)

**Implication**: Claude adapter must canonicalize the alias forms (`sonnet`, `opus`, `haiku`) to slugs (`claude-sonnet-4-6`, etc.) before matching against the descriptor list. Drop `<synthetic>` entries.

## 5. Claude current-effort observability ❌ NOT OBSERVABLE

Probed:
- ✅ `claude --effort high --print "ping"` returns "pong" — flag is functional for setting.
- ❌ No `effort` field in transcript JSONL entries.
- ❌ No effort in `~/.claude/sessions/<pid>.json` (which carries `pid, sessionId, cwd, status, version` only — no model/effort).
- ❌ No effort in `~/.claude/settings.json` (hooks/keybindings config only).
- The only "effort" string matches in any JSONL were prose mentions in skill descriptions.

**Implication**: Claude `readCurrent` returns `effort: undefined` for now. The UI must distinguish:
- **Live effort badge**: `—` for Claude (we cannot observe it)
- **Configured effort override**: still settable; persisted in `participants.json`; flows through `--effort` arg on respawn.

This is the same "asymmetry" the v2 plan anticipated — confirmed needed.

## 6. OpenCode `models --verbose` ✅ FULLY STRUCTURED

`opencode models openai --verbose` returns interleaved `provider/model\n{json}\n…`. JSON keys include `id, providerID, name, family, api, capabilities.reasoning, cost, limit, variants`.

`variants` is an **OBJECT keyed by variant name**, e.g. for `openai/gpt-5.2`:

```json
{
  "none":   {"reasoningEffort": "none",   "reasoningSummary": "auto", "include": [...]},
  "low":    {"reasoningEffort": "low",    ...},
  "medium": {"reasoningEffort": "medium", ...},
  "high":   {"reasoningEffort": "high",   ...},
  "xhigh":  {"reasoningEffort": "xhigh",  ...}
}
```

**Implication**:
- `listEfforts(modelId)` extracts `Object.keys(variants)` for that model.
- The user passes the VARIANT KEY to `--variant`, which happens to equal `reasoningEffort` here but is structurally distinct.
- A `default` variant also exists in some sessions (see §7) — include it.
- A `none` variant is real (no reasoning) — include it.

## 7. OpenCode `db --format json` ✅ WORKS GREAT

Direct query against the live DB without any native driver:

```sql
SELECT id, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, directory, time_updated
FROM session
WHERE id = 'ses_192e7ce6cffeFkd05gmfMi86sq'
```

Returns:
```json
[{
  "id": "ses_192e7ce6cffeFkd05gmfMi86sq",
  "agent": "build",
  "model": "{\"id\":\"gpt-5.3-codex\",\"providerID\":\"openai\",\"variant\":\"default\"}",
  "cost": 0,
  "tokens_input": 5877,
  "tokens_output": 5,
  "tokens_reasoning": 0,
  "directory": "/home/roey/workspace/F-Mark",
  "time_updated": 1779946763568
}]
```

**Note**: the `model` column is a **JSON STRING** (not nested JSON). Need a second `JSON.parse(row.model)` step. The variant value here is `"default"` — implying OpenCode has an implicit "default" beyond the named variants. The adapter should treat unknown variants as opaque strings (no enum validation).

**cwd query also works**: `WHERE directory = ? ORDER BY time_updated DESC LIMIT 1` returns the latest session for the workspace.

## 8. OpenCode `export <sessionID>` ✅ WORKS AS LAST-RESORT

`opencode export <id>` returns a full session JSON with rich `info` block:

```json
{
  "info": {
    "id": "ses_...",
    "directory": "/home/roey/workspace/F-Mark",
    "agent": "build",
    "model": { "id": "gpt-5.3-codex", "providerID": "openai", "variant": "default" },
    "cost": 0,
    "tokens": {
      "input": 5877, "output": 5, "reasoning": 0,
      "cache": { "read": 2048, "write": 0 }
    },
    ...
  },
  "messages": [ ... ]
}
```

Heavier (full message tree). Suitable as fallback when `db` query is unavailable. `info.model` is parsed (object, not string) — different from the db column.

## 9. Spawn arg duplicate-flag matrix ✅ ARG SANITIZER IS REQUIRED

Empirical behavior captured on live CLIs:

| Runtime  | Duplicate flag         | Behavior                                                              |
|----------|------------------------|-----------------------------------------------------------------------|
| Codex    | `-m gpt-5.4 -m gpt-5.5`| **ERRORS**: `the argument '--model <MODEL>' cannot be used multiple times` |
| OpenCode | `-m a -m b`            | **CRASHES**: `D.split is not a function`                              |
| OpenCode | `--variant high --variant max` | **REJECTS**: `BadRequest` (validation error)                  |
| Claude   | `--model opus --model sonnet` | **Last-wins** (no error; "Claude Sonnet 4.6")                  |

**Implication**: Two of three runtimes break on duplicate flags. The arg sanitizer is non-negotiable, not a nice-to-have. Sanitize before append for all three (consistency).

---

## Summary of decisions locked by Phase 0

1. **Codex adapter `readCurrent`**: scan rollout file for last `turn_context.payload.{model,effort}`. cwd-scan fallback timing is acceptable.
2. **Codex models cache**: read-only, no refresh trigger from F-Mark.
3. **Claude adapter `readCurrent`**: extract `message.model` from latest assistant entry. Effort is NOT observable — return `effort: undefined`; canonicalize alias forms.
4. **OpenCode adapter `listEfforts`**: parse `models --verbose` JSON `variants` object keys.
5. **OpenCode adapter `readCurrent`**: `opencode db --format json` is the primary path; `JSON.parse` the `model` column STRING. `export` is the fallback (info.model is already an object).
6. **Arg sanitizer**: required for all three runtimes (Codex and OpenCode would crash without it).

## Items NOT yet hot-tested (acceptable deferrals)

- Codex `models_cache.json` refresh trigger: deferred (read-only consumer, accept staleness).
- OpenCode `db --format json` latency at scale: only one row queried; should re-measure if we ever query large result sets.
- OpenCode `db` while OpenCode TUI is running: SQLite WAL should make this safe, but didn't probe concurrency. If `db` blocks during a live session, fallback to `export`.

These can be addressed reactively in later phases without blocking implementation.
