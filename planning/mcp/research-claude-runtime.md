# Claude Code Runtime Research For F-Mark MCP Planning

> Date: 2026-05-25  
> Local check: `claude --version` reports `2.1.128 (Claude Code)` in this workspace.  
> Scope: Claude Code runtime gaps for F-Mark managed agents using MCP, hooks, session forking, sub-agent streaming, context/access controls, and permission request capture.

## Executive Summary

| Area | Decision | Confidence | Why |
|---|---|---:|---|
| MCP stdio install | Ship now | High | Current CLI supports `claude mcp add --transport stdio --scope project|local|user`; project scope writes `.mcp.json`, local/user write `~/.claude.json`. Prefer stdio for F-Mark to avoid tokens in config. |
| MCP HTTP install | Ship now with guardrails | High | Claude supports `http` plus `--header`; MCP spec requires Streamable HTTP POST and optional GET/SSE, localhost binding, Origin validation, and auth. Do not target SSE except legacy diagnostics. |
| MCP version marker | Ship now | Medium | For stdio, add an env marker such as `F_MARK_MCP_VERSION`; for HTTP, add a non-secret header such as `X-F-Mark-MCP-Version`. Do not rely on JSON comments. Smoke-test that Claude preserves these fields in each scope. |
| Hook payload basics | Ship now | High | Hooks include `session_id`, `transcript_path`, `cwd`, `hook_event_name`, and often `permission_mode`; hook commands can use `CLAUDE_PROJECT_DIR`. |
| Human-readable session name | Ship now with side channel | Medium | Claude supports launch `--name`/`-n` and `/rename`; status-line JSON includes `session_name` when set. Hook payloads do not include `session_name`. |
| Context used/available | Research more | Medium | Status-line JSON exposes `context_window`; hooks do not. Adding a status-line collector may overwrite user config, so it needs an explicit integration design. |
| Access mode read/change | Ship partial, research live change | Medium | Launch-time `--permission-mode` and hook `permission_mode` readback are solid. Live mode changes are possible through UI/key cycling or PermissionRequest hook `updatedPermissions`, but need smoke tests before productizing. |
| Compact/clear | Ship cautious controls | High | `/compact`, `/clear`, `/context`, PreCompact/PostCompact, SessionStart source, and SessionEnd reason are documented. Send only when idle and re-send F-Mark compass after clear/compact. |
| Native branch/fork | Ship with fallback | High | Claude now documents `/branch [name]`, `/fork` alias caveat, and `--fork-session` with resume/continue. F-Mark should still fork its own session first and treat native branch as best-effort. |
| Progressive sub-agent streaming | Research more | Medium | Hooks expose `Agent` tool, SubagentStart, SubagentStop, final result, and subagent transcript path. Live partial streaming with `parent_tool_use_id` is documented for the Agent SDK, not necessarily the interactive TUI hook path. |
| Access request detection | Ship now | High | PermissionRequest hooks expose structured `tool_name`, `tool_input`, `permission_suggestions`, and can allow/deny/update permissions. Terminal pattern matching should be fallback only. |
| Hook-only native session title readback | Unsupported | High | No current hook field exposes the human session name/title. Use status-line JSON or F-Mark's own desired alias. |

## Sources

Official sources:

- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code commands reference](https://code.claude.com/docs/en/commands)
- [Claude Code sessions docs](https://code.claude.com/docs/en/sessions)
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code status line docs](https://code.claude.com/docs/en/statusline)
- [Claude Agent SDK streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output)
- [Claude Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Claude Agent SDK agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP 2025-06-18 transports spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP 2025-06-18 elicitation spec](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)

Local sources:

- `planning/mcp/plan.md`
- `planning/mcp/ux-flow.md`
- `planning/mcp/compass-flow.md`
- `planning/mcp/agent-control-and-targeting.md`
- `planning/mcp/session-forking.md`
- `planning/mcp/subagent-streaming.md`
- `planning/mcp/findings-claude.md`
- `packages/kernel/src/hooksInstall/claude.ts`
- `packages/kernel/src/hooks/autoStream.ts`
- `packages/kernel/src/hooks/transcript.ts`
- `packages/kernel/src/routes/managedAgents.ts`
- `packages/kernel/src/routes/guide.ts`
- `packages/kernel/src/runtimes/defaults.ts`
- `packages/kernel/src/tmux/manager.ts`
- Local CLI help: `claude --help`, `claude mcp --help`, `claude mcp add --help`, `claude mcp add-json --help`, `claude mcp list --help`, `claude mcp get --help`

## Findings By Topic

### 1. MCP Install And Config

Primary sources: [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture), [MCP transports spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), plus local `claude mcp * --help`.

Current Claude MCP scopes are easy to confuse with F-Mark's "Locally/Globally" UI language:

- Claude MCP `local` is private to the current project but stored in `~/.claude.json` under `projects["<absolute project path>"].mcpServers`. It is the default scope.
- Claude MCP `project` writes `<repo>/.mcp.json` and is intended to be shared with the repo. Project MCP servers require user approval before use.
- Claude MCP `user` writes `~/.claude.json` and loads across projects. Older docs and plans may call this "global", but the current CLI flag is `--scope user`.
- Precedence is `local` > `project` > `user` > plugin-provided servers > claude.ai connectors.
- Claude accepts `stdio`, `http`, and `sse` in the CLI. F-Mark should target `stdio` or `http`; SSE is legacy relative to the current MCP Streamable HTTP spec.
- JSON config accepts `type: "http"` and `type: "streamable-http"` as aliases for Streamable HTTP.

Current local CLI syntax from `2.1.128`:

```bash
claude mcp add [options] <name> <commandOrUrl> [args...]
claude mcp list
claude mcp get <name>
claude mcp remove [options] <name>
claude mcp reset-project-choices
claude mcp add-json [options] <name> <json>
```

Relevant `claude mcp add` flags:

```bash
--transport <stdio|sse|http>
--scope <local|user|project>
-e, --env KEY=value
-H, --header "Header: value"
--client-id <id>
--client-secret
--callback-port <port>
```

Recommended F-Mark install commands:

```bash
# Shared project MCP config, no token in config.
claude mcp add --transport stdio --scope project f-mark -- npx -y f-mark mcp

# Private current-project MCP config.
claude mcp add --transport stdio --scope local f-mark -- npx -y f-mark mcp

# Machine/user-wide private MCP config.
claude mcp add --transport stdio --scope user f-mark -- npx -y f-mark mcp

# HTTP, project-safe only if the token is provided by environment expansion.
claude mcp add --transport http --scope project \
  --header 'Authorization: Bearer ${F_MARK_TOKEN}' \
  f-mark http://127.0.0.1:7777/mcp
```

Version marker feasibility:

- Stdio: add `env: { "F_MARK_MCP_VERSION": "<bundled-version>" }` or use `claude mcp add -e F_MARK_MCP_VERSION=<bundled-version>`.
- HTTP: add `headers: { "X-F-Mark-MCP-Version": "<bundled-version>" }` or `--header "X-F-Mark-MCP-Version: <bundled-version>"`.
- Do not use JSON comments. `.mcp.json` and `~/.claude.json` are JSON.
- For hook install markers, prefer exec-form hooks with `args` and a flag such as `--integration-version`. The current F-Mark Claude hook uses shell-form `"npx -y f-mark hook auto-stream"`, which is harder to parse robustly.

Implication for preflight:

- Detect `.mcp.json` project scope separately from Claude `local` scope in `~/.claude.json`.
- Report shadowing when a higher-precedence local `f-mark` entry differs from the expected project entry.
- Use `claude mcp list/get` only as user-triggered diagnostics. The local CLI warns these commands skip workspace trust and spawn stdio servers from `.mcp.json` for health checks.

Confidence: high for scope/CLI syntax, medium for automatic version-marker readback until smoke-tested in all three scopes.

### 2. Hook And Live Stream Payloads

Primary sources: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), [Claude Code status line docs](https://code.claude.com/docs/en/statusline), [Agent SDK streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output), and local `packages/kernel/src/hooksInstall/claude.ts`, `packages/kernel/src/hooks/autoStream.ts`, `packages/kernel/src/hooks/transcript.ts`.

Claude hook common input fields include:

- `session_id`
- `transcript_path`
- `cwd`
- `permission_mode` on many events
- `effort` on tool-use-context events when supported
- `hook_event_name`

Hook commands also get `CLAUDE_PROJECT_DIR`, which points at the project root where Claude Code started. This is better than inferring the project from `cwd`, because `cwd` can change during the session.

Fields not present in hook payloads:

- no `session_name`
- no explicit `workspace.project_dir` object
- no context-window metrics

Status-line JSON is the structured side channel that fills those gaps. It includes:

- `session_id`
- `session_name` when set with `--name` or `/rename`
- `transcript_path`
- `cwd`
- `workspace.current_dir`
- `workspace.project_dir`
- `version`
- `cost`
- `context_window`
- `agent.name` when running with `--agent`
- `worktree.*` during `--worktree` sessions

Session name/title:

- Can be set at launch with `claude -n <name>` or `claude --name <name>`.
- Can be changed during a session with `/rename <name>`.
- Appears in the prompt bar, terminal title, `/resume` picker, and status-line JSON.
- Does not appear in hook payloads.

Live stream:

- The Agent SDK can emit `StreamEvent` messages when partial streaming is enabled. These include `session_id`, raw Claude API stream events, and `parent_tool_use_id` when the event is from a subagent.
- The current F-Mark managed flow launches the interactive TUI in tmux, not an SDK `query()` loop, so SDK partial stream events are not available unless F-Mark changes the launch model.
- For the current tmux/TUI path, use hooks plus transcript reads. Add PreToolUse/PostToolUse/PostToolBatch/SubagentStart/SubagentStop/PermissionRequest hooks instead of relying only on Stop.

Local F-Mark gap:

- `packages/kernel/src/hooksInstall/claude.ts` currently installs only a generic `Stop` hook.
- `packages/kernel/src/hooks/autoStream.ts` reads the Stop `transcript_path`, projects the last assistant turn, and maps Claude `session_id` to an F-Mark participant.
- `packages/kernel/src/hooks/transcript.ts` only parses Claude-shaped `role/content` transcript records and cannot see status-line-only fields.

Confidence: high for hook fields and launch naming, medium for status-line collector productization.

### 3. Context, Access, Compact, Clear

Primary sources: [Claude Code commands reference](https://code.claude.com/docs/en/commands), [Claude Code sessions docs](https://code.claude.com/docs/en/sessions), [Claude Code status line docs](https://code.claude.com/docs/en/statusline), [permission modes](https://code.claude.com/docs/en/permission-modes), [permissions](https://code.claude.com/docs/en/permissions), and [hooks reference](https://code.claude.com/docs/en/hooks).

Context:

- `/context [all]` shows context usage in the interactive UI.
- Status-line JSON exposes structured `context_window` data: `total_input_tokens`, `total_output_tokens`, `context_window_size`, `used_percentage`, `remaining_percentage`, and `current_usage`.
- The status-line docs note that `current_usage`, `used_percentage`, and `remaining_percentage` may be null early in a session and immediately after `/compact` until the next API response.
- Hooks do not receive `context_window`.
- Agent SDK `ResultMessage` contains final usage/cost/session ID, but that is not available from the current interactive tmux launch path.

Access and permission modes:

- Startup flag: `claude --permission-mode <default|acceptEdits|auto|dontAsk|bypassPermissions|plan>`.
- Settings default: `permissions.defaultMode`.
- Interactive CLI cycling: Shift+Tab cycles default modes; `dontAsk` is startup-only; `bypassPermissions` requires enabling at launch; `auto` depends on account/environment.
- Hook readback: `permission_mode` appears in many hook payloads.
- PermissionRequest hooks can update permissions, including `setMode`, with `destination: "session" | "localSettings" | "projectSettings" | "userSettings"`.
- `bypassPermissions` cannot be entered live unless the session was launched with bypass mode already available, and it is never persisted as `defaultMode`.

Compact/clear:

- `/compact [instructions]` summarizes history.
- `/clear [name]` starts a new conversation with empty context and keeps the previous conversation resumable. Passing a name labels the previous conversation in `/resume`.
- `/context` shows what is consuming the context window.
- PreCompact hooks can block manual or automatic compaction.
- PostCompact hooks receive `compact_summary`.
- SessionStart hooks receive `source: "startup" | "resume" | "clear" | "compact"`.
- SessionEnd hooks receive `reason`, including `clear`, `resume`, and `bypass_permissions_disabled`.

Safe timing:

- Send `/compact` and `/clear` through tmux only when the managed agent is idle and not waiting on a permission/access prompt.
- After `/compact`, wait for PostCompact or a following status-line update before trusting context metrics.
- After `/clear`, treat the runtime context as reset and send a fresh F-Mark compass/guide packet. Smoke-test whether Claude's runtime `session_id` changes on `/clear` in the installed version before using it as a stable key.

Confidence: high for commands and hooks, medium for live access-mode mutation outside a PermissionRequest flow.

### 4. Native Fork Or Branch

Primary sources: [Claude Code sessions docs](https://code.claude.com/docs/en/sessions), [Claude Code commands reference](https://code.claude.com/docs/en/commands), and local `claude --help`.

Claude now has a native conversation branch mechanism:

- `/branch [name]` creates a branch of the current conversation and switches into it.
- `/fork` is an alias for `/branch` unless `CLAUDE_CODE_FORK_SUBAGENT` is set, in which case `/fork` spawns a forked subagent instead.
- `claude --continue --fork-session` forks the most recent session instead of reusing it.
- `claude --resume <session-or-name> --fork-session` should be the command-line shape for forking a specific session; combine with `--name <new-name>` only after local smoke confirms the new branch receives that name.
- The `/branch` confirmation prints the new branch ID and original session ID.
- Permissions approved "for this session" do not carry over to the new branch.

F-Mark should not depend on this for its own session fork semantics:

- First duplicate the F-Mark session folder.
- Rebind F-Mark active-session state, MCP context, and hook routing to the new F-Mark session.
- If Claude branch support is present, send `/branch <new-fmark-session-id>` through the tmux input queue and parse/record the new Claude session ID later from hooks/status-line/transcript.
- If unsupported or ambiguous, skip native branch and send the F-Mark fork handoff prompt.

Confidence: high for `/branch` and `/fork` existence in current docs, medium for exact tmux automation and naming until smoke-tested against local `2.1.128`.

### 5. Sub-Agent And Task Visibility

Primary sources: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [Agent SDK streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output), and [Agent SDK agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop).

Claude's current docs use the `Agent` tool for subagents. Older or generic planning language that says `Task` should not assume the hook matcher is named `Task`.

Useful structured signals:

- `PreToolUse` on `Agent` includes:
  - `tool_use_id`
  - `tool_input.prompt`
  - `tool_input.description`
  - `tool_input.subagent_type`
  - `tool_input.model`
- `PostToolUse` on `Agent` can include:
  - `tool_use_id`
  - `tool_response.status`
  - `tool_response.agentId`
  - `tool_response.content`
  - `tool_response.totalTokens`
  - `tool_response.totalDurationMs`
  - `tool_response.totalToolUseCount`
  - `tool_response.usage`
- `SubagentStart` includes:
  - `agent_id`
  - `agent_type`
- `SubagentStop` includes:
  - `agent_id`
  - `agent_type`
  - `agent_transcript_path`
  - `last_assistant_message`
  - `background_tasks` and `session_crons` in Claude Code `v2.1.145+`
- Common hook fields can include `agent_id` and `agent_type` when a hook fires inside a subagent call, so PreToolUse/PostToolUse hooks may attribute nested tool calls if they run inside the subagent lifecycle.
- Agent SDK `StreamEvent` includes `parent_tool_use_id` for events from a subagent.

What F-Mark can ship now:

- Capture subagent start and final result/status using `SubagentStart`, `SubagentStop`, and `PostToolUse` on `Agent`.
- Store parent participant/runtime, parent `tool_use_id`, Claude `agent_id`, Claude `agent_type`, prompt preview, final text, and source confidence.
- Parse `agent_transcript_path` after `SubagentStop` for nested tool calls where feasible.

What needs more research:

- Progressive live subagent output in the interactive tmux/TUI path. Hooks give start/stop and transcript paths, but the docs do not promise hook-level partial output chunks.
- Whether the nested `agent_transcript_path` is flushed incrementally and can be tailed safely.
- Failure/cancel fields for Agent tool failures. `PostToolUseFailure`, `StopFailure`, and Agent `tool_response.status` need local fixtures.
- Claude "TaskCreated" and "TaskCompleted" hooks are for TaskCreate/TaskUpdate and agent-team teammate tasks. They are not the same as the `Agent` tool subagent run, but can be captured separately if F-Mark later supports teammate/task UI.

Confidence: high for final-result subagent capture, medium for nested tool attribution, low for progressive TUI streaming until smoke-tested.

### 6. Access Request Detection

Primary sources: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), [Claude Code permissions](https://code.claude.com/docs/en/permissions), [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes), and [MCP elicitation spec](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation).

Structured detection exists and should be the v1 path.

Best event:

- `PermissionRequest` fires when the user is about to see a permission dialog.
- It includes `tool_name`, `tool_input`, current `permission_mode`, and optional `permission_suggestions`.
- Hook output can allow or deny, update input, and apply `updatedPermissions`.

Supporting events:

- `Notification` with `notification_type: "permission_prompt"` gives a less-structured prompt notification.
- `PermissionDenied` fires only for auto-mode classifier denials and includes `reason`.
- `PreToolUse` can force `ask`, `allow`, `deny`, or `defer`; `defer` only works in non-interactive `-p` mode.
- `Elicitation` and `ElicitationResult` cover MCP server requests for structured user input, such as form or URL authentication flows.

Recommended F-Mark behavior:

- Install a `PermissionRequest` hook that posts an F-Mark `access-request` event with structured fields and a pending decision ID.
- For managed tmux/TUI sessions, decide whether the hook should block and poll F-Mark until the user responds, or merely mirror the prompt while Claude's native permission UI remains active. Blocking/polling is more integrated but needs timeout and recovery design.
- Use terminal pattern detection only if hooks are missing, disabled, or too old.

Confidence: high for structured detection fields, medium for UI-response routing until a hook polling smoke test exists.

## Specific Implications For Planning Files

### `plan.md`

- Update Claude MCP source notes to distinguish Claude `local`, `project`, and `user` scopes. F-Mark's UI "Globally" maps to Claude `--scope user`, not a `global` flag.
- Keep stdio as the recommended v1 MCP path. It avoids bearer tokens in config and lets the MCP process read `.f-mark/.token`.
- Add a Claude-specific MCP preflight rule for local-scope shadowing: `~/.claude.json` local `f-mark` beats `.mcp.json`.
- Add version markers to MCP config through stdio env or HTTP headers.
- Add hook capture beyond Stop: UserPromptSubmit, PreToolUse, PostToolUse, PostToolBatch, PermissionRequest, PermissionDenied, Notification permission_prompt, SubagentStart, SubagentStop, PreCompact, PostCompact, SessionStart, SessionEnd, StopFailure.
- Add optional status-line integration as a separate capability, not part of basic hook install.

### `ux-flow.md`

- Clarify setup scope labels. For Claude MCP there are three meaningful choices:
  - this project, shared: `.mcp.json` with `--scope project`;
  - this project, private: `~/.claude.json` with `--scope local`;
  - this machine/user: `~/.claude.json` with `--scope user`.
- Keep "Locally/Globally" product language only if the detail row shows the exact Claude scope and path.
- Add project MCP approval as an expected post-install state, not a failure.
- Show status rows for "MCP tools", "stream hooks", and optionally "status metrics" if status-line capture is enabled.
- "Launch anyway" should be hidden for managed agents unless MCP is installed or a deliberate fallback mode is selected.

### `compass-flow.md`

- Runtime session naming is feasible for Claude through `--name <fmark-session-id>` at launch and `/rename` after launch, but hook payloads do not expose the name.
- Runtime session identity should be learned from hook `session_id`, transcript path, and status-line JSON. Do not block launch waiting for it.
- Access requests should use PermissionRequest hooks as primary signal.
- Native fork should say Claude supports `/branch [name]` with `/fork` alias caveat. Still keep the F-Mark fork as the source of truth.

### `agent-control-and-targeting.md`

- Context status should be sourced from status-line JSON when installed; otherwise mark `unsupported` or `unknown`. Do not infer context percentage from transcript tokens.
- Access status can record last hook `permission_mode`. Starting mode can be set by launch args. Live change should remain "research more" unless implemented through a PermissionRequest hook or explicit tmux UI action.
- Compact/clear routes can send `/compact` and `/clear`, but must gate on idle state and re-send a compass packet afterward.
- ManagedAgentState should include `runtime_session.name` from status-line when available, `runtime_session.desired_name` from F-Mark, and `runtime_session.id` from hooks.

### `session-forking.md`

- Replace "verify whether `/fork`, `/branch`, another command, or none" with "Claude supports `/branch [name]`; `/fork` is an alias except when `CLAUDE_CODE_FORK_SUBAGENT` changes it."
- Add a local smoke before automation because this workspace has Claude `2.1.128` and the docs also include features from newer versions.
- Native branch command for in-place TUI: `/branch <new-fmark-session-id>`.
- CLI fork command for relaunch path: `claude --resume <source> --fork-session --name <new-fmark-session-id>` after smoke.
- If branch fails, F-Mark still proceeds with its own fork and handoff prompt.

### `subagent-streaming.md`

- Rename the Claude-specific matcher from "Task" to "Agent" where referring to Claude Code subagents.
- Add event sources:
  - `PreToolUse`/`PostToolUse` matcher `Agent`;
  - `SubagentStart`;
  - `SubagentStop`;
  - optional nested hooks using `agent_id`/`agent_type`;
  - `agent_transcript_path` parse after stop;
  - SDK `StreamEvent.parent_tool_use_id` only for non-TUI/SDK paths.
- Mark progressive subagent streaming as "research more"; final-result subagent boxes are shippable.
- Treat `TaskCreated`/`TaskCompleted` as a separate Claude team/task feature, not the base subagent runner.

## Concrete Recommended Plan Edits

Add to the Claude runtime capability table:

```ts
claude: {
  mcp: {
    scopes: ["project", "local", "user"],
    projectConfig: ".mcp.json",
    privateConfig: "~/.claude.json",
    preferredTransport: "stdio",
    supportsHttpHeaders: true,
    supportsEnv: true,
    versionMarker: "stdio env or http header",
  },
  hooks: {
    commonFields: ["session_id", "transcript_path", "cwd", "permission_mode"],
    projectRootEnv: "CLAUDE_PROJECT_DIR",
    sessionNameInHooks: false,
    sessionNameViaStatusLine: true,
    recommendedEvents: [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PostToolBatch",
      "PermissionRequest",
      "PermissionDenied",
      "Notification",
      "SubagentStart",
      "SubagentStop",
      "Stop",
      "StopFailure",
      "PreCompact",
      "PostCompact",
      "SessionEnd",
    ],
  },
  launch: {
    nameFlag: "--name",
    permissionModeFlag: "--permission-mode",
    recommendedArgs: ["--name", "<fmark-session-id>"],
  },
  context: {
    structuredSource: "statusLine.context_window",
    hookSource: null,
  },
  fork: {
    supportsNativeFork: true,
    command: "/branch <name>",
    aliasCaveat: "/fork alias changes when CLAUDE_CODE_FORK_SUBAGENT is set",
    cli: "claude --resume <source> --fork-session --name <name>",
  },
  subagents: {
    toolName: "Agent",
    finalResult: "PostToolUse(Agent) and SubagentStop",
    liveStream: "SDK partial stream only unless transcript tail smoke passes",
  },
  accessRequests: {
    primary: "PermissionRequest hook",
    fallback: "Notification(permission_prompt), then terminal pattern",
  },
}
```

Update managed Claude spawn:

- When F-Mark launches Claude, add `--name <active-fmark-session-id>` where safe.
- Optionally add `--permission-mode <configured-mode>` from managed-agent settings.
- Preserve user-configured runtime args and append F-Mark args rather than replacing them.
- Continue setting env `F_MARK_PATH`, `F_MARK_AGENT_ID`, `F_MARK_RUNTIME_ID`, and `F_MARK_SESSION_ID`.

Update Claude hook installer:

- Keep the generic Stop hook, but add a richer hook command such as `f-mark hook claude-event --integration-version <version>`.
- Prefer exec form:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "npx",
            "args": ["-y", "f-mark", "hook", "claude-event", "--integration-version", "0.5.0"]
          }
        ]
      }
    ]
  }
}
```

- Avoid forcing status-line install in the same step. Make it an optional "context metrics" integration because it may overwrite an existing user status line.

Update F-Mark event model:

- Add `access-request` events from PermissionRequest hooks with structured tool metadata and suggested decisions.
- Add subagent run/output events with source confidence.
- Add runtime context snapshots from status-line collector if installed.
- Add runtime session identity updates from hooks/status-line: `session_id`, `session_name`, `transcript_path`, `cwd`, `project_dir`, `version`.

## Open Smoke Tests To Run Later

1. MCP project stdio:
   - Run `claude mcp add --transport stdio --scope project f-mark -- npx -y f-mark mcp`.
   - Inspect `.mcp.json` shape.
   - Start Claude, approve project MCP server, run `/mcp`, verify tools/resources.
   - Run `claude mcp list` and `claude mcp get f-mark` from a trusted test repo.

2. MCP local/user stdio:
   - Add `--scope local` and `--scope user` variants in a disposable repo.
   - Inspect only the relevant `~/.claude.json` keys, redacting secrets.
   - Confirm precedence when local and project entries both define `f-mark`.

3. MCP HTTP:
   - Start a local F-Mark `/mcp` endpoint on `127.0.0.1`.
   - Add HTTP config with `Authorization: Bearer ${F_MARK_TOKEN}` and `X-F-Mark-MCP-Version`.
   - Verify header delivery, auth failures, Origin validation, and MCP session ID separation from F-Mark session IDs.

4. Hook payload fixture capture:
   - Install a disposable hook command for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolBatch, Stop, StopFailure, SessionEnd.
   - Launch `claude --name fmark-smoke --permission-mode default`.
   - Trigger Read/Bash/Edit permission flows and inspect JSON payloads.

5. Status-line capture:
   - Configure a temporary status-line script that writes stdin JSON to a file and prints a harmless short line.
   - Verify `session_name`, `workspace.project_dir`, `context_window`, `version`, and null behavior after `/compact`.
   - Verify how to preserve or chain an existing user status-line command.

6. Compact/clear:
   - Send `/compact focus on F-Mark state`.
   - Confirm PreCompact/PostCompact payloads and SessionStart source `compact`.
   - Send `/clear fmark-before-clear`.
   - Confirm SessionEnd reason `clear`, SessionStart source `clear`, whether Claude `session_id` changes, and whether F-Mark must remap runtime session identity.

7. Branch/fork:
   - In interactive Claude, run `/branch fmark-branch-smoke`.
   - Capture terminal output, hooks, status-line updates, new transcript path, and new `session_id`.
   - Try `/fork fmark-fork-smoke` with and without `CLAUDE_CODE_FORK_SUBAGENT`.
   - Try `claude --resume <id> --fork-session --name fmark-cli-branch-smoke`.

8. Subagent final-result capture:
   - Ask Claude to use a subagent with a distinctive prompt.
   - Capture PreToolUse/PostToolUse on `Agent`, SubagentStart, SubagentStop, and `agent_transcript_path`.
   - Verify `tool_use_id`, `agentId`, `agent_id`, `agent_type`, final content, usage, and nested transcript tool calls.

9. Subagent progressive capture:
   - Tail `agent_transcript_path` while a long subagent runs.
   - Compare with SDK `includePartialMessages` stream in a separate SDK smoke.
   - Decide whether TUI path can render progressive chunks or only final result.

10. Access request:
    - Install a PermissionRequest hook that writes an access-request file and waits for a decision.
    - Trigger a Bash command that requires approval.
    - Approve and deny through a simple local file or F-Mark route.
    - Verify hook timeout behavior, native permission dialog behavior, and recovery if F-Mark is offline.
