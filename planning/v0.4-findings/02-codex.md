# 02-codex.md — Adversarial Codex CLI Integration Findings

**Subagent:** B  
**Port:** 17911  
**Temp dir:** `/tmp/fmark-B`  
**Date:** 2026-05-23  
**Codex version:** 0.133.0 (ChatGPT auth mode)  
**Status:** COMPLETE

---

## Setup

- Kernel started successfully on port 17911 with `--password fmark-B`.
- `codex --version` returns `codex-cli 0.133.0`. Codex is installed and authenticated via ChatGPT auth.
- `codex doctor` shows 12 ok, 1 warn (WebSocket timeout — HTTP fallback works). Auth is functional.
- Codex is NOT blocked. All tests ran against a live kernel.

---

## B.1 — TOML Config Edge Cases

All 25 assertions passed. Key findings:

### What works
- Comments on preceding lines (`# my comment` before `[[hooks.Stop]]`) — correctly detected as installed.
- Inline comments after command value (`command = [...] # note`) — comment stripped, detection succeeds.
- Hash inside quoted string (`"test#1"`) — preserved (not treated as comment), detection succeeds.
- Multiline TOML arrays (`command = [\n  "npx",\n  ...\n]`) — fully supported.
- Mixed single/multiline formats — supported.
- Extra whitespace around `=` and inside arrays — supported.
- Hooks split across user-global (`~/.codex/config.toml`) and project-local (`.codex/config.toml`) — detected as installed when `loadCodexConfig(projectRoot)` is called (both files concatenated and scanned as one stream).

### Confirmed boundary behavior
- Only `Stop` without `UserPromptSubmit` → `installed = false`, `detectedEntries.length = 1`.
- Only `UserPromptSubmit` without `Stop` → `installed = false`.
- Lowercase event names (`[[hooks.stop]]`) → not detected (case-sensitive, by design).
- agentId and userId swapped → not detected.
- `f-mark` without `auto-stream` keyword → not detected.
- Empty `command = []` → not detected.

### Edge case: bare string command
```toml
[[hooks.Stop]]
command = "npx -y f-mark hook auto-stream ag-xxx"
```
This is **accepted as installed** (`installed = true`). The bracket-depth counter sees no brackets, so `depth = 0`, and the string (which contains `f-mark`, `auto-stream`, and the agent ID) passes all checks. This is incorrect — Codex expects an array, and a string command would fail at runtime. The detection logic accepts it, giving a false positive.

### Edge case: unterminated multiline array
Per code comment: `"Unterminated buffer — still emit so callers can see what was there."` The unterminated array is emitted as a partial entry. This is graceful recovery.

### Edge case: brackets inside quoted string args
```toml
command = ["npx", ..., "--data", "[nested-brackets]"]
```
Single-line case: the bracket depth counter ends at 0 correctly (the array `[...]` as a whole has depth 1→0). Detection works. Multi-line variant would confuse the raw-bracket counter since it doesn't respect string quoting in depth accumulation — not tested here but noted as a latent risk.

---

## B.2 — Codex Trust Prompt

### Finding: No trust_pending field — F-Mark cannot detect untrusted state

`DetectResult` has fields: `installed`, `configPath`, `detectedEntries`, `expectedEntries`. There is **no `trust_pending` field**.

- F-Mark detects hooks by scanning config files only.
- F-Mark has **no mechanism** to distinguish "hooks installed and trusted" from "hooks installed but not yet trusted".
- If a user writes the config but skips Codex's trust prompt, the chip shows "installed" (no wrench) even though the hook silently never fires.
- This is an acknowledged gap in v0.4 ("Codex is preview").

### Codex trust bypass flags
`codex --dangerously-bypass-hook-trust` exists and is documented:
> "Run enabled hooks without requiring persisted hook trust for this invocation. DANGEROUS. Intended only for automation that already vets hook sources."

This flag is usable in CI/headless environments. F-Mark's kickoff message does NOT suggest using this flag.

### Install snippet
`renderCodexInstallSnippet()` correctly includes: `"On first run, Codex will prompt you to trust the hook command. Approve once."` — trust is mentioned.

### API: hook-install-status with real user config
With the actual `~/.codex/config.toml` (which has no f-mark hooks), the API correctly returns `installed: false`, `detectedEntries: []`, and `expectedEntries` with the correct agent/user IDs.

---

## B.3 — Codex Transcript Preview-Mode Caveat

### Transcript parsing (unit tests)

| Test | Result |
|---|---|
| Empty transcript | Returns `[]` — OK |
| **Malformed JSONL** | **Throws unhandled exception** — `JSON.parse()` call is not wrapped. If Codex emits a malformed transcript file, the auto-stream hook process crashes. |
| No assistant entries | Returns `[]` — OK |
| Normal turn with tool use + text | Correctly extracts tool_use + concluding prose |
| Orphaned tool_use (no tool_result) | Emitted as `success = true, result = undefined` — misleading |
| Multiple turns — only last extracted | Correct |
| Whitespace-only text blocks | Filtered before projection — OK |
| **Null content blocks** | **Throws**: `TypeError: e.content is not iterable` |
| Non-standard blocks (thinking, image) | Silently ignored — OK |
| 100-turn transcript | Processed in <1ms — OK |
| Codex tool_result as array | `result` stored as raw `object` (array) — rendering may show `[object Object]` |

### Key defects

**B3-DEFECT-1: Unhandled exception on malformed JSONL**  
`extractLastAssistantTurn()` calls `JSON.parse(line)` in a `.map()` with no try/catch. If Codex emits any line that is not valid JSON (e.g., a debug line, partial write), the auto-stream hook crashes entirely. The hook process exits 0 (`return 0` is never reached) and the turn is silently dropped.

**B3-DEFECT-2: Unhandled exception on null content**  
If an assistant entry has `content: null`, `for (const block of e.content)` throws `TypeError: e.content is not iterable`. Same crash behavior.

**B3-DEFECT-3: Codex tool_result content is an array, not a string**  
When Codex returns `tool_result` with `content: [{ type: "text", text: "..." }]` (array form per OpenAI spec), the `result` field is stored as a raw JS array. The renderer may display this as `[object Object]` rather than the text content.

### tool-use event API shape

POST endpoint: `/sessions/:id/events/tool-use` with flat body (not nested under `payload`).  
Read-back shape: `{ filename, timestamp, participant_id, kind: "tool-use", payload: { tool_name, tool_use_id, input, result, success, duration_ms } }`.

Validation behavior:
- `tool_name` empty string → 400 (schema requires minLength)
- `tool_use_id` — no uniqueness check; duplicate IDs accepted silently
- `input: null` → 200 (accepted)
- `result` absent → stored as `undefined` (not an error)
- Very long `tool_name` (1000 chars) → 200 (no length limit enforced)
- Non-existent `participant_id` → 400 with "unknown participant"

### /hook/auto-stream route

The hook is **both a CLI entry point** (`f-mark hook auto-stream <agentId>`) **and** an HTTP endpoint at `/hook/auto-stream`. The HTTP endpoint requires auth (returns 401 without `Authorization: Bearer`). With auth, it returns 200.

---

## B.4 — Spawn Race + Auth

### CRITICAL: config.json concurrent write race

Under concurrent spawn load, multiple spawns call `registerAgent()` which does `readConfig()` → (modify in memory) → `writeConfig()`. There is **no file lock or serialization**. Node's `fs.writeFile` is not atomic at the read-modify-write level.

**Observed results with 10 concurrent spawns:**
- 3–4 out of 10 spawns return `400 {"error": "Unexpected end of JSON input"}`
- When successful, all spawned agents get unique IDs (the ID generation is randomized, so ID collisions are not the issue)
- **After 10 successful spawns, only 2 new participants appear in config.json** (8 lost to write-clobber)

This is a data loss bug: agents are spawned (tmux sessions exist) but their config entries are overwritten by racing writes. The agent exists in tmux but is invisible to F-Mark.

**Failure mode:** `Unexpected end of JSON input` occurs when a `readConfig()` call reads a file that is mid-write (partial JSON). Node's `fs.writeFile` replaces the file non-atomically on some OS/fs combinations.

### Rapid spawn — unique IDs

When spawns succeed, all participant IDs are unique (4-byte random hex suffix). No ID collision under concurrent load.

### suggested_participant_id validation

The ID pattern is `/^(us|ag|sys|grp)-[a-z0-9-]{2,12}$/`. The segment after the prefix must be 2–12 lowercase alphanumeric/hyphen chars. This rejects:
- `ag-test-unique-xyz` (15 chars — too long)
- `ag-a` (1 char — too short)
- `ag-UPPER` (uppercase)
- `ag-test!` (special chars)

### /compact to dead pane

When tmux session is killed externally, `POST /managed-agents/:id/command` with `type: "slash"` returns `400 {"error": "tmux send-keys failed: can't find pane: <session>"}`. Error is surfaced correctly (not swallowed).

### /compact while agent is alive — correctly queued

`/compact` command accepted (200, `ok: true`) for a live agent.

---

## B.5 — Negative Tests

### Presence pane-dead detection: not implemented

After spawning a Codex agent and killing its tmux session externally:
- Presence state **never transitions to `pane-dead`** — even after 5+ seconds of polling.
- The presence entry itself may not appear at all (if no hooks have fired).

**Root cause:** `setManagedPane()` is called with `{ paneAlive: () => true }` — a constant closure that always returns `true`. The presence ticker calls `deriveState(e, now)` every 5s, but `e.paneAlive()` always returns `true`, so `pane-dead` is never derived.

The code comment says `"v0.4: optimistic paneAlive — the presence ticker / pane-died detection happens elsewhere"` but there is **no other code** that updates `paneAlive` after spawn. The only way to get `pane-dead` is via `reconcile.ts` on server restart.

**Impact:** If a Codex process exits between server restarts, the chip remains in `hook-not-installed` or `launching` state indefinitely rather than showing `pane-dead`. The user has no UI signal that the agent died.

### confirm-token security

| Scenario | Behavior |
|---|---|
| Wrong token | 403 `"missing or stale confirm token"` |
| No confirm param | 403 `"missing or stale confirm token"` |
| Valid token on first use | 200 OK |
| Same token reused after delete | 403 (token consumed on first use) |
| Token after re-spawn with same ID | New token required — old token invalid |

Token TTL is 10s. The confirm-token mechanism works correctly.

### Input validation

| Case | Result |
|---|---|
| `runtime_id: ""` | 400 "runtime_id required" |
| No body | 400 "runtime_id required" |
| Unknown `runtime_id` | 400 "unknown runtime_id: …" |
| `suggested_participant_id` too long (>12 chars in segment) | 400 "invalid participant_id" |
| Command to non-managed participant | 409 `{ reason: "unmanaged_pane", offer: "open_overlay" }` |
| Very long name (10K chars) | 200 (no length limit) |
| Unicode in name | 200 (accepted) |
| XSS in name | 200 (no sanitization — renderer's responsibility) |

---

## Summary of Defects

| ID | Severity | Description |
|---|---|---|
| B-DEFECT-1 | HIGH | Concurrent spawns cause config.json race: participants lost to write-clobber; some spawns return 400 with "Unexpected end of JSON input" |
| B-DEFECT-2 | HIGH | `extractLastAssistantTurn()` has no try/catch around `JSON.parse()` — malformed JSONL crashes the auto-stream hook process silently |
| B-DEFECT-3 | MEDIUM | `paneAlive: () => true` constant closure means presence never derives `pane-dead` after external tmux kill — pane death invisible until server restart |
| B-DEFECT-4 | MEDIUM | `extractLastAssistantTurn()` crashes on `null content` blocks: `TypeError: e.content is not iterable` |
| B-DEFECT-5 | LOW | Codex `tool_result.content` as array (OpenAI spec) stored as raw JS array — renderer may display `[object Object]` |
| B-DEFECT-6 | LOW | TOML detection accepts bare string command (`command = "..."`) as installed, but Codex only supports array commands — false positive |
| B-DEFECT-7 | LOW | Orphaned tool_use (no tool_result) stored as `success: true, result: undefined` — misleading success state |
| B-GAP-1 | INFO | No `trust_pending` state — F-Mark cannot detect "hooks installed but not yet trusted"; chip shows `installed` even when hooks are untrusted |
| B-GAP-2 | INFO | No uniqueness check on `tool_use_id` — duplicate IDs accepted without error |
| B-GAP-3 | INFO | No length limit on agent name or tool_name |

---

## Codex Integration: Overall Assessment

**Hook detection logic:** Solid. Comments handled correctly. Multiline arrays handled. Split user/project config handled. One false-positive edge case (bare string command).

**Transcript parsing:** Fragile. No error boundaries around `JSON.parse()`. Crashes on null content. Array-form tool_result not normalized.

**Spawn lifecycle:** Broken under concurrent load due to no file locking on config.json. Single spawns work correctly.

**Presence:** Optimistic — pane-dead state not tracked during session lifetime. Known v0.4 limitation per inline code comment.

**Trust:** Correctly documented in snippet. No runtime detection possible by design.
