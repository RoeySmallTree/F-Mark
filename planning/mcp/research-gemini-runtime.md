# Gemini CLI Runtime Research For F-Mark MCP Planning

Date: 2026-05-25

This is a research outcome for Gemini CLI/runtime integration gaps relevant to F-Mark managed agents, MCP setup, hooks, session forking, and sub-agent streaming. It only records findings and recommended planning edits; it does not update the master planning files.

## Sources Checked

- Gemini CLI MCP docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
- Gemini CLI command reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md
- Gemini CLI CLI reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
- Gemini CLI configuration docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Gemini CLI settings schema: https://github.com/google-gemini/gemini-cli/blob/main/schemas/settings.schema.json
- Gemini CLI trusted folders docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
- Gemini CLI hooks reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- Gemini CLI session management docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md
- Gemini CLI session tutorial: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/tutorials/session-management.md
- Gemini CLI git worktrees docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/git-worktrees.md
- Gemini CLI subagents docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md
- Gemini CLI remote agents docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/core/remote-agents.md
- Gemini CLI policy engine docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
- Gemini CLI tools reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md
- Gemini CLI MCP add source: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/commands/mcp/add.ts
- Gemini CLI MCP list source: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/commands/mcp/list.ts
- Gemini CLI hook event source: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/hookEventHandler.ts
- Gemini CLI hook types source: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/hooks/types.ts
- Gemini CLI stream JSON types: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/output/types.ts
- Gemini CLI stream JSON formatter: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/output/stream-json-formatter.ts
- Gemini CLI clear command source: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/commands/clearCommand.ts
- Gemini CLI compress command source: https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/commands/compressCommand.ts
- Gemini CLI subagent source: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/agents/agent-tool.ts
- Gemini CLI subagent progress source: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/agents/types.ts
- Local Gemini CLI runtime: `gemini --version` returned `0.43.0` from `/home/roey/.local/share/mise/installs/node/lts/bin/gemini`.
- Upstream source clone inspected locally on 2026-05-25: `google-gemini/gemini-cli` main at `630ecc2` (`fix(cli): filter internal session context from history during resumption (#27391)`).
- Local F-Mark planning docs reviewed: `planning/mcp/plan.md`, `planning/mcp/ux-flow.md`, `planning/mcp/compass-flow.md`, `planning/mcp/agent-control-and-targeting.md`, `planning/mcp/session-forking.md`, and `planning/mcp/subagent-streaming.md`.

## Executive Summary

| Area | Ship now | Research more | Unsupported for now | Confidence |
| --- | --- | --- | --- | --- |
| MCP install/config | Project/user MCP install using `gemini mcp add`, project `.gemini/settings.json`, user `~/.gemini/settings.json`, stdio default, HTTP/SSE when needed, `headers`, `env`, `includeTools`, `excludeTools`, and `trust:false`. Use `description` and explicit env/args as version markers. | Header environment expansion, exact admin policy discovery, and whether `gemini mcp list` should be used automatically because it may connect to servers. | CLI `mcp add` has no `global` scope value; system/admin config exists but is not a normal F-Mark write target. JSON comments are not possible as version markers. | High |
| Hooks/live stream payloads | Hooks expose `session_id`, `transcript_path`, `cwd`, event name, timestamp, plus event-specific payloads. Install hooks for `SessionStart`, `SessionEnd`, `BeforeTool`, `AfterTool`, `AfterModel`, `AfterAgent`, `PreCompress`, and `Notification`. | Transcript schema and exact `AfterModel` chunk shape should be smoke-tested against the installed runtime. | No documented human-readable session name/title in hook or stream payload. No launch title setter found. | High |
| Context/access/compact/clear | Launch with known approval/trust mode, estimate context from hooks/stream/transcript, use `/compress` or `/compact` only while idle, and treat `/clear` as a session reset that requires F-Mark rebind. | Reliable context remaining/available API, live access-mode readback, and live access-mode mutation. | Stable external context-used/available API and reliable live approval-mode changes are not documented. | Medium |
| Native fork/branch | Keep F-Mark-owned handoff fork path as the v1 Gemini behavior. Treat `--worktree` as a separate filesystem isolation feature. | Gemini checkpoint flow `/resume save <name>` then `/resume resume <name>` is documented as a way to fork conversations, but hook/session-id behavior needs smoke tests. | No `/fork` or `/branch` slash command found. No native branch/session title setter found. | Medium |
| Delegated/sub-agent visibility | Gemini has native subagents through `invoke_agent` with `agent_name`. F-Mark can conservatively detect parent tool-use and final tool-result when visible. | Whether hook payloads, stream JSON, and transcripts expose live subagent progress, child tool calls, failures, and final result consistently. | No documented hook/stream field for stable subagent id, parent call id in hooks, nested tool stream, or human title. | Medium-low |
| Access request detection | Use `Notification` hook with `notification_type:"ToolPermission"` as the structured approval prompt signal, plus `BeforeTool`/`AfterTool` audit. | Exact `details` payload needs fixture capture. | Folder-trust prompt happens before project hooks load, so terminal/preflight fallback is still required. | Medium-high |

## Findings By Topic

### 1. MCP Install And Config For Gemini

Confidence: high for user/project config and transports; medium for header env expansion and exact admin interactions.

Gemini CLI supports MCP through `mcpServers` in `settings.json`, with stdio, SSE, and Streamable HTTP transports. The MCP docs describe tool discovery, execution, resources, prompts, and Gemini's MCP tool naming pattern `mcp_<server_name>_<tool_name>`. The command reference also exposes runtime `/mcp` commands for `auth`, `desc`, `enable`, `disable`, `list`, `reload`, and `schema`.

`gemini mcp add` supports:

- `--scope user|project`, with `project` as the default. The CLI source maps `user` to `~/.gemini/settings.json` and `project` to the workspace `.gemini/settings.json`.
- `--transport stdio|sse|http`, with `stdio` as the default.
- `--env/-e` for stdio server environment variables.
- `--header/-H` for HTTP/SSE headers.
- `--timeout`, `--trust`, `--description`, `--include-tools`, and `--exclude-tools`.

Configuration layers are broader than the `mcp add` command: the official configuration docs list system defaults, user settings, project settings, system override settings, environment variables, and CLI args. For F-Mark setup UX, however, the normal writable scopes are project and user. There is no `gemini mcp add --scope global`; "global" in the F-Mark UX should map to Gemini user settings, not a literal Gemini CLI scope.

Recommended project stdio config shape:

```json
{
  "mcpServers": {
    "f-mark": {
      "command": "npx",
      "args": ["-y", "f-mark", "mcp"],
      "env": {
        "F_MARK_PATH": "/home/roey/workspace/F-Mark",
        "F_MARK_MCP_VERSION": "0.x"
      },
      "timeout": 30000,
      "trust": false,
      "description": "F-Mark MCP integration 0.x"
    }
  }
}
```

HTTP/SSE config has an important docs/source mismatch. The MCP docs still list `url` for SSE and `httpUrl` for HTTP streaming, while the current `gemini mcp add --transport http` source writes `url` with `type:"http"`. Core source comments mark `httpUrl` as deprecated in favor of `url` plus `type:"http"`, although `httpUrl` is still accepted and takes precedence if both are present. F-Mark should generate the source-current shape:

```json
{
  "mcpServers": {
    "f-mark": {
      "url": "http://127.0.0.1:7345/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ..."
      },
      "trust": false,
      "description": "F-Mark MCP integration 0.x"
    }
  }
}
```

Environment variables in MCP `env` blocks are documented as expandable with `$VAR`, `${VAR}`, and Windows `%VAR%`. The broader configuration docs also describe settings-file string expansion, but the MCP docs explicitly call out `env`, not `headers`. Treat header env expansion as unverified until smoke-tested; avoid writing secret header values into project settings by default.

`trust:true` bypasses MCP tool confirmations. That is useful for user-approved trusted servers, but F-Mark should not set it automatically. Use `trust:false` or omit it.

`includeTools` and `excludeTools` are supported per server; `excludeTools` wins if a tool is in both. Global MCP filters also exist through `mcp.allowed` and `mcp.excluded`. F-Mark preflight should detect these because an apparently installed server can be excluded globally.

Trusted folders matter. If Gemini folder trust is enabled and a project is untrusted, project `.gemini/settings.json`, project `.env`, hooks, MCP servers, local skills, and custom commands are ignored or restricted. Headless runs can bypass trust for the session with `--skip-trust` or `GEMINI_CLI_TRUST_WORKSPACE=true`, but that should be a visible user choice.

Version marker feasibility is good but not through JSON comments. Use:

- MCP server `description`.
- Explicit env such as `F_MARK_MCP_VERSION`.
- Optional command arg such as `--integration-version <version>`.
- Hook `name`, `description`, or command args for hook installs.

Use `gemini mcp list` carefully. It lists configured servers, but the source performs connection/status checks and can attempt to connect to MCP servers. Preflight should prefer static settings parsing unless the user explicitly asks for a live check.

### 2. Hook And Live Stream Payloads

Confidence: high for hook base fields and events; medium for live stream details until installed-runtime smoke tests capture fixtures.

Hooks are the best Gemini integration surface for managed interactive agents. Official hooks include `SessionStart`, `SessionEnd`, `BeforeAgent`, `AfterAgent`, `BeforeModel`, `AfterModel`, `BeforeToolSelection`, `BeforeTool`, `AfterTool`, `PreCompress`, and `Notification`.

The common hook input fields from source are:

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- `timestamp`

Hook runner environment variables include at least:

- `GEMINI_PROJECT_DIR`
- `GEMINI_SESSION_ID`
- `GEMINI_CWD`
- `GEMINI_PLANS_DIR`
- `CLAUDE_PROJECT_DIR` compatibility alias

Event-specific payloads relevant to F-Mark:

- `SessionStart`: `source` is `startup`, `resume`, or `clear`.
- `SessionEnd`: `reason` is `exit`, `clear`, `logout`, `prompt_input_exit`, or `other`.
- `BeforeAgent`: `prompt`.
- `AfterAgent`: `prompt`, `prompt_response`, `stop_hook_active`.
- `BeforeTool`: `tool_name`, `tool_input`, optional `mcp_context`, optional `original_request_name`.
- `AfterTool`: `tool_name`, `tool_input`, `tool_response` with `llmContent`, `returnDisplay`, optional `error`, optional `mcp_context`, optional `original_request_name`.
- `BeforeModel`: `llm_request`.
- `AfterModel`: `llm_request`, `llm_response`; docs state this fires for every response chunk.
- `PreCompress`: `trigger` is `auto` or `manual`.
- `Notification`: `notification_type:"ToolPermission"`, `message`, and `details`.

No hook input field appears to carry a human-readable session name or session title. `cwd` is included, but project root is exposed through hook environment rather than as a JSON field. The transcript path is available when the chat recording service is active; smoke tests should confirm whether it is always non-empty in interactive managed sessions.

Gemini non-interactive stream output is separate from hooks. `--output-format stream-json` emits JSONL-style events with these source-level fields:

- `init`: `session_id`, `model`, `timestamp`.
- `message`: `role`, `content`, optional `delta`.
- `tool_use`: `tool_name`, `tool_id`, `parameters`.
- `tool_result`: `tool_id`, `status`, optional `output`, optional `error`.
- `error`: `severity`, `message`.
- `result`: `status`, optional `error`, optional `stats`.

Stream stats include total/input/output/cached token counts, duration, tool call count, and per-model stats. They do not include `transcript_path`, `cwd`, project root, human title, or subagent-specific fields.

Session identity:

- Gemini has `--session-id` in local CLI help, and `--resume` can target a session ID.
- Session docs describe saved session IDs as UUIDs.
- `--list-sessions` shows a title-like entry based on the first user prompt, timestamp, message count, and abbreviated ID.
- No launch flag or slash command was found to set a human-readable title.

F-Mark should store a F-Mark alias/display name separately and learn Gemini runtime identity from hook `session_id` or stream `init.session_id`.

### 3. Context, Access, Compact, And Clear

Confidence: medium. Commands and modes are clear, but external context readback and live mode mutation are not.

Context usage is visible inside Gemini's UI/session stats, and stream JSON result stats expose aggregate token counts. Hooks can observe `AfterModel.llm_response` and transcript files contain token usage according to the session docs. However, no stable external API or hook field was found for "context used" and "context available" as a managed-agent readback. F-Mark should model Gemini context status as estimated/unknown unless a later smoke test finds a reliable transcript or stream field.

Access and approval modes:

- CLI option `--approval-mode` supports `default`, `auto_edit`, `yolo`, and `plan`.
- `--yolo` remains as a deprecated alias for `--approval-mode=yolo`.
- `--sandbox` starts in a sandboxed environment.
- `--skip-trust` trusts the current workspace for the session and bypasses the folder trust check.
- Policy engine rules can decide `allow`, `deny`, or `ask_user` based on tool name, MCP name, subagent, arguments, approval mode, and command prefixes.
- `/plan` or approval-mode plan can be used for read-only planning behavior.

No stable external runtime API was found to read or change approval mode during a live interactive session. Gemini can change mode internally in UI flows, but F-Mark should treat access mode as launch-time configuration and require restart for reliable changes. Live change support should remain a research item.

Compact/compress:

- Official command is `/compress`: replace chat context with a summary.
- Source aliases include `/summarize` and `/compact`.
- `PreCompress` hook fires before compression with `trigger:"manual"` or `trigger:"auto"`.
- `PreCompress` is advisory/asynchronous and cannot block or modify compression.

Safe timing recommendation: only send `/compress` or `/compact` while the managed Gemini agent is idle and not showing a tool confirmation, access prompt, slash-command dialog, or active model/tool turn.

Clear:

- The command docs describe `/clear`, and source shows it fires `SessionEnd` with reason `clear`, resets Gemini chat state, generates a new session ID, fires `SessionStart` with source `clear`, and clears UI state.
- Therefore `/clear` is not just terminal visual cleanup for F-Mark planning purposes. Treat it as a destructive conversation reset and runtime-session rebind event.

Safe timing recommendation: only send `/clear` while idle, require a clear UX warning, and remap the F-Mark managed agent to the new Gemini `session_id` and transcript path after the hook events arrive.

### 4. Native Fork And Branch

Confidence: medium. Gemini documents checkpoint-based conversation forking, but not the hook/session side effects F-Mark needs.

No `/fork` or `/branch` slash command was found in docs, command reference, or local help.

Gemini does have manual chat checkpoints:

```text
/resume save decision-point
/resume list
/resume resume decision-point
```

The official session tutorial calls this "fork conversations" and says resuming a named checkpoint creates a new branch of history. This is promising but not enough for F-Mark automatic session forking yet. Smoke tests need to answer whether checkpoint resume creates a new `session_id`, a new transcript path, how hooks fire, how it interacts with pending changes, and whether it can be driven safely through a managed terminal.

Gemini also has experimental git worktrees:

- Enable with `experimental.worktrees:true`.
- Launch with `gemini --worktree <name>`.
- Docs say the name becomes both `.gemini/worktrees/<name>` and the branch name.

This is filesystem isolation, not conversation branch/fork semantics. F-Mark should keep it separate from session forking.

Recommended F-Mark behavior for now:

- Set Gemini `native_fork` to false for automatic v1 managed forking.
- Use F-Mark-owned handoff prompts and session aliases.
- Track Gemini checkpoint resume as optional future enhancement.
- Track `--worktree` as an optional launch isolation capability, not a session-fork primitive.

### 5. Delegated/Sub-Agent Visibility

Confidence: medium-low for F-Mark streaming shape. Gemini subagents exist, but exported observability is not yet proven.

Gemini CLI now has native subagents. The docs describe automatic delegation and explicit `@subagent_name` prompting. Built-ins include `codebase_investigator`, `cli_help`, `generalist`, and an experimental `browser_agent`. Source shows the model-facing tool is `invoke_agent`, with arguments including `agent_name` and a prompt/query. The tools reference lists `complete_task` as the tool used by a subagent to return a final result to the parent.

The policy engine has subagent-aware rules: a policy can match `subagent = "codebase_investigator"`, and source special-cases `invoke_agent` with `agent_name`.

Internal UI/source visibility is richer than documented hook/stream visibility:

- Source has `SubagentProgress` objects with `agentName`, `recentActivity`, `state`, `result`, and `terminateReason`.
- Local and remote subagent invocation code emits progress through `updateOutput`.
- UI code attaches subagent history to the parent `invoke_agent` tool call, deriving display name from `args.agent_name`.

What F-Mark can rely on today:

- Stream JSON can expose a parent `tool_use` with `tool_name:"invoke_agent"`, `tool_id`, and `parameters.agent_name` if the invocation appears in non-interactive stream output.
- `tool_result` can expose final success/error keyed by `tool_id`.
- Hooks should see `BeforeTool`/`AfterTool` for `invoke_agent`, including `tool_input.agent_name` and final `tool_response`, but hook payloads do not document a tool call ID.

What is not yet proven:

- Whether interactive hooks receive every nested subagent tool call or only the parent `invoke_agent`.
- Whether `AfterTool.tool_response.returnDisplay` includes structured `SubagentProgress` JSON or only display text.
- Whether transcripts preserve `SubagentProgress`, child tool call IDs, nested failures, or final result in a stable schema.
- Whether live terminal output can be parsed reliably for subagent progress without fragile TUI scraping.

Recommended F-Mark v1 posture:

- Model Gemini subagent support as present but progressive streaming as research.
- Derive a tentative F-Mark subagent key as `parent_tool_id + agent_name` when stream JSON is available.
- For hook-only interactive sessions, derive a weaker key as `session_id + sequence + agent_name` unless transcript provides a call ID.
- Show final-result-only subagent visibility until smoke tests prove nested live progress can be captured structurally.

### 6. Access Request Detection

Confidence: medium-high for tool permission detection; medium-low for trust prompt detection.

Structured tool approval detection exists through the `Notification` hook. The hook reference says `Notification` fires for system alerts such as tool permissions and includes:

- `notification_type:"ToolPermission"`
- `message`
- `details`

The hook cannot grant permissions, block alerts, or modify the decision. It is observability only. F-Mark should still use it as the primary "access requested" signal and correlate it with:

- `BeforeTool` for attempted tool name and input.
- `AfterTool` for accepted/failed result.
- Terminal pattern fallback for UI states not exposed through hooks.

Folder trust detection is different. If project trust is not yet granted, project hooks and MCP config may not load. F-Mark cannot rely on a project hook to report the trust prompt that prevents hooks from loading. Use preflight checks and terminal prompt fallback for folder trust.

## Implications For Planning Files

### `plan.md`

- Update Gemini source notes to prefer project/user `gemini mcp add` and static settings parsing.
- Add `url` plus `type:"http"` as the recommended HTTP config, with `httpUrl` as accepted/deprecated fallback.
- Add `description` and explicit env/arg version markers; do not plan JSON comments.
- Keep `trust:false` default and call out `trust:true` as user opt-in only.
- Add hook integration to the main managed-agent plan: `SessionStart`, `SessionEnd`, `BeforeTool`, `AfterTool`, `AfterModel`, `AfterAgent`, `PreCompress`, and `Notification`.
- Treat `gemini mcp list` as a live check that may connect to servers.

### `ux-flow.md`

- Map F-Mark "local" to Gemini project `.gemini/settings.json`.
- Map F-Mark "global" to Gemini user `~/.gemini/settings.json`; do not show a Gemini `global` CLI scope.
- In setup preflight, detect folder trust enabled/untrusted, project config ignored, `mcp.allowed`, `mcp.excluded`, disabled MCP server state, and possible admin policy blockers.
- Make version state visible through `description` and env/arg markers.
- Do not write secrets to project headers by default; use user scope or runtime env for secrets.

### `compass-flow.md`

- Learn Gemini runtime identity from `hook.session_id`, not from a launch title.
- Store F-Mark display name/session title separately because Gemini has no documented setter.
- If using `--session-id`, validate UUID behavior first. Otherwise let Gemini generate IDs and bind after `SessionStart`.
- Handle `/clear` as a new Gemini runtime session with `SessionEnd(clear)` then `SessionStart(clear)`.
- Use hook `transcript_path` as the best pointer to resume/debug context.

### `agent-control-and-targeting.md`

- Mark Gemini context used/available as estimated until a reliable transcript/stream readback is proven.
- Treat approval/access modes as launch-time for reliable behavior: `default`, `auto_edit`, `plan`, `yolo`.
- Represent live access-mode change as unsupported/restart-required for now.
- Use `Notification ToolPermission` as structured access request detection.
- Only inject `/compress` or `/clear` when the agent is idle.

### `session-forking.md`

- Mark Gemini native `/fork` and `/branch` as unsupported.
- Add Gemini checkpoint branch flow as research more: `/resume save <name>` and `/resume resume <name>`.
- Keep F-Mark handoff fork as v1.
- Track `--worktree` separately as experimental filesystem isolation, not session forking.

### `subagent-streaming.md`

- Mark Gemini delegated/sub-agent execution as supported through `invoke_agent`.
- Mark progressive subagent streaming as research until fixtures prove hook/stream/transcript fields.
- Add a conservative Gemini adapter mode: parent `invoke_agent` start, final `tool_result` or `AfterTool` result, and derived agent name from `agent_name`.
- Do not require stable subagent ID, parent call ID in hooks, nested tool calls, or live child output for Gemini v1.

## Concrete Recommended Plan Edits

Add or update a Gemini runtime capability block:

```yaml
gemini:
  mcp:
    scopes: ["project", "user"]
    preferred_scope: "project"
    transports: ["stdio", "http", "sse"]
    preferred_transport: "stdio"
    project_settings_path: ".gemini/settings.json"
    user_settings_path: "~/.gemini/settings.json"
    http_shape: { url: "...", type: "http" }
    version_markers: ["mcpServers.f-mark.description", "env.F_MARK_MCP_VERSION", "command arg"]
    trust_default: false
  hooks:
    supported: true
    base_fields: ["session_id", "transcript_path", "cwd", "hook_event_name", "timestamp"]
    events: ["SessionStart", "SessionEnd", "BeforeTool", "AfterTool", "AfterModel", "AfterAgent", "PreCompress", "Notification"]
  runtime_session:
    id_source: "hook.session_id"
    transcript_path_source: "hook.transcript_path"
    supports_launch_session_id: "uuid-only, smoke-test required"
    supports_title: false
  context:
    readback: "estimated"
    compact_command: "/compress"
    compact_aliases: ["/compact", "/summarize"]
    clear_command: "/clear"
    safe_timing: "idle-only"
  access:
    launch_modes: ["default", "auto_edit", "plan", "yolo"]
    live_change: "unsupported"
    structured_prompt_signal: "Notification ToolPermission"
    trust_prompt_signal: "preflight-or-terminal-fallback"
  fork:
    native_fork: false
    checkpoint_resume: "research"
    worktree_launch: "experimental-not-session-fork"
  subagents:
    native_execution: true
    invoke_tool: "invoke_agent"
    name_source: "agent_name"
    stable_id: "derive from parent tool id when available"
    progressive_streaming: "research"
    v1_visibility: "parent invocation plus final result"
```

Add preflight bullets:

- Parse project and user settings instead of relying only on `gemini mcp list`.
- Check whether folder trust is enabled and whether the current project is trusted.
- Check whether project settings are being ignored.
- Check `mcp.allowed`, `mcp.excluded`, server disabled state, and policy/admin blockers when discoverable.
- Warn if server uses deprecated `httpUrl`; accept it, but prefer rewriting to `url` plus `type:"http"` only with user consent.
- Detect F-Mark version via `description`, `F_MARK_MCP_VERSION`, or command arg.

Add hook install bullets:

- Install one F-Mark hook command with version marker and event dispatch based on `hook_event_name`.
- Subscribe at least to `SessionStart`, `SessionEnd`, `BeforeTool`, `AfterTool`, `AfterModel`, `AfterAgent`, `PreCompress`, and `Notification`.
- Treat `Notification ToolPermission` as the primary structured access prompt event.
- Treat missing hooks under project scope as possibly caused by folder trust.

Add control-flow bullets:

- Use Gemini `session_id` as runtime identity and F-Mark-owned alias/title for UX.
- Rebind runtime session after `/clear`.
- Send `/compress` only when idle.
- Restart Gemini for reliable approval-mode changes.
- Use F-Mark handoff prompts for forks until checkpoint resume behavior is proven.
- Show Gemini subagents conservatively as final-result-only until structured live progress is proven.

## Open Smoke Tests To Run Locally Later

1. In a temp project and isolated `GEMINI_CLI_HOME`, run `gemini mcp add --scope project --transport stdio -e F_MARK_PATH=/tmp/example -e F_MARK_MCP_VERSION=0.x --description "F-Mark MCP integration 0.x" f-mark npx -y f-mark mcp`; inspect `.gemini/settings.json`.
2. Run `gemini mcp add --transport http --header "Authorization: Bearer test" f-mark http://127.0.0.1:7345/mcp`; confirm whether it writes `url` plus `type:"http"`.
3. Test header env expansion with a harmless value such as `--header "X-Test: $F_MARK_TEST_TOKEN"` and verify what the transport sends.
4. With folder trust enabled, mark a temp project untrusted and confirm project MCP/hooks are ignored and `gemini mcp list` behavior.
5. Install a dump hook that writes stdin and environment to temp files; capture `SessionStart`, `AfterModel`, `AfterAgent`, `BeforeTool`, `AfterTool`, `Notification`, `PreCompress`, and `SessionEnd`.
6. Confirm whether hook `transcript_path` is always non-empty in interactive managed sessions and whether it changes after `/clear`.
7. Inspect a transcript file for message schema, tool call IDs, token usage, and subagent records.
8. Launch `gemini --session-id <uuid>` and confirm hook `session_id` matches; try a non-UUID F-Mark ID and record failure behavior.
9. Confirm no launch title/name setter exists beyond first prompt/list-session display.
10. Trigger `/compress`, `/compact`, and `/summarize` while idle and while a tool approval is pending; record hooks and UI behavior.
11. Trigger `/clear`; verify `SessionEnd(clear)`, new session ID, new transcript path, and F-Mark rebind needs.
12. Run `/resume save fmark-test` and `/resume resume fmark-test`; verify whether a new session ID/transcript/branch is created and whether this can be automated safely.
13. Force `@codebase_investigator` or another built-in subagent; capture hooks, stream JSON if possible, and transcript. Record `tool_name`, `agent_name`, parent IDs, final result, nested tool calls, and failure visibility.
14. Run a non-interactive prompt with `--output-format stream-json` that triggers a tool call; verify event sequence, `tool_id`, result stats, and whether any subagent-specific fields appear.
15. Test `--approval-mode default`, `auto_edit`, `plan`, and `yolo`, plus `/plan`, and capture whether mode changes surface in hooks, stream output, transcript, or only terminal UI.
