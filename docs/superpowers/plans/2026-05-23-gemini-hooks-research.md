# Gemini CLI Hook Research

Research date: 2026-05-23
Researcher: Task 27 of F-Mark auto-stream-hook plan
Gemini CLI source: github.com/google-gemini/gemini-cli (TypeScript monorepo under `packages/`)

## TL;DR

**Gemini CLI has a comprehensive lifecycle-hook system as of v0.26 — with `AfterAgent` (≈ Claude Code's `Stop`), `BeforeAgent` (≈ `UserPromptSubmit`), and `BeforeTool` / `AfterTool` (≈ `PreToolUse` / `PostToolUse`). Configuration is JSON in `.gemini/settings.json` (project-level) or `~/.gemini/settings.json` (user-level), and extensions can ship bundled hooks via `hooks/hooks.json`. The stdin contract is JSON.**

**However: the JSONL transcript file Gemini writes (`transcript_path`) uses a Gemini-specific message schema (`type: "user" | "gemini"`, `toolCalls: ToolCallRecord[]` as a sibling of `content`), NOT the Claude-Code-shape (`{role, content: [{type: "text"|"tool_use"|"tool_result", ...}]}`) that F-Mark's `extractLastAssistantTurn` parser expects.** And the `AfterAgent` payload's `prompt_response` field is a flat string with no structured representation of intermediate tool calls or pre-tool narration.

Net: F-Mark's existing auto-stream pipeline (which depends on parsing transcript JSONL into typed text/tool_use/tool_result blocks) **does not work as a hook on Gemini today** without a dedicated Gemini-shape transcript parser. The hook would have at best the final flat `prompt_response` string and no way to recover mid-turn narration or tool calls/results. Adding a Gemini-flavored transcript parser is out of scope for the auto-stream-hook plan's Phase 8.

**Recommended approach for Task 28: manual-POST fallback** — ship a Gemini skill that instructs the model to POST narration / tool-use events / final prose itself, exactly as the plan's fallback template prescribes. The renderer projection is identical to the hook-driven path; only the producer differs.

---

## Configuration

- **User-level config**: `~/.gemini/settings.json`.
- **Project-level config**: `.gemini/settings.json` in cwd (or any ancestor up to the workspace root). Highest precedence among non-runtime layers; merged with user/system/extension layers.
- **System-level config**: `/etc/gemini-cli/settings.json` (admin-pushed).
- **Extension-level config**: hooks bundled inside an installed extension are auto-merged at lowest precedence.
- **Format**: JSON only. No TOML variant.
- **Hooks bundled in extensions**: live in `<extension-root>/hooks/hooks.json`, with the same JSON schema as the `hooks` key in `settings.json`. They are **not** declared in the `gemini-extension.json` manifest.
- **Enable/disable**: `"tools": { "enableHooks": false }` in `settings.json` disables hooks globally. Default: enabled.
- **Trust**: Gemini fingerprints project-level hooks by name+command. New or changed hooks trigger a "untrusted" warning before first execution. Folder-level trust (`isTrustedFolder()`) gates whether project hooks run at all.

## Lifecycle hooks

Available events — from `packages/core/src/hooks/types.ts:HookEventName`:

```typescript
export enum HookEventName {
  BeforeTool = 'BeforeTool',
  AfterTool = 'AfterTool',
  BeforeAgent = 'BeforeAgent',
  Notification = 'Notification',
  AfterAgent = 'AfterAgent',
  SessionStart = 'SessionStart',
  SessionEnd = 'SessionEnd',
  PreCompress = 'PreCompress',
  BeforeModel = 'BeforeModel',
  AfterModel = 'AfterModel',
  BeforeToolSelection = 'BeforeToolSelection',
}
```

Mapping to Claude Code and Codex vocabularies:

| Claude Code | Codex | Gemini | Notes |
|---|---|---|---|
| `Stop` | `Stop` | **`AfterAgent`** | "Fires once per turn after the model generates its final response." |
| `UserPromptSubmit` | `UserPromptSubmit` | **`BeforeAgent`** | "Activates after a user submits a prompt, but before the agent begins planning." |
| `PreToolUse` | `PreToolUse` | **`BeforeTool`** | Same purpose; fires before tool invocation. |
| `PostToolUse` | `PostToolUse` | **`AfterTool`** | Same purpose; fires after tool returns. |
| `SessionStart` | `SessionStart` | `SessionStart` | Sources: `startup` / `resume` / `clear`. |
| `SessionEnd` | (none) | `SessionEnd` | Reasons: `exit`, `clear`, `logout`, `prompt_input_exit`, `other`. |
| `Notification` | (none — `notify` argv is partial overlap) | `Notification` | Observability only; cannot block alerts. |
| (none) | `PreCompact` / `PostCompact` | `PreCompress` | Gemini fires only the *pre* variant. |
| (none) | (none) | `BeforeModel` / `AfterModel` / `BeforeToolSelection` | Gemini-specific; model-call hooks. |

Matchers are optional regex strings (or exact strings for lifecycle events). For `AfterAgent` and `BeforeAgent`, the convention is `"matcher": "*"` (the docs' published examples always show `"*"`).

## Hook invocation contract

Hooks are command-type by default — a shell command Gemini spawns, with JSON written to its stdin and an optional JSON response read from stdout. The settings.json shape:

```json
{
  "hooks": {
    "AfterAgent": [
      {
        "matcher": "*",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "name": "f-mark-stream",
            "command": "npx -y f-mark hook auto-stream ag-gemini-yourname",
            "timeout": 30000,
            "description": "Stream the assistant turn into F-Mark."
          }
        ]
      }
    ],
    "BeforeAgent": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y f-mark hook auto-stream us-username --kind user",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

Notes on the shape (verified against `packages/core/src/hooks/types.ts`):
- `command` is a single **string** (not an argv array — distinct from Codex's array form).
- `timeout` is in **milliseconds** (default 60000). This is distinct from Codex's per-hook `timeout` field, which is in **seconds**. **F-Mark's existing skill snippets that use `"timeout": 30` (Codex/Claude) would mean 30 *ms* on Gemini — effectively unusable.** The Gemini skill bundle MUST use `30000` etc.
- `name`, `description` are optional metadata for UI display and telemetry.
- `sequential: true` runs the entries of one `hooks: [...]` array serially; default is parallel.

### Stdin payload — base (all events)

From `types.ts:HookInput`:

```json
{
  "session_id":      "string",
  "transcript_path": "string",
  "cwd":             "string",
  "hook_event_name": "string",
  "timestamp":       "string (ISO 8601)"
}
```

### Stdin payload — AfterAgent (Stop equivalent)

From `types.ts:AfterAgentInput`:

```json
{
  "session_id":      "...",
  "transcript_path": "...",
  "cwd":             "...",
  "hook_event_name": "AfterAgent",
  "timestamp":       "...",
  "prompt":          "string",        // the user's original request that started this turn
  "prompt_response": "string",        // the final text output of the agent — FLAT STRING ONLY
  "stop_hook_active": false           // true on retry passes (mirrors Claude/Codex semantics)
}
```

### Stdin payload — BeforeAgent (UserPromptSubmit equivalent)

```json
{
  "session_id":      "...",
  "transcript_path": "...",
  "cwd":             "...",
  "hook_event_name": "BeforeAgent",
  "timestamp":       "...",
  "prompt":          "string"          // the user's submitted prompt
}
```

### Stdin payload — AfterTool (PostToolUse equivalent)

```json
{
  "session_id":      "...",
  "transcript_path": "...",
  "cwd":             "...",
  "hook_event_name": "AfterTool",
  "timestamp":       "...",
  "tool_name":       "string",
  "tool_input":      <object>,
  "tool_response":   <object>,         // contains llmContent / returnDisplay / optional error
  "mcp_context":     <object?>,        // only present for MCP tools
  "original_request_name": "string?"
}
```

### Timeout

- Default: **60000 ms** (60 s).
- Configurable per hook via `timeout` (milliseconds).
- Hooks of the same event can run in parallel (default) or sequential (per-`HookDefinition` `sequential: true`).

### Output / exit codes

```json
{
  "continue":           true,
  "stopReason":         "...",
  "systemMessage":      "...",
  "suppressOutput":     false,
  "decision":           "allow|deny|block",
  "reason":             "...",
  "hookSpecificOutput": { ... }
}
```

- Exit `0` with no output = success silent.
- Exit `2` = system block; stderr surfaces as rejection reason.
- Any other non-zero exit = warning; agent continues.
- AfterAgent-specific: `decision: "deny"` + `reason` triggers an **automatic retry** by feeding `reason` back to the model. **F-Mark's auto-stream hook must exit 0 silent — never set `decision: "deny"` accidentally, or it will loop the user's turn.**

### Environment variables

Confirmed from the writing-hooks docs:
- `GEMINI_PROJECT_DIR` — the workspace root.

Other env vars (e.g., `GEMINI_PLANS_DIR`, extension-bundled paths) are mentioned in adjacent docs but not consistently. F-Mark's hook should not rely on any Gemini-specific env vars — instead, use the `cwd` field on stdin to discover `.f-mark/`.

For extension-bundled hooks, Gemini sets variable substitutions like `${extensionPath}`, `${workspacePath}`, `${/}` *inside the settings.json string values themselves* (replacement at config-load time), not as runtime env vars to the spawned process.

### Trust requirements

Gemini fingerprints each project-level hook by `name:command`. On first invocation of a fingerprint, the user gets a trust prompt. Folder-level trust (`isTrustedFolder()`) gates whether project hooks run at all. User-level hooks (`~/.gemini/settings.json`) are auto-trusted.

For F-Mark's auto-stream skill: same expectation as Codex — install instructions must warn the user that the first run prompts for trust.

## Transcript (the blocker)

`transcript_path` is wired up as of PR #14663 (merged 2025-12-10) — resolved via `chatRecordingService.getConversationFilePath()`, returning `''` if recording is disabled. So **the field exists and points to a real file when chat recording is enabled** (the default).

**But the file format is incompatible with F-Mark's transcript parser.** From `packages/core/src/services/chatRecordingTypes.ts`:

```typescript
export interface BaseMessageRecord {
  id: string;
  timestamp: string;
  content: PartListUnion;        // @google/genai's union — NOT Claude Code's content blocks
  displayContent?: PartListUnion;
}

export type ConversationRecordExtra =
  | { type: 'user' | 'info' | 'error' | 'warning' }
  | {
      type: 'gemini';
      toolCalls?: ToolCallRecord[];   // ← tool calls are SIBLINGS of content, not inline blocks
      thoughts?: Array<ThoughtSummary & { timestamp: string }>;
      tokens?: TokensSummary | null;
      model?: string;
    };

export type MessageRecord = BaseMessageRecord & ConversationRecordExtra;

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: PartListUnion | null;
  status: Status;
  timestamp: string;
  // ...
}
```

Compare to Claude Code (what F-Mark's `extractLastAssistantTurn` parses):

```typescript
// Claude Code JSONL:
{ role: "assistant",
  content: [
    { type: "text", text: "..." },
    { type: "tool_use", id: "...", name: "...", input: {...} },
  ] }
{ role: "user",
  content: [
    { type: "tool_result", tool_use_id: "...", content: "..." },
  ] }
```

**Key differences making the formats incompatible:**

1. **Top-level `type` is `"user"` / `"gemini"` / `"info"` / `"error"` / `"warning"`** — not `"role": "user"` / `"role": "assistant"`. Filtering by role fails.
2. **Tool calls are stored as a sibling array `toolCalls: ToolCallRecord[]`** on the `type: "gemini"` message — NOT as `tool_use` blocks inside `content`. F-Mark's parser only walks `content[]` looking for `type: "tool_use"`.
3. **Tool results live INSIDE each `ToolCallRecord` as `result?: PartListUnion | null`** on the same Gemini message — they are NOT separate `{ role: "user", content: [{ type: "tool_result", ... }] }` records. F-Mark's pairing logic walks `tool_use_id` across messages.
4. **The `$rewindTo` and `$set` meta-records** are interleaved JSONL entries that F-Mark's parser would treat as unknown messages and skip — fine, but it means a simple "last N JSONL lines" heuristic doesn't trivially yield the latest turn.
5. **`content` is `PartListUnion` from `@google/genai`** — not a plain string or Claude-style content blocks. Even text extraction needs Gemini's part shape.

To consume Gemini's transcript correctly, F-Mark would need a dedicated parser that:
- Identifies the latest `type: "gemini"` message after the latest `type: "user"` message (handling `$rewindTo`).
- Extracts `content` (and `displayContent`?) as text via Gemini's part union.
- Walks `toolCalls[]` for tool invocations and their `result`.
- Projects to F-Mark's text + tool_use + tool_result block stream.

That's a meaningful chunk of new code — well beyond the scope of "Task 28: author the Gemini skill bundle."

## `AfterAgent.prompt_response` is also insufficient

Even if F-Mark sidesteps the transcript and uses only the `AfterAgent` payload, `prompt_response: string` gives us **the final assistant text** — but **no mid-turn narration and no tool calls**. The renderer projection (arbitrary prose group → tool_use cards → final prose card → turn-end) collapses to "one concluding prose + one turn-end" for every Gemini turn, regardless of how many tool calls happened mid-turn.

That's not a useful F-Mark experience: tool-using turns would lose all the structure that makes the auto-stream feed informative.

## Mapping to F-Mark — recommended skill design

Given the constraints, the cleanest design is **manual-POST mode**, identical to the plan's stated fallback template:

| F-Mark need | Gemini mechanism |
|---|---|
| Stop equivalent | The model itself POSTs the final prose (`arbitrary: false`) then `turn-end`. |
| UserPromptSubmit equivalent | Skip — Gemini's user-prompt event would deliver only the prompt text (`BeforeAgent.prompt`), but installing a hook just for that adds trust-prompt friction without the matching assistant-side capability. User prose can be captured by the renderer's existing path (renderer is the canonical user-side input surface for F-Mark sessions), or by a thin optional hook documented as advanced. |
| Mid-turn tool-result pairing | The model POSTs `tool-use` events itself after each tool returns. |
| Mid-turn narration | The model POSTs `arbitrary: true` prose between tool calls. |
| Hook command shape | Not used in manual mode. |
| Participant id | Hardcoded `ag-gemini-*` in the skill bundle, registered on first install, cached locally. Same pattern as Codex's `ag-codex-*`. |
| Trust UX | Not applicable in manual mode — no hooks installed by the skill. |
| Bundling | `~/.gemini/extensions/f-mark/skills/f-mark/SKILL.md` + `api.md` (Gemini extension layout). |

The Task 28 skill bundle therefore mirrors the **Claude skill structure**, not the Codex skill structure — because the Claude bundle has both the hook flow AND the underlying "model emits structured events" knowledge, while the Codex bundle has only the hook flow.

### Why not a partial hook (use AfterAgent only for the final prose + turn-end)?

We could install an `AfterAgent` hook that posts only the concluding `prompt_response` and a `turn-end`, while still requiring the model to POST tool-use and mid-turn narration manually. That's strictly worse than full manual mode because:

1. The trust prompt friction is identical to a full hook install.
2. The model still has to track which mode it's in (does the hook produce the final prose, or do I?). That branching is bug-prone.
3. The renderer feed would have mixed-provenance events with no clear ownership.

Full manual mode keeps the contract simple: **the model owns every POST**.

### Why not write a Gemini transcript parser?

A few reasons:
1. **Scope.** Phase 8's task budget is 15-20 minutes for research + a skill bundle, not a new transcript-format parser plus the test coverage it would need.
2. **Risk.** Gemini's `MessageRecord` schema is internal and evolving — `$rewindTo` and `$set` meta-records, `MAX_TOOL_OUTPUT_SIZE` truncation, `PartListUnion` from `@google/genai` (which itself has version churn). A parser would have a high maintenance tax.
3. **Doesn't help users today.** Manual mode ships immediately and produces the identical renderer feed. The hook-driven path can be added later as an optimization without breaking the manual mode contract.

## Open questions / blockers

1. **Does manual-mode work in `gemini --prompt` (headless)?** Probably yes — the model still emits text and can issue POSTs as tool calls via its `npx`/`curl` capability. But unverified for Tasks 27-29. Manual smoke (Task 29) should confirm.
2. **Skill discovery in extensions.** Verify that Gemini auto-loads skills from `~/.gemini/extensions/<name>/skills/<skill>/SKILL.md` once the extension is installed. The docs say "Skills are supported" with example `skills/security-audit/SKILL.md`, but the precise discovery semantics (auto vs. opt-in) weren't drilled into.
3. **`gemini-extension.json` manifest minimum.** A minimal manifest for a skill-only extension (no MCP servers, no commands) is plausible but not verified. May need `{ "name": "...", "version": "..." }` at minimum.
4. **Future: when F-Mark adds a Gemini transcript parser**, the hook-driven path becomes available. The skill bundle written for Task 28 should be authored such that a future PR can add an "auto-stream" mode without breaking the manual-mode workflow — i.e., the skill should describe the manual flow clearly enough that a model reading it works correctly today, while the README leaves room for a future hook-driven mode toggle.
5. **Notification event for user awareness.** Gemini's `Notification` hook fires when permissions are requested. Not relevant to auto-stream.
6. **Trust model in non-interactive runs.** If a future hook-driven mode lands, headless / CI Gemini runs may need a `--dangerously-bypass-hook-trust`-equivalent flag (Gemini doesn't appear to have one documented).

## Citations

Authoritative source (TypeScript monorepo):
- [google-gemini/gemini-cli `packages/core/src/hooks/types.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/types.ts) — `HookEventName` enum, `HookInput`, `AfterAgentInput`, `BeforeAgentInput`, `AfterToolInput`, `BeforeToolInput`.
- [google-gemini/gemini-cli `packages/core/src/hooks/hookEventHandler.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/hookEventHandler.ts) — `createBaseInput()` and `fireAfterAgentEvent()` show payload assembly.
- [google-gemini/gemini-cli `packages/core/src/services/chatRecordingTypes.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingTypes.ts) — `MessageRecord`, `ToolCallRecord`, `ConversationRecord` shapes for the transcript JSONL.
- [google-gemini/gemini-cli `packages/core/src/services/chatRecordingService.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts) — JSONL reader/writer behavior, `$rewindTo` / `$set` meta-records.

PRs / issues confirming key facts:
- [PR #14663 — feat(core): Add support for transcript_path in hooks for git-ai/Gemini extension](https://github.com/google-gemini/gemini-cli/pull/14663) — merged 2025-12-10, wires `transcript_path` to `chatRecordingService.getConversationFilePath()`.
- [Issue #14715 — Hooks - Transcript Path Support](https://github.com/google-gemini/gemini-cli/issues/14715) — closed 2025-12-19; confirms the original stub-to-empty-string behavior pre-#14663.
- [Issue #9070 — Feature: Comprehensive Hooking System](https://github.com/google-gemini/gemini-cli/issues/9070) — the umbrella issue that landed the hook system.

Developer docs (high-level prose):
- [Gemini CLI hooks](https://geminicli.com/docs/hooks/) — overview.
- [Hooks reference](https://geminicli.com/docs/hooks/reference/) — payload schemas (matches the TS types above).
- [Writing hooks for Gemini CLI](https://geminicli.com/docs/hooks/writing-hooks/) — examples + `GEMINI_PROJECT_DIR` env var.
- [Extension reference](https://geminicli.com/docs/extensions/reference/) — `gemini-extension.json`, skills layout.
- [Tailor Gemini CLI to your workflow with hooks (Google Developers Blog)](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/) — launch post.

Community / third-party:
- [skills.rest — gemini-hooks: Automate Gemini CLI with lifecycle hooks](https://skills.rest/skill/gemini-hooks) — third-party automation skill that uses the same `AfterAgent` event.
- [DeepWiki — Hooks System overview](https://deepwiki.com/google-gemini/gemini-cli/5.7-hooks-system) — third-party reverse-engineered architecture summary.
