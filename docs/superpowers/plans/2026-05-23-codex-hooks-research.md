# Codex Hook Research

Research date: 2026-05-23
Researcher: Task 24 of F-Mark auto-stream-hook plan
Codex CLI source: github.com/openai/codex (Rust workspace under `codex-rs/`)

## TL;DR

**Codex CLI has full lifecycle hooks today, with a `Stop` event that fires when the assistant finishes a turn and a `UserPromptSubmit` event that fires when the user submits a prompt — exactly analogous to Claude Code.** The stdin contract is JSON, the event names match Claude Code 1:1, hooks are declared in TOML (or sibling `hooks.json`), and Codex even exposes a per-session JSONL transcript via `transcript_path`. Task 25 can build a hook-driven skill bundle for Codex with essentially the same architecture as the Claude Code skill — only the registration mechanism and the transcript schema differ.

In addition, Codex has a *separate, older* mechanism — the top-level `notify` argv command — which fires only on `agent-turn-complete` with the last assistant message embedded in the payload as a CLI argument (no stdin). For F-Mark's auto-stream use case the modern `[hooks.Stop]` / `[hooks.UserPromptSubmit]` path is strictly superior, but `notify` is worth knowing about as a near-zero-config fallback.

---

## Configuration

- **User-level config**: `~/.codex/config.toml` (or anywhere `$CODEX_HOME` points; defaults to `~/.codex`).
- **Project-level override**: `.codex/config.toml` in the project root — **yes, supported**, but only loaded if the user has marked the project as trusted. A few keys (`notify`, `profile`, `profiles`, `openai_base_url`, `model_provider`, `approval_policy`, `sandbox_mode`, …) are ignored if set in a project-local config and Codex prints a startup warning. Hooks themselves *are* allowed in project-local config (subject to trust-on-first-use review).
- **Format**: TOML. Hooks may alternatively live in a sibling `hooks.json` (`~/.codex/hooks.json` or `<repo>/.codex/hooks.json`); same schema, JSON wire form.
- **Plugin-bundled hooks**: a plugin (skill) bundle may ship `hooks/hooks.json` in its root.
- **Managed (admin-pushed) hooks**: declared in `requirements.toml`; an admin can set top-level `allow_managed_hooks_only = true` in `requirements.toml` to ignore user/project/session hooks while keeping the managed ones.

Precedence — closest-scope wins, but **all matching hooks from all loaded files run** (matchers are additive). Project-local hooks only load when the `.codex/` layer is trusted; otherwise they're silently dropped with a warning.

## Lifecycle hooks

Available events — from `codex-rs/hooks/src/lib.rs`:

```rust
pub const HOOK_EVENT_NAMES: [&str; 10] = [
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PreCompact",
    "PostCompact",
    "SessionStart",
    "UserPromptSubmit",
    "SubagentStart",
    "SubagentStop",
    "Stop",
];
```

Mapping to Claude Code's hook vocabulary:

| Claude Code event | Codex equivalent | Notes |
|---|---|---|
| `Stop` | `Stop` | Same name, same trigger (turn complete). |
| `UserPromptSubmit` | `UserPromptSubmit` | Same name. |
| `PreToolUse` / `PostToolUse` | `PreToolUse` / `PostToolUse` | Matcher = tool name regex (e.g., `^Bash$`). |
| `SessionStart` | `SessionStart` | Matchers: `startup`, `resume`, `clear`, `compact`. |
| `Notification` | (none — see `notify` argv hook below for partial overlap) | Codex has no general-purpose Notification event; the legacy `notify` argv command is its narrowest equivalent. |
| (none) | `PermissionRequest` | Codex-specific: fires when approval is needed. |
| (none) | `PreCompact` / `PostCompact` | Compaction lifecycle. |
| (none) | `SubagentStart` / `SubagentStop` | For Codex subagents. |

Matchers are regex strings that filter the event. **`UserPromptSubmit` and `Stop` ignore the matcher field** (per `HOOK_EVENT_NAMES_WITH_MATCHERS` — only 8 of the 10 events use matchers). Use `"*"`, `""`, or omit `matcher` for everything else.

## Hook invocation contract

Hooks are command-type by default — i.e., a shell command Codex spawns, with JSON written to its stdin and a JSON response read from stdout (or plain text accepted as developer context for `SessionStart` / `UserPromptSubmit` / `SubagentStart`). The TOML form:

```toml
[[hooks.Stop]]
# matcher = "*"   # ignored for Stop

[[hooks.Stop.hooks]]
type = "command"
command = "/usr/bin/python3 /home/me/.codex/hooks/fmark_stop.py"
commandWindows = "py -3 C:\\Users\\me\\.codex\\hooks\\fmark_stop.py"   # optional, Windows override
timeout = 30            # seconds; default 600
statusMessage = "F-Mark stream"
```

Or equivalently in `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "/usr/bin/python3 ~/.codex/hooks/fmark_stop.py", "timeout": 30 }
        ]
      }
    ]
  }
}
```

### Stdin payload — Stop (authoritative, from `codex-rs/hooks/schema/generated/stop.command.input.schema.json`)

```json
{
  "session_id":            "string",                                // UUID-ish
  "transcript_path":       "string|null",                           // path to per-session rollout JSONL, or null
  "cwd":                   "string",
  "hook_event_name":       "Stop",
  "model":                 "string",                                // e.g. "gpt-5.5"
  "permission_mode":       "default|acceptEdits|plan|dontAsk|bypassPermissions",
  "turn_id":               "string",                                // Codex-only extension
  "stop_hook_active":      "boolean",                               // true on continuation passes
  "last_assistant_message": "string|null"                           // ← key field for auto-stream
}
```

All fields are required (some nullable).

### Stdin payload — UserPromptSubmit (authoritative, from `user-prompt-submit.command.input.schema.json`)

```json
{
  "session_id":      "string",
  "transcript_path": "string|null",
  "cwd":             "string",
  "hook_event_name": "UserPromptSubmit",
  "model":           "string",
  "permission_mode": "default|...",
  "turn_id":         "string",
  "prompt":          "string",                          // the user message just submitted
  "agent_id":        "string (optional)",
  "agent_type":      "string (optional)"
}
```

### Stdin payload — PostToolUse (for completeness; tool-result parity)

```json
{
  "session_id":      "string",
  "transcript_path": "string|null",
  "cwd":             "string",
  "hook_event_name": "PostToolUse",
  "model":           "string",
  "permission_mode": "default|...",
  "turn_id":         "string",
  "tool_name":       "string",          // e.g. "Bash", "apply_patch", "mcp__server__tool"
  "tool_use_id":     "string",
  "tool_input":      <any>,             // arbitrary JSON
  "tool_response":   <any>              // arbitrary JSON (the tool's output)
}
```

### Timeout

- Default: **600 s**.
- Configurable per hook via the `timeout` field (seconds).
- Hooks run concurrently — one slow hook cannot block another from the same event.

### Output / exit codes

Hooks can return either plain text (taken as additional developer context for `SessionStart` / `UserPromptSubmit` / `SubagentStart`) or a structured JSON response:

```json
{
  "continue": true,
  "stopReason": "...",
  "systemMessage": "...",
  "suppressOutput": false,
  "hookSpecificOutput": { "hookEventName": "Stop", "additionalContext": "..." }
}
```

- Exit `0` with no output = success silent.
- Exit `2` = block / deny (event-specific semantics).
- If any matching `Stop` hook returns `continue: false`, that wins (overrides any other matching `Stop` hooks that wanted to continue).
- For F-Mark's auto-stream-on-Stop use case, the hook should exit `0` with no output and do its HTTP POST as a side effect; we never want to block or alter the turn.

### Plugin-hook env vars

When a hook is delivered as part of a plugin (skill) bundle, Codex sets:
- `PLUGIN_ROOT` — path to the installed plugin root
- `PLUGIN_DATA` — plugin's writable data dir
- `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` — compatibility aliases (deliberate Claude-Code-compat — useful, since F-Mark's existing CC skill bundle already reads these names)

No special env vars for non-plugin (user/project) hooks; the spawned command runs with the session's `cwd` as its working directory.

### Trust requirements

Non-managed hooks (i.e., anything declared by the user, by a project's `.codex/`, or by an installed plugin) require **trust review** before they execute. Codex shows the command and asks before first run. A `--dangerously-bypass-hook-trust` flag exists for one-off bypass. **For Task 25, the install flow must surface this expectation to the user** — installing the skill will prompt for trust on first turn.

## Legacy `notify` argv hook (separate mechanism)

Codex has a *second*, older notification mechanism that pre-dates the lifecycle hook system. It lives at the top level of `config.toml`:

```toml
notify = ["/usr/bin/python3", "/home/me/.codex/notify.py"]
```

Codex spawns this command with **one extra argv** appended — a JSON string whose schema (from `codex-rs/hooks/src/legacy_notify.rs`) is:

```json
{
  "type":                   "agent-turn-complete",
  "thread-id":              "b5f6c1c2-...",
  "turn-id":                "12345",
  "cwd":                    "/Users/example/project",
  "client":                 "codex-tui",                     // optional
  "input-messages":         ["Rename `foo` to `bar` ..."],
  "last-assistant-message": "Rename complete and verified ..."
}
```

Note the **kebab-case** keys (`thread-id`, `turn-id`, `last-assistant-message`) — distinct from the snake_case used in the modern `[hooks.Stop]` stdin schema. The notify payload arrives as the **last argv**, not on stdin; stdin is closed.

Currently the only fired event is `agent-turn-complete`. There is no `UserPromptSubmit`-equivalent on this channel.

**Why this exists separately**: backward compatibility with the original Codex notification feature. The modern `[hooks.Stop]` path supersedes it for new integrations.

**Implication for F-Mark**: Don't use `notify` for the main auto-stream Stop hook — `[hooks.Stop]` is richer (stdin JSON, transcript path, structured response, per-hook timeout). But `notify` could be a one-line opportunistic fallback for users who have an existing `notify =` slot — F-Mark can chain into it.

## Transcript

- **Available**: yes — Codex exposes a per-session "rollout" file as `transcript_path` in every hook stdin payload (nullable; null only if the rollout isn't materialized yet).
- **Format**: JSON Lines (one JSON object per line). Each line is a serialized session event from the Codex protocol.
- **Location**: under `$CODEX_HOME` (default `~/.codex/`). The aggregated user-facing history file is `~/.codex/history.jsonl`; the per-session rollout exposed via `transcript_path` is a different file (under a `sessions/` subtree).
- **Stability**: **The Codex docs explicitly warn the transcript format is NOT a stable interface and may change over time.** Hooks should treat it as best-effort and prefer the structured stdin payload (which has `last_assistant_message`, `prompt`, etc.) wherever possible.
- **Persistence config**:
  ```toml
  [history]
  persistence = "save-all"   # or "none"  (default: save-all)
  max_bytes   = 5000000      # optional rolling cap
  ```

I did not snapshot a sample transcript line from a running session — the schema is in flux and the docs flag it as unstable, so locking F-Mark to a specific line shape today would be brittle. The stdin payload's `last_assistant_message` field is the supported channel.

## Tool / function-call representation

In hook stdin payloads (the supported channel), tool calls and results are surfaced via the dedicated `PreToolUse` and `PostToolUse` events with these fields:

- `tool_name` — string (Codex uses bare names like `Bash`, `apply_patch`, `Edit`, `Write`, and `mcp__<server>__<tool>` for MCP tools — same convention as Claude Code).
- `tool_use_id` — string correlator that pairs `PreToolUse` with its matching `PostToolUse`.
- `tool_input` — arbitrary JSON (whatever the tool was called with).
- `tool_response` — arbitrary JSON (whatever the tool returned), present only on `PostToolUse`.

In the per-session rollout JSONL (`transcript_path`), the underlying representation is Codex's own internal event protocol — **not OpenAI's `tool_calls` array shape, not MCP's call/result shape, and not Claude Code's `tool_use`/`tool_result` content blocks**. Codex serializes its own `EventMsg` variants. Because the format is declared unstable, F-Mark integration should rely on the structured `tool_input` / `tool_response` fields delivered via `PostToolUse`, not parse the rollout file.

For the F-Mark autostream-tool-pairing use case, the recipe is:
1. Subscribe a hook to `PostToolUse` (no matcher → fires for every tool).
2. Receive `tool_use_id`, `tool_name`, `tool_input`, `tool_response` on stdin.
3. POST a structured envelope to F-Mark mid-turn (still `arbitrary=true` since the turn isn't over).
4. Optionally also subscribe to `PreToolUse` to record the call before its response lands.

## `participant_id` discovery

F-Mark today uses an `ag-claude` style id baked into the Claude Code skill, cached locally by the agent on first run. For Codex the analogous mechanism is:

- The skill bundle ships with a hardcoded `participant_id` such as `ag-codex` (matching Claude's `ag-claude`).
- The bundle's install script POSTs to F-Mark to register the participant on first run, and caches the result (e.g., under `$PLUGIN_DATA/participant_id`).
- The Stop / UserPromptSubmit hook command reads the cached id from `$PLUGIN_DATA` (or a known path like `~/.codex/fmark/participant_id`) and includes it in every POST.

Codex itself does **not** expose any built-in agent-identity field in the hook stdin payload. The `session_id`/`turn_id` fields identify the *session*, not the agent persona, so F-Mark must own the namespace (just as it does for Claude Code).

Two practical notes:
1. The `PLUGIN_ROOT` / `PLUGIN_DATA` env vars Codex sets for plugin-bundled hooks are the natural place to cache the participant id without leaking it into the broader user home. Codex even aliases these as `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` for cross-CLI compat, so F-Mark's existing Claude-Code-style cache lookup logic should work unchanged inside a Codex skill bundle.
2. If the skill is delivered as a *user* hook (not a plugin) — i.e., directly via `~/.codex/config.toml` + `~/.codex/hooks/fmark_stop.py` — there's no `PLUGIN_DATA`; the script must use its own cache path (e.g., `~/.codex/fmark/participant_id`).

## Mapping to F-Mark

| F-Mark need | Codex mechanism |
|---|---|
| Stop equivalent | `[[hooks.Stop]]` with a command that reads JSON stdin, extracts `last_assistant_message` + `turn_id` + `session_id`, POSTs to F-Mark with `arbitrary=false`. |
| UserPromptSubmit equivalent | `[[hooks.UserPromptSubmit]]` reading `prompt` + `turn_id` + `session_id`, POSTing the human turn. |
| Mid-turn tool-result pairing | `[[hooks.PreToolUse]]` + `[[hooks.PostToolUse]]` matched via `tool_use_id`. Both deliver structured `tool_input` / `tool_response`. |
| Hook command shape | Shell command spawned by Codex; JSON on stdin (kebab-case differs from notify); exit 0 silent = success. |
| Participant id | Hardcoded `ag-codex` in the skill bundle, registered on first install, cached under `$PLUGIN_DATA` (plugin install) or `~/.codex/fmark/` (manual install). |
| Trust UX | First-turn trust prompt — Codex blocks the hook until the user approves. The skill README must call this out. |
| Bundling | Codex skill bundle layout: `SKILL.md`, optional `scripts/`, optional `agents/openai.yaml`, plus `hooks/hooks.json` for plugin-installed hooks. Discovered under `.agents/skills/` (repo) or `$HOME/.agents/skills/` (user). |

### Recommended Task-25 approach

**Build a hook-driven Codex skill bundle, NOT a manual-POST fallback.** Codex's `Stop` hook fires identically to Claude Code's, with the last assistant message and a transcript pointer in a snake_case JSON stdin payload. The Python hook can be ~30 lines and largely lifted from the Claude Code Stop hook in F-Mark, with these adjustments:

1. **Field-name remap.** Codex stdin uses `last_assistant_message` / `turn_id` / `session_id` / `transcript_path` — identical snake_case to Claude Code. **No remap needed for the hook stdin path.** (Only the legacy `notify` argv would have required kebab-case remap.)
2. **Different cache root.** Use `$PLUGIN_DATA` if set (skill bundle install), else `$CODEX_HOME` if set, else `~/.codex/fmark/`.
3. **Bake the participant prefix** as `ag-codex-*` so the F-Mark UI can distinguish Claude Code sessions from Codex sessions.
4. **Bundle layout.** Ship a Codex plugin (skill) so install is one command and the trust review is scoped to the plugin's hooks rather than user-level config:
   ```
   fmark-codex/
   ├── SKILL.md
   ├── agents/openai.yaml          # metadata, declares hook dependency
   ├── hooks/hooks.json            # registers Stop + UserPromptSubmit + PostToolUse hooks
   └── scripts/
       ├── fmark_stop.py
       ├── fmark_user_prompt_submit.py
       └── fmark_post_tool_use.py
   ```
5. **Install README** must explain trust-on-first-use and how to verify hooks are firing (`codex --help` exposes hook diagnostics; users can `tail -F` F-Mark's request log).

The manual-POST fallback (skill instructs model to emit `arbitrary=true` mid-turn) is **not necessary** for Codex. We can keep it as a documented "what if hooks aren't trusted yet" recipe in the skill README, but it should be a paragraph, not the architecture.

## Open questions / blockers

1. **Hook-stdin schema stability.** The hook schemas are auto-generated and live under `codex-rs/hooks/schema/generated/` — explicitly versioned in-tree. The docs call out that the **transcript format** (i.e., the rollout JSONL) is unstable, but the **stdin payload** schema is not flagged as unstable. Treat it as stable for now; F-Mark's hook should tolerate unknown extra fields gracefully (Codex uses `additionalProperties: false` in the schemas, so the input shape is closed *from Codex's side*, meaning the script doesn't need to defend against unknown keys).
2. **Hook fires in `codex exec` (non-interactive) mode?** Not explicitly verified. The notify test in `core/tests/suite/user_notification.rs` exercises the modern hook runtime via a non-interactive submit, which implies yes, hooks fire in `codex exec`. Worth a smoke test in Task 25.
3. **Cross-platform path quoting.** Codex supports `commandWindows` for per-OS overrides; the F-Mark skill should ship both POSIX and Windows variants from the start (`commandWindows` set even on Linux installs costs nothing).
4. **Trust prompt UX in headless / CI / `codex exec` runs.** Unknown whether the trust prompt is interactive (would block headless) or whether plugin hooks pre-approve themselves. Task 25 should document the answer or include an opt-in `--dangerously-bypass-hook-trust` flag in the install instructions.
5. **`agent_id` / `agent_type` fields on `UserPromptSubmit`** are *optional* per the schema. Why optional, and when populated? Probably only set when the turn is dispatched through a subagent. F-Mark can ignore them.
6. **Concurrent hooks vs. F-Mark's append ordering.** Codex runs matching hooks concurrently. If a user has both F-Mark and another tool hooked into `Stop`, there's no ordering guarantee. F-Mark's server is already idempotent on turn id, so this should be fine, but worth confirming we don't depend on Stop-hook ordering anywhere.

## Citations

Authoritative source (Rust crate, the generator of the wire schemas):
- [openai/codex `codex-rs/hooks/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/lib.rs) — `HOOK_EVENT_NAMES` constant lists the 10 events.
- [openai/codex `codex-rs/hooks/schema/generated/stop.command.input.schema.json`](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/stop.command.input.schema.json) — Stop stdin schema.
- [openai/codex `codex-rs/hooks/schema/generated/user-prompt-submit.command.input.schema.json`](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/user-prompt-submit.command.input.schema.json) — UserPromptSubmit stdin schema.
- [openai/codex `codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json`](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json) — PostToolUse stdin schema.
- [openai/codex `codex-rs/hooks/src/legacy_notify.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/legacy_notify.rs) — legacy `notify` argv payload schema (`agent-turn-complete`).
- [openai/codex `codex-rs/core/tests/suite/user_notification.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/tests/suite/user_notification.rs) — end-to-end notify test with exact payload.
- [openai/codex `codex-rs/message-history/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/message-history/src/lib.rs) — `~/.codex/history.jsonl` storage.
- [openai/codex `codex-rs/core/src/session/mod.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/mod.rs) — `hook_transcript_path()` resolves to the per-session rollout file.

Developer docs (high-level prose):
- [Hooks – Codex | OpenAI Developers](https://developers.openai.com/codex/hooks) — canonical hook reference.
- [Advanced Configuration – Codex | OpenAI Developers](https://developers.openai.com/codex/config-advanced) — `notify` schema, transcript persistence.
- [Configuration Reference – Codex | OpenAI Developers](https://developers.openai.com/codex/config-reference) — config.toml file paths, override rules.
- [Sample Configuration – Codex | OpenAI Developers](https://developers.openai.com/codex/config-sample) — example TOML.
- [Skills – Codex | OpenAI Developers](https://developers.openai.com/codex/skills) — skill bundle layout, discovery.
- [Managed configuration – Codex | OpenAI Developers](https://developers.openai.com/codex/enterprise/managed-configuration) — `allow_managed_hooks_only` and managed hook path.

Community / third-party (sanity check, not authoritative):
- [Codex CLI Hooks: Complete Guide to Events, Policy Engines and Production Patterns (Daniel Vaughan, 2026-04)](https://codex.danielvaughan.com/2026/04/15/codex-cli-hooks-complete-guide-events-policy-patterns/) — full hooks walkthrough with sample stdin payloads matching the generated schemas verbatim.
- [PR #11067 — feat(hooks): comprehensive hook system with lifecycle events and steering](https://github.com/openai/codex/pull/11067) — the PR that landed the hook system.
- [Hooks discussion #2150](https://github.com/openai/codex/discussions/2150) — pre-hook-system feature request thread; useful for archaeology of why `notify` was the only thing before.
- [Issue #4005 — JSON passed to `notify` app should include `cwd` or full `environment_context`](https://github.com/openai/codex/issues/4005) — confirms `notify`'s argv-not-stdin design and historical kebab-case quirk.
- [Stovoy/codex-notify-chime](https://github.com/Stovoy/codex-notify-chime) — concrete community example of consuming the `notify` payload.
