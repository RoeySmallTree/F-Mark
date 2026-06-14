# Codex Runtime Integration Research

Research date: 2026-05-25

Local check: `codex-cli 0.133.0` in `/home/roey/workspace/F-Mark`.

Scope: Codex CLI/runtime gaps for F-Mark MCP planning, managed agents, hooks, session forking, and sub-agent streaming. Primary sources are the current OpenAI Codex docs, `openai/codex` source, local CLI help, and local F-Mark planning/code.

Confidence scale: `High` means documented and observed in local CLI or source; `Medium` means documented/source-backed but not smoke-tested in a live managed tmux session; `Low` means inferred and should not ship without a local test.

## Executive Summary

| Area | Ship now | Research more | Unsupported / not found | Confidence |
| --- | --- | --- | --- | --- |
| MCP install/config | Parse user config, project config, and system config; install global MCP with `codex mcp add`; edit TOML directly for project scope; support stdio and streamable HTTP. | Smoke-test project `.codex/config.toml` trust flow and exact effective `mcp_servers` merge behavior. | No `codex mcp add --scope project`; no CLI custom header flags; no SSE-only transport found. | High |
| Version markers | Use stdio `env` / `env_vars` or HTTP `http_headers` / `env_http_headers` for F-Mark version markers. | Decide marker key and migration policy. | TOML comments are not a reliable install marker. | High |
| Hook payload basics | Rely on `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `turn_id`, `model`, and `permission_mode`; parse Codex hook schemas separately from Claude. | Capture raw payloads locally to confirm nullable fields and transcript shape for this installed build. | No hook field for user-facing session title/name. | High |
| Session naming | Keep F-Mark's own display name; optionally set Codex app-server thread name after launch/fork. | Test app-server naming if F-Mark adopts app-server control. | No CLI launch or `codex fork` name flag found. | Medium |
| Context meter | Use app-server token usage notifications if using app-server; otherwise treat `/status` as terminal-only UI. | Terminal parse `/status` only as a fallback experiment. | Hooks do not expose used/available context. | High |
| Access modes | Launch with `--ask-for-approval` and `--sandbox`; read current mode from hook payloads and app-server/session events. | Structured live changes through app-server; tmux `/permissions` automation. | No reliable hooks-only live mode mutation API. | High |
| Compact/clear | Support idle-only `/compact` and `/clear` in tmux; use PreCompact/PostCompact hooks; app-server has a compact start method. | Verify exact queue/disable behavior in managed panes. | No standalone `codex compact` or `codex clear` CLI subcommand found. | High |
| Fork/branch | Codex has native `/fork` and `codex fork`; F-Mark can capture `session_id` and offer an optional native fork path after testing. | tmux behavior, new session capture, app-server `ThreadSetName` after fork. | No `/branch` or `codex branch`; no fork name flag. | High |
| Sub-agents | Codex supports subagents and emits SubagentStart/SubagentStop hooks; F-Mark can show final sub-agent result from hook/transcript. | Progressive child output, nested tool calls, failures, and app-server collab events. | Do not promise live nested sub-agent streaming from hooks alone. | Medium |
| Access request detection | Prefer structured `PermissionRequest` hook and app-server approval requests. | Terminal pattern fallback only for no-hook/no-app-server mode. | Terminal prompt scraping should not be primary. | High |

## Findings By Topic

### 1. MCP Install And Config

Codex documents MCP support for CLI and IDE, with CLI commands `codex mcp add`, `codex mcp list`, `codex mcp get`, `codex mcp remove`, `codex mcp login`, and `codex mcp logout` ([Codex MCP docs](https://developers.openai.com/codex/mcp)). Local CLI help on `codex-cli 0.133.0` matches those subcommands and shows `codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)`.

Config layering is user plus project plus system. The official config reference says user config is `$CODEX_HOME/config.toml`, defaulting to `~/.codex/config.toml`, and project overrides live in `.codex/config.toml` files that load only after project trust ([Codex config reference](https://developers.openai.com/codex/config-reference)). Source confirms system config at `/etc/codex/config.toml` on Unix and project layers from the cwd/git-root ancestry ([config loader](https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs), [core config](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs)).

`codex mcp add` is a user/global installer, not a project installer. The source path that handles the command writes to `codex_home` and the global MCP loader explicitly has no cwd/project context, so `codex mcp list/get/remove` are diagnostics for global MCP config, not a complete project-aware effective-config API ([mcp_cmd.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs), [core config](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs)). F-Mark should edit `.codex/config.toml` directly for project scope, with a trust warning and a smoke test before enabling automation by default.

Codex supports stdio and streamable HTTP MCP transports. Stdio supports `command`, `args`, `env`, `env_vars`, `cwd`, and timeouts. Streamable HTTP supports `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`, and timeouts. Shared controls include `enabled`, `required`, tool allow/deny lists, and tool approval modes. Inline HTTP bearer tokens are rejected; use environment-backed secrets ([Codex MCP docs](https://developers.openai.com/codex/mcp), [config reference](https://developers.openai.com/codex/config-reference), [mcp_types.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/mcp_types.rs)).

CLI install flags are narrower than the TOML schema. Local `codex mcp add --help` exposes `--env KEY=VALUE` for stdio, `--url` for HTTP, and `--bearer-token-env-var` for HTTP. It does not expose custom HTTP header flags, so F-Mark needs a TOML writer for HTTP headers and env-sourced headers.

Version marker feasibility is good:

- For stdio, write `env = { F_MARK_MCP_VERSION = "..." }` or require `env_vars = ["F_MARK_MCP_VERSION"]`.
- For HTTP, use a non-secret `http_headers` marker or `env_http_headers` if the value should come from environment.
- Avoid relying on TOML comments as a marker; TOML edits and formatters can drop them.

Local F-Mark relevance: [findings-codex.md](findings-codex.md) already captured most MCP behavior from an earlier pass. The installer code should treat that file as historical context and prefer the current docs/source above.

### 2. Hooks, Live Stream Payloads, And Session Identity

Codex lifecycle hooks are first-class and include `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, `Stop`, `SubagentStart`, and `SubagentStop` ([Codex hooks docs](https://developers.openai.com/codex/hooks), [protocol HookEventName](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)). Hook commands receive JSON on stdin.

Common hook fields are source-backed: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, and `turn_id`. Tool hooks add `tool_name`, `tool_use_id`, and `tool_input`; `Stop` adds `last_assistant_message` and `stop_hook_active`; `UserPromptSubmit` adds `prompt`; several hook schemas include `agent_id` and `agent_type` ([Stop schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/stop.command.input.schema.json), [UserPromptSubmit schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/user-prompt-submit.command.input.schema.json), [PreToolUse schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/pre-tool-use.command.input.schema.json), [PermissionRequest schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/permission-request.command.input.schema.json)).

Human-readable session title/name is not in hook command payloads. The lower-level protocol has `SessionConfiguredEvent` with `session_id`, `thread_id`, optional `forked_from_id`, optional `thread_name`, `cwd`, and `rollout_path`, but that is protocol/app-server level rather than hook stdin ([protocol.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)). App-server schemas include `ThreadSetNameParams`, but `ThreadStartParams` and `ThreadForkParams` do not include a name field ([app-server protocol schemas](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol/schema/json/v2)). CLI `codex` launch and `codex fork` help show no session name option.

F-Mark should therefore keep its own agent/session display name as the source of truth. If F-Mark later controls Codex through app-server, it can set Codex's thread name after start/fork as a best-effort cosmetic sync. In tmux-only mode, capture Codex `session_id` from hooks and map it to the F-Mark participant/session.

Transcript parsing is a real gap. Current F-Mark hook code assumes Claude-like transcript content blocks in [transcript.ts](../../packages/kernel/src/hooks/transcript.ts) and the Codex skill warns that Codex transcript parsing is not yet stable for F-Mark auto-streaming ([Codex F-Mark skill](../../packages/kernel/assets/codex-skill/f-mark/SKILL.md)). Codex support should add a separate Codex transcript/rollout parser and keep Claude parsing untouched.

### 3. Context, Access, Compact, And Clear

Context used/available is available in Codex UI/protocol surfaces, not hooks. The slash command docs say `/status` shows session configuration and token usage/remaining context ([Codex slash commands](https://developers.openai.com/codex/cli/slash-commands)). Source protocol includes token usage and context window fields in `TokenUsageInfo`, `TurnStartedEvent`, and app-server `ThreadTokenUsageUpdatedNotification` ([protocol.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs), [ThreadTokenUsageUpdatedNotification schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadTokenUsageUpdatedNotification.json)). Hook payload schemas do not include token usage.

Access modes are supported at launch and config. CLI help and docs support `--ask-for-approval` / `approval_policy` and `--sandbox` / `sandbox_mode`; supported sandbox modes are `read-only`, `workspace-write`, and `danger-full-access`. Approval docs mark `on-failure` as deprecated in favor of `on-request` for interactive runs and `never` for non-interactive runs ([Codex permissions](https://developers.openai.com/codex/permissions), [config reference](https://developers.openai.com/codex/config-reference)). Hook payloads expose `permission_mode`; protocol/session events expose approval and sandbox settings.

Live access changes exist in the TUI through `/permissions` ([Codex slash commands](https://developers.openai.com/codex/cli/slash-commands)). For F-Mark, the reliable shipping surface is "launch with desired access" plus "observe current mode from hooks/app-server." Automating live `/permissions` through tmux needs a smoke test because it is an interactive editor. App-server is the better structured path if F-Mark needs programmatic live permission profiles.

Compact and clear are slash commands, not standalone CLI subcommands in the local `codex-cli 0.133.0` help. `/compact [instructions]` compacts the current conversation, and `/clear` starts a fresh thread with no history. The slash command docs say slash commands submitted while a task is running are queued, while `/clear` is disabled while a task is in progress ([Codex slash commands](https://developers.openai.com/codex/cli/slash-commands)). Hooks include `PreCompact` and `PostCompact`, and app-server has a `ThreadCompactStart` method/schema ([hooks docs](https://developers.openai.com/codex/hooks), [ThreadCompactStartParams](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadCompactStartParams.json)).

F-Mark should only offer compact/clear controls while the managed agent is idle or ready, unless an app-server controller is tracking turn state. `/clear` should be treated as context-destructive for the Codex thread and should require explicit user intent.

### 4. Native Fork / Branch

Codex now has native fork support. The slash command docs include `/fork`, described as opening a new UI session while preserving current context ([Codex slash commands](https://developers.openai.com/codex/cli/slash-commands)). Local CLI help exposes `codex fork [SESSION_ID] [PROMPT]`, with `--last`, `--all`, and normal launch options. Local `codex resume --help` can resume by session UUID or thread name.

No branch mechanism was found. Local `codex branch --help` falls back to root help, and the official slash command list does not include `/branch`. Plan wording should say "fork" for Codex, not "branch."

Naming remains limited. `codex fork` has no name flag, and `/fork` has no documented name argument. App-server can fork a thread and then set its name with `ThreadSetNameParams`; the fork params schema does not include a name field ([ThreadForkParams](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadForkParams.json), [ThreadSetNameParams](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadSetNameParams.json)).

Recommended F-Mark stance:

- V1 should continue supporting F-Mark-only forks: create the F-Mark fork session, keep Codex in the current pane, and send a handoff prompt if needed.
- Optional native Codex fork can be enabled after smoke tests with capability metadata such as `supports_native_fork = true`, `command = "/fork"`, `command_accepts_name = false`, and `cli_relaunch = "codex fork <session_id> <prompt>"`.
- If app-server is adopted, set the Codex thread name after fork as cosmetic sync; keep F-Mark's branch/session name authoritative.

### 5. Delegated / Sub-Agent Visibility

Codex supports delegated subagents. Official docs describe `/agents`, `[agents.<id>]` config, and an `agent` tool with parameters such as `task`, optional `agent`, model choices, output mode, and write capability ([Codex subagents](https://developers.openai.com/codex/subagents)). The config reference also lists multi-agent features and agent config keys ([config reference](https://developers.openai.com/codex/config-reference)).

Hooks expose sub-agent boundaries. `SubagentStart` includes `agent_id`, `agent_type`, session/cwd/model/permission fields, transcript path, and turn id. `SubagentStop` includes those fields plus `agent_transcript_path`, `last_assistant_message`, and `stop_hook_active` ([SubagentStart schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/subagent-start.command.input.schema.json), [SubagentStop schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/subagent-stop.command.input.schema.json)).

Protocol source has richer collaboration events with agent references, thread ids, call ids, nicknames/roles, prompts, interaction begin/end, waiting state, close/resume, and statuses ([protocol.rs](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)). That is promising for app-server/live streaming, but it should be treated as `Medium` confidence until F-Mark captures the actual app-server event stream for a delegated task.

Hooks alone should be modeled as final-result visibility, not full progressive child streaming. F-Mark can show a child row on `SubagentStart`, attach the child transcript path after `SubagentStop`, and display the final assistant message. Progressive live output, nested tool calls, failure states, and parent call-id mapping should be gated behind either app-server support or a validated Codex transcript parser.

### 6. Access Request Detection

Structured access detection exists. The `PermissionRequest` hook runs before Codex asks the user for tool permission and includes `tool_name`, `tool_input`, session/cwd/model/permission fields, turn id, and optional agent fields ([Codex hooks docs](https://developers.openai.com/codex/hooks), [PermissionRequest schema](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/permission-request.command.input.schema.json)). Hook output can approve, deny, or escalate according to the docs.

App-server/source also contains structured approval request paths for command execution, file changes, permission requests, MCP elicitation, and similar prompts through the app-server protocol schemas ([app-server docs](https://developers.openai.com/codex/app-server), [app-server protocol schemas](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol/schema/json/v2)).

Terminal pattern detection should be a fallback only. It can label "looks blocked on approval" when hooks/app-server are unavailable, but it should not be trusted as the primary way to identify the tool, target path, or approved action.

## Implications For Planning Files

### `plan.md`

- Treat Codex as having MCP support with two install paths: CLI global install and direct TOML project install.
- Add a Codex runtime capability layer with `hooks`, `app_server`, and `terminal_fallback` feature levels.
- Add Codex hook parser work for `PermissionRequest`, `SubagentStart`, `SubagentStop`, `PreCompact`, and `PostCompact`.
- Add Codex transcript parser work; do not reuse the Claude transcript parser.
- Mark native fork as supported but gated by smoke tests; mark branch unsupported.
- Add app-server as an optional structured backend for context usage, thread naming, fork control, and sub-agent/collab events.

### `ux-flow.md`

- Show Codex install scope as "User config" or "Project `.codex/config.toml`"; explain that project config requires trusted project state.
- For user/global install, generate `codex mcp add` commands.
- For project install or HTTP headers, write TOML directly after user confirmation.
- Use a visible F-Mark version marker in env/header config, not comments.
- Do not offer "name Codex session at launch" in Codex CLI setup; use F-Mark's display name.

### `compass-flow.md`

- Persist Codex `session_id`, `turn_id`, `transcript_path`, `permission_mode`, and optional app-server `thread_id` / `thread_name`.
- Treat Codex session name/title as optional metadata, not identity.
- Add `PermissionRequest` as the structured source for access cards.
- Add `SubagentStart` / `SubagentStop` as the hooks-only source for sub-agent rows and final result cards.
- Distinguish "live stream from app-server" from "final hook/transcript update."

### `agent-control-and-targeting.md`

- Context meter: ship only when app-server token usage is available; otherwise show unknown or request a `/status` smoke-test-backed parser.
- Access controls: launch-time sandbox/approval changes are safe; live TUI `/permissions` automation is research.
- Compact/clear buttons should be disabled while running/access-pending unless app-server state proves the thread is idle.
- Command targeting should include Codex slash commands `/compact`, `/clear`, `/fork`, `/permissions`, and `/agents` as runtime-specific actions.

### `session-forking.md`

- Update Codex capability from "unknown" to "native fork exists."
- Add `codex fork <session_id> <prompt>` as a possible relaunch-based native fork.
- Add `/fork` as a tmux slash-command candidate, gated by smoke tests.
- State that Codex branch naming is not supported by CLI/slash command; F-Mark branch name remains authoritative.
- Keep F-Mark-only fork/handoff as the default fallback.

### `subagent-streaming.md`

- Update Codex from "unknown" to "subagents supported."
- Define a hooks-only implementation: create child node on `SubagentStart`, complete it on `SubagentStop`, parse `agent_transcript_path` for details when safe.
- Gate progressive streaming, nested tool calls, failure status, parent call-id, and child live output on app-server or validated transcript support.
- Use `agent_id` / `agent_type` as stable raw identifiers and app-server nickname/role only when available.

## Concrete Recommended Plan Edits

- Add a "Codex MCP install strategy" bullet: global installs use `codex mcp add/list/get`; project installs use `.codex/config.toml` TOML edits with trust-gated UX and source-preserving writes.
- Add a "Codex config schema" bullet: support stdio `command/args/env/env_vars/cwd`, HTTP `url/bearer_token_env_var/http_headers/env_http_headers`, timeouts, `enabled/required`, and per-tool approval controls.
- Add a "Codex marker" bullet: set `F_MARK_MCP_VERSION` in stdio env or an `X-F-Mark-MCP-Version` HTTP header/env-header.
- Add a "Codex hook identity" bullet: capture `session_id`, `turn_id`, `transcript_path`, `cwd`, `permission_mode`, `agent_id`, and `agent_type`; do not require a human-readable runtime title.
- Add a "Codex transcript parser" task before Codex auto-stream GA; current parser is Claude-shaped.
- Add a "Codex access request" bullet: use `PermissionRequest` hook or app-server approval request as primary; terminal pattern fallback is diagnostic only.
- Add a "Codex context" bullet: use app-server token usage notifications for context meter; hooks cannot provide context remaining.
- Add a "Codex compact/clear" bullet: expose `/compact` and `/clear` only when idle; listen for PreCompact/PostCompact; no standalone CLI subcommands.
- Add a "Codex fork" bullet: native fork exists through `/fork` and `codex fork`, but no branch/name flag; F-Mark-only fork remains default until tmux/app-server smoke tests pass.
- Add a "Codex sub-agent visibility" bullet: hooks provide start/stop/final result; progressive nested streaming requires app-server or transcript validation.

## Open Smoke Tests To Run Locally Later

1. Create a temporary `CODEX_HOME`, run `codex mcp add` for a stdio server with `F_MARK_MCP_VERSION`, then verify `codex mcp list --json` and `codex mcp get --json`.
2. Add an HTTP MCP server with `--bearer-token-env-var`, then directly edit TOML for `http_headers` and `env_http_headers`; confirm Codex loads it.
3. Add project `.codex/config.toml` MCP config in a trusted and untrusted repo; confirm when Codex loads or ignores it.
4. Install Codex hooks that dump stdin JSON for `SessionStart`, `UserPromptSubmit`, `Stop`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, `PreCompact`, and `PostCompact`; compare captured payloads to schemas.
5. Trigger a permission prompt and verify `PermissionRequest` arrives before the terminal prompt and whether hook output can approve/deny/escalate safely.
6. Inspect Codex transcript/rollout files from a normal turn, tool turn, failed turn, and permission-blocked turn; design a Codex-specific parser.
7. Run `/status` in tmux and check whether terminal output can be parsed reliably; compare with app-server token usage notifications.
8. Send `/compact` and `/clear` while idle and while a turn is running; verify queue/disabled behavior and hooks.
9. Test `/fork` in a managed tmux pane: observe whether the pane switches to the fork, whether a new hook `session_id` appears, and how F-Mark can map it.
10. Test `codex fork --last "handoff prompt"` and `codex fork <session_id> "handoff prompt"`; verify prompt delivery, cwd, access modes, and new session capture.
11. Configure a minimal Codex subagent, ask Codex to delegate, and capture hook payloads plus child transcript; repeat with a failing subagent.
12. Run app-server thread start/fork/set-name/compact/token-usage/subagent tests if F-Mark chooses app-server as the structured control plane.

## Sources

Official docs:

- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference)
- [Codex Hooks](https://developers.openai.com/codex/hooks)
- [Codex CLI Slash Commands](https://developers.openai.com/codex/cli/slash-commands)
- [Codex Permissions](https://developers.openai.com/codex/permissions)
- [Codex Subagents](https://developers.openai.com/codex/subagents)
- [Codex App Server](https://developers.openai.com/codex/app-server)

Primary source:

- [`codex-rs/cli/src/mcp_cmd.rs`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs)
- [`codex-rs/config/src/mcp_types.rs`](https://github.com/openai/codex/blob/main/codex-rs/config/src/mcp_types.rs)
- [`codex-rs/config/src/loader/mod.rs`](https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs)
- [`codex-rs/core/src/config/mod.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs)
- [`codex-rs/protocol/src/protocol.rs`](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)
- [Codex hook input schemas](https://github.com/openai/codex/tree/main/codex-rs/hooks/schema/generated)
- [Codex app-server protocol schemas](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol/schema/json/v2)

Local F-Mark references:

- [findings-codex.md](findings-codex.md)
- [plan.md](plan.md)
- [ux-flow.md](ux-flow.md)
- [compass-flow.md](compass-flow.md)
- [agent-control-and-targeting.md](agent-control-and-targeting.md)
- [session-forking.md](session-forking.md)
- [subagent-streaming.md](subagent-streaming.md)
- [autoStream.ts](../../packages/kernel/src/hooks/autoStream.ts)
- [transcript.ts](../../packages/kernel/src/hooks/transcript.ts)
- [projectTurn.ts](../../packages/kernel/src/hooks/projectTurn.ts)
- [hooksInstall/codex.ts](../../packages/kernel/src/hooksInstall/codex.ts)
- [Codex F-Mark skill](../../packages/kernel/assets/codex-skill/f-mark/SKILL.md)
