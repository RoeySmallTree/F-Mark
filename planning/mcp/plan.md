# F-Mark Kernel MCP Plan

> Date: 2026-05-25  
> Status: planning draft  
> Goal: make the F-Mark kernel available as a first-class MCP server, then make `/guide` and the agent setup UI prefer MCP tools over model-authored REST calls while preserving the existing REST API and stream hooks.

## Working Thesis

The kernel should remain the source of truth and keep its HTTP API. MCP should be an adapter layer over the same participant/session/event services, not a second event system.

The model-facing integration should become:

1. User clicks a runtime in the `+` menu.
2. F-Mark preflights MCP + stream-hook setup before launch.
3. If setup is missing or stale, the user chooses **Locally** (this project) or **Globally** (this machine) and F-Mark installs/updates automatically.
4. F-Mark launches the agent only after setup passes.
5. The first prompt injected into the agent contains the full live `/guide` output.
6. The agent uses F-Mark MCP tools for all F-Mark reads/writes.
7. The stream hook passively captures output/tool-use/turn-end as a safety layer.

This gives agents typed tools instead of asking them to synthesize curl commands, while keeping the append-only event log, renderer, and existing clients stable.

## Source Notes To Re-Verify

These are current as of 2026-05-25 and must be rechecked before implementation:

- MCP architecture: https://modelcontextprotocol.io/docs/learn/architecture
- MCP tools spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Claude Code MCP setup: https://code.claude.com/docs/en/mcp
- Codex MCP setup: https://developers.openai.com/learn/docs-mcp
- Gemini CLI MCP setup: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md

Key current findings:

- MCP servers expose tools, resources, and prompts over JSON-RPC; tools are model-invoked actions.
- Claude Code supports `claude mcp add` for HTTP and stdio, plus project/user/local scopes.
- Codex supports `codex mcp add` for user/global config; project setup requires direct `.codex/config.toml` edits after trust checks.
- Gemini CLI supports `gemini mcp add`, `.gemini/settings.json`/`~/.gemini/settings.json` `mcpServers`, stdio/http/sse transports, headers, project/user scopes, and trust controls.

Companion planning docs:

- `planning/mcp/phased-implementation-plan.md`
- `planning/mcp/ux-flow.md`
- `planning/mcp/compass-flow.md`
- `planning/mcp/agent-control-and-targeting.md`
- `planning/mcp/session-forking.md`
- `planning/mcp/subagent-streaming.md`
- `planning/mcp/findings-claude.md`
- `planning/mcp/findings-codex.md`
- `planning/mcp/findings-gemini.md`
- `planning/mcp/findings-kernel-architecture.md`

Research outcome docs integrated into this plan:

- `planning/mcp/research-mcp-kernel-architecture.md`: use `@modelcontextprotocol/sdk@1.29.0`; ship `f-mark mcp` stdio first; defer `/mcp` HTTP until a Fastify Streamable HTTP spike passes; proxy mutating stdio tools through the running kernel at first so bus/WS behavior remains centralized.
- `planning/mcp/research-fmark-ui-backend-integration.md`: session fork backend belongs in `routes/sessions.ts` plus a session fork service; sub-agent rendering should be hosted by `projectFeed.ts` and `ArbitraryGroupCard`; active-session storage is currently split and must be unified before fork/listener handoff is reliable.
- `planning/mcp/research-claude-runtime.md`: Claude supports project/local/user MCP scopes, `--name`, status-line context/session-name readback, structured `PermissionRequest`, `/branch [name]`, and final-result sub-agent capture through `Agent` hooks; progressive TUI sub-agent streaming still needs smoke tests.
- `planning/mcp/research-codex-runtime.md`: Codex global MCP install uses `codex mcp add`, project install requires direct `.codex/config.toml`; hooks expose session/turn/transcript/permission fields; native `/fork` exists but not `/branch`; context and richer sub-agent streaming require app-server or transcript work.
- `planning/mcp/research-gemini-runtime.md`: Gemini project/user MCP config is `.gemini/settings.json`/`~/.gemini/settings.json`; use `trust:false`; hooks expose `session_id`/`transcript_path`; no title setter or `/fork`; `/clear` creates a new runtime session; sub-agent v1 should be final-result-only unless fixtures prove live progress.

## Non-Goals

- Do not remove the REST API.
- Do not remove stream hooks in the first MCP release.
- Do not expose process-spawning or tmux control as MCP tools in the first pass.
- Do not make MCP setup write secrets into project files by default.
- Do not rely on undocumented runtime config formats without a research checkpoint.
- Do not put raw REST API reference material in `/guide`; keep it in `/guide-rest-variant`.

## Product Decisions

### MCP vs REST

REST remains the kernel/backend contract. MCP tools call the same service functions the REST routes call.

`/guide` is the MCP-first managed-agent guide and should not include REST endpoint reference material. Raw HTTP instructions are too distracting for agents that have tools available.

Add `/guide-rest-variant` for debugging, custom integrations, non-MCP clients, and backward-compatible manual workflows.

### MCP vs Stream Hook

MCP does not fully replace the stream hook.

MCP replaces deliberate model-authored REST calls:

- writing prose
- creating todos
- adding choices
- appending flow/html/file blocks
- reading events/todos
- linking an active session

The stream hook still passively captures:

- natural assistant text that was not posted through MCP
- external tool-use telemetry from Bash/Edit/Read/etc.
- turn-end when the model forgets to call an F-Mark tool
- user prompt capture where the runtime supports it

First release should be hybrid:

- MCP = required structured collaboration interface for managed agents.
- Hook = passive auto-stream and safety net; install automatically in the managed happy path where the runtime supports it.
- Manual REST = fallback via `/guide-rest-variant`, not the default `/guide`.

Later, we can add an MCP-only mode for runtimes where tool use is reliable enough.

## Proposed MCP Surface

### Tools

Keep tools model-shaped, not route-shaped. Inputs should default `session_id` and `participant_id` from project context whenever possible.

| Tool | Purpose | Notes |
|---|---|---|
| `fmark_register_participant` | Register or reuse an agent/user participant | Accepts kind, name, suggested id, runtime id |
| `fmark_link_participant` | Set a participant active session | Mirrors `POST /agents/:id/link` |
| `fmark_list_sessions` | List sessions | Read-only convenience |
| `fmark_create_session` | Create a session | Mutating, but low risk |
| `fmark_read_events` | Read session events | Supports since, kinds, participant filters |
| `fmark_get_inbox` | Read the agent's unread session delta | Defaults participant/session; returns new events, assigned todos, open choices, access requests |
| `fmark_read_event` | Read one event by filename/id | Avoids dumping the whole session into context |
| `fmark_mark_seen` | Advance the agent's per-session cursor | Keeps wake packets small and deterministic |
| `fmark_post_prose` | Write prose/comment/reply/revision/anchor | Most important tool |
| `fmark_end_turn` | Write turn-end | Should be called after final answer when not relying on hook |
| `fmark_post_choices` | Ask the user to choose | Agent-created choices |
| `fmark_post_todo` | Create/update/remove todos | Include `viewer` guidance |
| `fmark_get_todos` | Read canonical todo state | Prefer over raw event reconstruction |
| `fmark_post_flow` | Create diagrams/flow charts | Supports append_to |
| `fmark_post_html` | Create rich interactive/html embeds | Guard by schema and sandbox notes |
| `fmark_attach_file_event` | Register existing file event metadata | Defer multipart upload in v1 unless easy |
| `fmark_request_access` | Raise an actionable permission/trust/config request | Writes an `access-request` event when structured runtime detection is unavailable |

Avoid a model-facing `fmark_post_tool_use` in v1. Tool-use event logging is better handled by hooks or MCP middleware. Asking the model to log its own tool call can become recursive and noisy.

### Resources

Use resources for read-only state and documentation.

| Resource | Purpose |
|---|---|
| `fmark://guide` | Live guide markdown for this kernel/project |
| `fmark://best-practices` | Existing composable prose best practices |
| `fmark://participants` | Participants map |
| `fmark://sessions` | Sessions list |
| `fmark://sessions/{session_id}/events` | Current event feed |
| `fmark://sessions/{session_id}/todos` | Canonical todo state |
| `fmark://sessions/{session_id}/inbox/{participant_id}` | Agent-specific unread compass state |
| `fmark://config` | Safe project/runtime config subset; no token |

### Prompts

Prompts are reusable workflow templates. They should be short and should teach tool use, not REST calls.

| Prompt | Purpose |
|---|---|
| `fmark_join_session` | Register/link, say hello, read latest events |
| `fmark_write_composable_document` | Create header-only anchor plus appended blocks |
| `fmark_review_document` | Read doc events and write line comments |
| `fmark_work_todos` | Read todos, pick owned work, update status |
| `fmark_draw_flow` | Convert a diagram request into `fmark_post_flow` |

## Architecture Changes

### Kernel Modules

Create:

- `packages/kernel/src/mcp/server.ts`
- `packages/kernel/src/mcp/tools.ts`
- `packages/kernel/src/mcp/resources.ts`
- `packages/kernel/src/mcp/prompts.ts`
- `packages/kernel/src/mcp/context.ts`
- `packages/kernel/src/mcp/stdio.ts`
- `packages/kernel/src/mcp/http.ts`
- `packages/kernel/src/compass/packet.ts`
- `packages/kernel/src/compass/cursors.ts`
- `packages/kernel/src/compass/inbox.ts`

Likely dependency:

- `@modelcontextprotocol/sdk@1.29.0`
- `zod`

The MCP/kernel research outcome in `planning/mcp/research-mcp-kernel-architecture.md` found the stable SDK path to be `@modelcontextprotocol/sdk@1.29.0`. Avoid the v2 split alpha packages until a later explicit upgrade spike.

### Shared Event Services

Refactor route internals before wiring MCP:

- Move prose write logic out of `packages/kernel/src/routes/events.ts`.
- Move choices/choice/turn-end/tool-use write logic out of route handlers.
- Reuse existing todo/html/flow/file route write helpers where possible; create service modules where logic is currently trapped in routes.
- The REST route and MCP tool should call the same validator/serializer/writer path.

Suggested new service files:

- `packages/kernel/src/services/events.ts`
- `packages/kernel/src/services/sessions.ts`
- `packages/kernel/src/services/participants.ts`
- `packages/kernel/src/services/todos.ts`
- `packages/kernel/src/services/accessRequests.ts`
- `packages/kernel/src/services/agentState.ts`
- `packages/kernel/src/services/sessionForks.ts`
- `packages/kernel/src/services/eventPublisher.ts`

Add compass services for managed-agent context:

- per-agent session cursors,
- first-prompt compass packet,
- wake-prompt delta packet,
- bounded inbox/digest generation,
- selective event detail reads.

Keep route schemas intact; do not loosen validation to fit MCP.

### HTTP MCP Endpoint

Add a Streamable HTTP MCP endpoint to the running kernel:

- Preferred path: `POST /mcp`
- Auth: same bearer token model as other mutating/read APIs
- Local no-auth behavior: available under `--no-auth`, but do not grant process-spawning tools because those are out of scope
- Origin/cookie handling: treat `/mcp` as API, not browser UI; use bearer where possible

Research outcome and remaining spike:

- `planning/mcp/research-mcp-kernel-architecture.md` recommends shipping stdio first and deferring `/mcp` HTTP until a Fastify Streamable HTTP spike passes.
- The HTTP spike must verify `request.raw`/`reply.raw`/`reply.hijack()`, `POST`/`GET`/`DELETE`, SSE, bearer auth failures, invalid or missing `Mcp-Session-Id`, and CORS headers for `Mcp-Session-Id`, `MCP-Protocol-Version`, and `Last-Event-ID`.
- MCP protocol session ids must not be conflated with F-Mark collaboration session ids.
- `/mcp` should use bearer auth only; do not rely on query tokens or cookies.

### Stdio MCP Command

Add CLI subcommand:

```bash
f-mark mcp
```

Behavior:

- Runs an MCP stdio server.
- Resolves project root from `F_MARK_PATH`, `--path`, or cwd upward search for `.f-mark`.
- Reads `.f-mark/config.json` for the kernel port.
- Reads `.f-mark/.token` for bearer auth.
- Proxies tool calls to the running kernel REST services or directly calls local services.

Recommended first implementation: stdio server calls local service functions when launched inside the project root. If this proves hard because server state/bus is process-local, proxy to the kernel HTTP API using the token.

Rationale: stdio install avoids putting bearer tokens in MCP HTTP config files and works for local agent runtimes.

Research-backed v1 choice: `planning/mcp/research-mcp-kernel-architecture.md` recommends proxying mutating stdio tools through the running kernel HTTP API at first, because the current event bus, websocket broadcasts, stale-path handling, and active server state are process-local.

## Runtime Installation Strategy

The setup UI should be preflight-first. Clicking a runtime should not spawn immediately. It should check whether the runtime, MCP server, and stream hook are ready, and only launch once the selected setup scope has been applied.

The setup UI should become "Integration Setup" rather than "Hook Setup". It should show two independent rails:

- F-Mark MCP server: preferred model-facing interface.
- Stream hook: optional passive turn/tool capture.

It should also show:

- local/project setup status,
- global/machine setup status,
- installed integration version,
- bundled/current F-Mark integration version,
- update availability when installed config is stale,
- blocked/invalid config reasons.

UI labels:

- **Locally** = this project.
- **Globally** = this machine/user profile.

## Agent Control And Targeting

Managed agents need an explicit control plane, not just chips.

Backend must support:

- pause/resume state,
- random display names on creation,
- runtime session identity capture (`session_id`, optional name/title, transcript path),
- creation-time vendor session naming: use the active F-Mark `session_id` as the desired vendor-native session name/title wherever the runtime supports it,
- F-Mark session forking: duplicate a session folder, switch into the fork, and rebind/relaunch active managed agents into it,
- sub-agent output tracking: when an agent launches a sub-agent, capture its output as a named subentity of the invoking agent,
- right-pane status aggregation,
- rename,
- reconnect,
- compact/clear command sending,
- access status and access mode changes,
- context used/available status,
- mention-targeted wake routing,
- wake targeting matrix for messages/comments/tasks,
- paused-agent wake filtering.

Frontend must support:

- right-pane Agents tab,
- agent status rows,
- pause/resume controls,
- connected/detached/reconnect states,
- idle/running/notified/turn-ended/access-pending states,
- context meter,
- access permission selector,
- compact/clear buttons,
- session fork buttons in the session list and composer pane,
- nested sub-agent output boxes inside parent agent turns,
- add/rename/integration/terminal/interrupt/goodbye actions,
- agent mention popover and `@` trigger in composer and comments.

Detailed implementation contract: `planning/mcp/agent-control-and-targeting.md`.

## Session Forking

F-Mark should support user-driven session forks as a first-class collaboration action.

Entry points:

- session item row button in the Sessions panel,
- compact fork button in the composer pane for the active session.

Fork behavior:

- ask for a small fork name in a popup,
- duplicate `.f-mark/sessions/<source-session-id>/` to a new unique session folder,
- write fork metadata and update path/session state needed for discovery,
- switch the UI to the fork,
- move active managed agents to the fork by updating active-session state,
- rebind MCP context and stream listeners to the fork,
- relaunch/rebind active agents where needed,
- invoke the verified runtime-native `/fork`, `/branch`, or equivalent command only when that runtime's managed-pane smoke test has passed.

Detailed implementation contract: `planning/mcp/session-forking.md`.

## Sub-Agent Streaming

When a managed agent launches a sub-agent, F-Mark should preserve that nested relationship in the chat.

Behavior:

- detect sub-agent invocation from structured hook/live-stream/transcript data where available,
- capture the sub-agent name/title supplied by the runtime or parent agent,
- associate the sub-agent with the parent F-Mark participant and parent turn/tool-use,
- stream or record the sub-agent output,
- render it inside a dedicated nested box within the parent agent's live output group,
- keep final parent-agent output as the main answer.

Fallback:

- If the runtime exposes only a final sub-agent result, render a completed sub-agent box with that result.
- If the runtime does not expose reliable sub-agent attribution, keep output as ordinary parent-agent arbitrary output and mark capability as unsupported/unknown.

Detailed implementation contract: `planning/mcp/subagent-streaming.md`.

## Research-Backed Runtime Capability Snapshot

These findings are integrated from `planning/mcp/research-claude-runtime.md`, `planning/mcp/research-codex-runtime.md`, and `planning/mcp/research-gemini-runtime.md`. Treat them as the planning baseline; remaining work is smoke testing the exact managed launch/hook paths inside F-Mark.

| Area | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| MCP install | `claude mcp add` supports `local`, `project`, and `user` scopes; precedence is local > project > user. Version marker can be `F_MARK_MCP_VERSION` for stdio. | `codex mcp add` is user/global only; project install requires direct `.codex/config.toml` edits after trust. Version marker can be env/header config. | `gemini mcp add --scope project|user`; project config is `.gemini/settings.json`; global maps to user config. Keep `trust:false` by default. |
| Runtime session identity/name | Hook payload has `session_id`/`transcript_path`; status-line JSON can expose `session_name`; launch supports `--name`, so use F-Mark `session_id` as desired vendor name. | Hooks expose `session_id`, `turn_id`, `transcript_path`; no stable CLI session-name setter found. App-server can set thread name if adopted later. | Hooks expose `session_id`/`transcript_path`; no title setter found; `--session-id` accepts UUID but not a human-readable F-Mark name. |
| Context status | Prefer Claude status-line `context_window`; hooks alone are insufficient. | Hooks do not expose token usage; app-server is the reliable path, otherwise show `Unknown`. | No stable external context-used API; show estimated/unknown unless smoke tests prove a field. |
| Access status/request detection | Launch/readback via permission mode; structured `PermissionRequest` hooks can create access-request cards. Live access changes need smoke tests. | Launch/config approval and sandbox modes; structured `PermissionRequest` hooks exist. Live changes are better through app-server or smoke-tested terminal command. | Launch-time `--approval-mode`, sandbox, trust controls; `Notification` with `ToolPermission` is observable, but live grant/change is not stable. |
| Compact/clear | `/compact`, `/clear`; PreCompact/PostCompact and SessionStart/End hooks help re-send compass. Idle only. | `/compact`, `/clear`; PreCompact/PostCompact hooks. `/clear` starts a fresh thread. Idle only. | `/compress` official, `/compact` alias likely; `/clear` fires SessionEnd(clear), resets chat, and creates a new runtime session. Idle only. |
| Native fork | `/branch [name]` is the verified direction; `/fork` can be an alias in some contexts. CLI `--resume ... --fork-session --name` needs smoke. | `/fork` and `codex fork` exist; no branch/name support found in CLI. | No `/fork` or `/branch`; checkpoint `/resume save/resume` may approximate branch but needs smoke. F-Mark-owned fork is v1. |
| Sub-agent visibility | `Agent` tool plus `SubagentStart`/`SubagentStop` and final result hooks; progressive TUI streaming needs smoke. | Native agents and `SubagentStart`/`SubagentStop`; final-result capture is viable, progressive output needs app-server/transcript research. | `invoke_agent` with `agent_name` and final result are visible in stream/hooks; v1 should be final-result-only. |

### Claude Code

Integrated research outcome:

- `planning/mcp/research-claude-runtime.md` verifies local Claude `2.1.128`, MCP scopes `local`, `project`, and `user`, and precedence `local > project > user > plugins/connectors`.
- `claude mcp add` supports stdio, SSE, and HTTP transports, env vars, and HTTP headers. Prefer stdio project install for v1 to avoid bearer tokens in config.
- Version marker: use stdio env `F_MARK_MCP_VERSION`; for future HTTP use a non-secret header such as `X-F-Mark-MCP-Version`.
- Hook payloads expose `session_id`, `transcript_path`, `cwd`, and usually `permission_mode`; status-line JSON can expose `session_name`, `workspace.project_dir`, `context_window`, and version.
- Launch supports `--name`/`-n`; set the vendor-native session name to the active F-Mark `session_id` when creating a managed Claude session.
- Structured access cards should come from `PermissionRequest` hook payloads when available.
- Compact/clear: `/compact` and `/clear`, with PreCompact/PostCompact and SessionStart/SessionEnd hooks. Only send while idle, then re-send a compass reminder after clear/compact.
- Native fork: use `/branch [name]` after smoke tests; `/fork` is an alias in some contexts but not the canonical production assumption.
- Sub-agents: Claude uses the `Agent` tool. Hooks expose `PreToolUse(Agent)`, `PostToolUse(Agent)`, `SubagentStart`, and `SubagentStop`, enough for final-result nested boxes in v1. Progressive TUI sub-agent streaming remains a smoke-test item.

Remaining smoke checks:

- Verify project-scoped `.mcp.json` approval behavior in a fresh repo.
- Verify status-line collection can be installed without overwriting user status-line config.
- Verify `claude --resume <source> --fork-session --name <new-name>` behavior before using it for session forks.
- Verify progressive child output availability from Claude TUI/hook/transcript paths.

Preferred install options to validate:

```bash
claude mcp add --transport stdio --scope project f-mark -- npx -y f-mark mcp
```

Alternative HTTP install:

```bash
claude mcp add --transport http --scope project f-mark http://localhost:7777/mcp \
  --header "Authorization: Bearer <token>"
```

Auto-apply approach:

- Project stdio install can write `.mcp.json` if the format is stable and approval behavior is acceptable.
- Avoid writing bearer tokens to project files.
- Existing Claude hook auto-apply should be folded into the same setup sheet so **Install locally/globally and launch** can install both MCP and hook before spawn.

Status detection:

- Check `.mcp.json` in project root.
- Check `~/.claude.json` for project/user/local entries.
- Optionally run `claude mcp list` only as manual smoke, not from the kernel in normal UI.
- Verify exactly which Claude hook/MCP fields expose runtime session id, transcript path, and any human-readable session name/title.

### Codex

Integrated research outcome:

- `planning/mcp/research-codex-runtime.md` verifies local Codex `0.133.0` and `codex mcp add/list/get/remove/login/logout`.
- `codex mcp add` writes user/global config; project-local install requires direct `.codex/config.toml` edits after trust. Config layers are user `$CODEX_HOME/config.toml`, project `.codex/config.toml`, and system `/etc/codex/config.toml`.
- Stdio config supports `command`, `args`, `env`, `env_vars`, `cwd`, and timeouts. HTTP config supports `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`, timeouts, `enabled`, `required`, and tool allow/deny/approval settings.
- CLI add supports `--env`, `--url`, and `--bearer-token-env-var`, but not arbitrary HTTP header flags; the local/global auto-apply path needs a TOML writer.
- Hooks expose `session_id`, `transcript_path`, `cwd`, `model`, `permission_mode`, `turn_id`, and tool-use fields. Human-readable session/thread names are not available through hooks.
- Creation-time vendor session naming cannot be done through the current CLI; store F-Mark `session_id` as `runtime_session.desired_name`, and only set native thread name later if an app-server integration is adopted.
- Context usage is not reliable through hooks. Show `Unknown` unless app-server or transcript fixtures prove a stable field.
- Access cards should come from structured `PermissionRequest` hooks; launch access modes come from approval/sandbox config.
- Compact/clear: `/compact` and `/clear`; `/clear` starts a fresh thread. Send only while idle and re-send compass afterward.
- Native fork: `/fork` and `codex fork [SESSION_ID] [PROMPT]` exist; no `/branch` or CLI name flag found. Treat native fork as best-effort after smoke tests; F-Mark folder fork is source of truth.
- Sub-agents: Codex supports configured agents and `SubagentStart`/`SubagentStop` hooks. Final-result nested boxes are v1; progressive/nested tool visibility needs app-server or transcript fixtures.

Remaining smoke checks:

- Verify project `.codex/config.toml` merge/write behavior with trusted and untrusted folders.
- Verify whether app-server can be used narrowly for context, naming, approvals, and progressive sub-agent data without replacing the tmux model.
- Verify `codex fork` behavior from an active managed pane before enabling native fork commands.

Preferred install options to validate:

```bash
codex mcp add f-mark --url http://localhost:7777/mcp
```

This only works if bearer auth can be supplied securely. If not, prefer stdio config.

Stdio config candidate to validate:

```toml
[mcp_servers.f-mark]
command = "npx"
args = ["-y", "f-mark", "mcp"]
env = { "F_MARK_PATH" = "/absolute/project/root" }
```

HTTP config candidate to validate:

```toml
[mcp_servers.f-mark]
url = "http://localhost:7777/mcp"
```

Auto-apply approach:

- Implement auto-apply after the direct TOML schema is verified.
- Preserve existing TOML and avoid ad hoc string edits where possible. If no TOML parser is added, append a clearly delimited block only after duplicate detection.
- Manual snippets are advanced fallback only, not the primary managed-agent path.
- Do not write bearer tokens unless the token is user-scoped and stored in a user config file, never project config.

Status detection:

- Parse `~/.codex/config.toml` and possibly `.codex/config.toml`.
- Detect both stdio and HTTP variants.
- Treat unknown/unsupported schema as "instructions needed" rather than failing spawn.

### Gemini CLI

Integrated research outcome:

- `planning/mcp/research-gemini-runtime.md` verifies local Gemini `0.43.0` and upstream source `630ecc2`.
- `gemini mcp add` supports `--scope user|project`; project is the default. There is no `global` scope, so F-Mark "Globally" maps to Gemini user config at `~/.gemini/settings.json`.
- Project config is `.gemini/settings.json`; current source shape for HTTP is `url` plus `type: "http"`, while older docs mention deprecated `httpUrl`.
- Stdio/SSE/HTTP are available. Config supports env, headers, timeout, description, include/exclude tools, and `trust`.
- Keep `trust:false` by default; folder trust can cause project MCP/hooks/settings to be ignored, so preflight must detect and explain trust blockers.
- Version marker can live in `description`, stdio env `F_MARK_MCP_VERSION`, or command args. Do not rely on JSON comments.
- Hooks expose `session_id`, `transcript_path`, `cwd`, `timestamp`, and env such as `GEMINI_SESSION_ID`; no human-readable session title/name setter exists.
- Creation-time native naming is not supported; use F-Mark `session_id` as `runtime_session.desired_name` only.
- Context usage is not exposed through a stable external API; show estimated/unknown unless smoke tests prove a field.
- Access observability can use `Notification` hooks with `notification_type: "ToolPermission"`, but live approve/change is not stable. Treat access modes as launch-time/restart-required.
- Compact/clear: `/compress` is official, `/summarize` and `/compact` are aliases; `/clear` fires `SessionEnd(clear)`, resets chat, and creates a new runtime session id. Rebind runtime session identity after clear.
- Native fork: no `/fork` or `/branch`; checkpoint `/resume save <name>` and `/resume resume <name>` may approximate branch but needs smoke. F-Mark-owned fork is v1.
- Sub-agents: Gemini uses `invoke_agent` with `agent_name`; final result capture is viable. Progressive sub-agent output is not proven and should remain unsupported until fixtures prove it.

Remaining smoke checks:

- Verify Gemini schema sanitization against the final F-Mark tool schemas.
- Verify folder trust preflight behavior and the safest user-facing remediation.
- Verify whether checkpoint resume can be used for optional native branch handoff.
- Verify whether stream JSON or transcripts expose progressive sub-agent progress beyond final `invoke_agent` result.

Preferred install options to validate:

```bash
gemini mcp add --transport stdio --scope project f-mark npx -y f-mark mcp
```

Alternative HTTP install:

```bash
gemini mcp add --transport http --scope project \
  --header "Authorization: Bearer <token>" \
  f-mark http://localhost:7777/mcp
```

Settings candidate to validate:

```json
{
  "mcpServers": {
    "f-mark": {
      "command": "npx",
      "args": ["-y", "f-mark", "mcp"],
      "env": {
        "F_MARK_PATH": "/absolute/project/root"
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Auto-apply approach:

- Project-scoped stdio is the safest first target.
- Preserve existing `.gemini/settings.json`.
- Do not set `trust: true` automatically.
- Manual snippets are advanced fallback only; managed launch should offer automatic local/global apply when the JSON config is valid.

Status detection:

- Parse `.gemini/settings.json` and `~/.gemini/settings.json`.
- Detect `mcpServers.f-mark` by command/url.
- Manual smoke should run `/mcp` or `gemini mcp list`.

## Backend Routes For Setup UI

Add an integration preflight/apply layer in front of spawn. This is the managed-agent happy path:

```text
POST /managed-agents/preflight
POST /managed-agents/integration-apply
POST /managed-agents/spawn
```

`preflight` checks runtime availability, MCP setup, hook setup, versions, and whether local/global install actions are available.

`integration-apply` applies the user's chosen **Locally** or **Globally** setup plan before launch.

Keep lower-level MCP install routes available for settings screens and diagnostics:

```text
GET  /managed-agents/mcp-install-status?runtime_id=...&participant_id=...
POST /managed-agents/mcp-install-instructions?runtime_id=...&participant_id=...
POST /managed-agents/mcp-install-apply?runtime_id=...&participant_id=...
```

Shared response shape should include versioning, scope, and stale detection:

```ts
interface McpInstallStatus {
  installed: boolean;
  configPath: string;
  transport: "stdio" | "http" | "unknown";
  scope: "local" | "global" | "system" | "unknown";
  status: "ok" | "missing" | "stale" | "unsupported" | "unknown" | "blocked";
  installed_version?: string;
  bundled_version: string;
  update_available: boolean;
  detectedEntries: Array<{ name: string; transport: string; summary: string }>;
  expectedEntries: Array<{ name: string; transport: string; summary: string }>;
  locations?: Array<{
    scope: "local" | "global" | "system";
    configPath: string;
    exists: boolean;
    installed: boolean;
    installed_version?: string;
    update_available: boolean;
    error?: string;
  }>;
}
```

Add equivalent versioned status for stream hooks. Installation should write a recognizable integration marker where possible, for example:

- MCP stdio env: `F_MARK_MCP_VERSION=<bundled-version>`
- hook command flag: `--integration-version <bundled-version>`
- JSON/TOML metadata/comment where the format supports safe preservation

If the installed version is lower than the bundled version, the UI should show **Update locally and launch** or **Update globally and launch**.

Suggested modules:

- `packages/kernel/src/mcpInstall/types.ts`
- `packages/kernel/src/mcpInstall/claude.ts`
- `packages/kernel/src/mcpInstall/codex.ts`
- `packages/kernel/src/mcpInstall/gemini.ts`
- `packages/kernel/src/mcpInstall/index.ts`
- `packages/kernel/src/routes/mcpInstall.ts`

## Managed Spawn Changes

Update the managed flow so spawn happens after setup:

- `POST /managed-agents/preflight` runs before spawn.
- If MCP/hook setup is missing or stale, the renderer opens setup.
- User applies local/global setup.
- Kernel verifies status.
- Only then does the renderer call `POST /managed-agents/spawn`.

Update `POST /managed-agents/spawn`:

- Re-check MCP/hook status quickly to avoid launching against stale state.
- Return `mcp_status: "installed" | "updated" | "missing" | "unknown"`.
- Preserve `hooks_status`.
- Build the full `/guide` output server-side.
- Build a compact compass packet for the agent's current session.
- Inject the full guide plus compass packet as the first prompt into the agent's tmux pane.
- The injected guide should explicitly say to use F-Mark MCP tools and not raw REST.
- If MCP is missing because the user chose "launch anyway", the prompt should report setup failure and ask the agent to wait rather than invent REST calls.

Wake prompts should also use the compass packet:

- include participant id/session id,
- include the agent's previous cursor,
- summarize new events since that cursor,
- include open choices, assigned todos, and access requests,
- tell the agent which MCP tool to call for details.

Possible response:

```ts
interface SpawnResponse {
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  active_session: string | null;
  hooks_status: "installed" | "updated" | "missing" | "not_required" | "unknown";
  mcp_status: "installed" | "updated" | "missing" | "unknown";
}
```

## Renderer Changes

Rename or generalize:

- `HookInstallModal` -> `IntegrationSetupModal`
- `HookStatusPanel` -> keep as one panel inside setup modal
- add `McpStatusPanel`

Client additions:

- `mcpInstallStatus`
- `mcpInstallInstructions`
- `mcpInstallApply`

UI behavior:

- Clicking a runtime runs preflight instead of spawning immediately.
- If preflight is all green, launch immediately.
- If MCP/hook setup is missing or stale, open setup before launch.
- Setup shows **Locally** and **Globally** options with exact config paths.
- Setup shows installed version, bundled version, and update availability.
- Primary actions combine setup and launch:
  - **Install locally and launch**
  - **Install globally and launch**
  - **Update locally and launch**
  - **Update globally and launch**
- Advanced fallback can expose copyable commands/snippets.
- If runtime is Gemini, replace "manual-stream mode" language with "MCP preferred; stream hook optional/not available depending on runtime support".
- Agent action menu should offer "Integration setup" instead of only "Install hooks".

Settings:

- Rename "Hooks" settings tab to "Integrations" or add an "MCP" tab.
- Show status per runtime for both MCP and stream hooks.
- Show stale integration version warnings.
- Keep runtime registry separate.

## `/guide` Changes

Rewrite `/guide` as a pure MCP managed-agent guide:

- No raw HTTP endpoint reference.
- No curl examples.
- No "fetch this page" bootstrap language for managed agents; the kernel injects the guide into the first prompt.
- State that the `f-mark` MCP server is already expected to be installed.
- List the main F-Mark MCP tools.
- Tell the model to use MCP tools for all F-Mark reads/writes.
- Tell the model not to call raw REST unless the user explicitly asks for low-level debugging.
- Include participant id/session id when known.
- Include session-specific first action expressed as `fmark_post_prose` plus `fmark_end_turn`.
- Explain what stream hooks capture automatically.
- Keep composable-prose guidance.

Add `/guide-rest-variant`:

- Contains the old REST-first protocol reference.
- Intended for custom clients, debugging, and non-MCP runtimes.
- Should be linked from docs/settings, not emphasized in `/guide`.

Runtime-specific install snippets belong in the setup UI and `/guide-rest-variant` troubleshooting sections, not in `/guide`. `/guide` should focus on how the already-launched agent should behave with the MCP tools.

## Implementation Phases

### Phase 0: Research Spike

- [x] Create research outcome docs for MCP/kernel, local UI/backend integration, Claude, Codex, and Gemini.
- [x] Select SDK direction: `@modelcontextprotocol/sdk@1.29.0` plus `zod`.
- [x] Decide v1 transport direction: stdio first; HTTP only after a Fastify Streamable HTTP spike.
- [x] Identify active-session storage split as a blocking prerequisite for fork/listener/MCP context reliability.
- [ ] Build a tiny throwaway MCP server with the selected SDK and keep stdout protocol-clean.
- [ ] Confirm stdio works with at least one runtime through the managed setup flow.
- [ ] Fastify Streamable HTTP spike for `/mcp`: raw request/reply compatibility, SSE, auth failures, invalid/missing `Mcp-Session-Id`, CORS headers, and transport lifecycle.
- [ ] Claude smoke: project `.mcp.json`, status-line context, `PermissionRequest`, `/branch`, and `Agent` sub-agent fixtures.
- [ ] Codex smoke: project `.codex/config.toml`, trusted/untrusted folders, `PermissionRequest`, `/fork`/`codex fork`, app-server feasibility, and sub-agent fixtures.
- [ ] Gemini smoke: `.gemini/settings.json`, folder trust, schema sanitization, `ToolPermission` notification, `/compress`/`/clear`, checkpoint resume, and `invoke_agent` fixtures.

Exit: append smoke-test results to the relevant `planning/mcp/research-*.md` docs, or add `planning/mcp/research-smoke-tests.md` if the results cut across runtimes.

### Phase 1: Service Extraction

- [ ] Extract event write/read helpers from route handlers.
- [ ] Add tests proving REST behavior is unchanged.
- [ ] Extract participant/session helper functions needed by MCP tools.
- [ ] Extract event publisher/bus helpers so REST and MCP mutations publish identical websocket updates.
- [ ] Extract todo helpers used by REST routes and future MCP tools.
- [ ] Extract session fork helper boundary, even if fork route ships in Phase 3.7.
- [ ] Add a canonical `AgentStateStore`/active-session resolver and migrate callers that currently read or write divergent `.f-mark/agents` paths.
- [ ] Keep all existing route tests green.

Exit: no MCP behavior yet; pure refactor with identical REST output.

### Phase 2: Stdio MCP Server

- [ ] Add `@modelcontextprotocol/sdk@1.29.0` and `zod`.
- [ ] Implement `f-mark mcp` stdio command.
- [ ] Ensure stdout is reserved for MCP JSON-RPC and diagnostics go to stderr.
- [ ] Resolve project context from `F_MARK_PATH`, `--path`, or cwd upward search.
- [ ] Resolve participant/session defaults through the canonical managed-agent active-session resolver.
- [ ] Register minimal tools: `fmark_read_events`, `fmark_post_prose`, `fmark_end_turn`.
- [ ] Register `fmark://guide` resource.
- [ ] Proxy mutating stdio tools through the running kernel HTTP API for v1 so bus/WS/stale-path behavior remains centralized.
- [ ] Add MCP unit tests using SDK client or JSON-RPC harness.
- [ ] Manual smoke one runtime with stdio install.

Exit: one agent runtime can call F-Mark tools without REST instructions.

### Phase 3: Full MCP Tool Set

- [ ] Add participants/session tools.
- [ ] Add inbox/delta tools: `fmark_get_inbox`, `fmark_read_event`, `fmark_mark_seen`.
- [ ] Add todos tools.
- [ ] Add choices tools.
- [ ] Add flow/html tools.
- [ ] Add access request tool: `fmark_request_access`.
- [ ] Add resources for participants/sessions/todos/events.
- [ ] Add prompts for join-session and composable-document workflows.
- [ ] Add schema compatibility tests for Gemini's documented schema sanitization constraints.

Exit: MCP covers the same common collaboration surface as `/guide` currently teaches.

### Phase 3.5: Compass Delta And Catch-Up

- [ ] Add per-agent per-session cursor storage.
- [ ] Add first-prompt compass packet builder.
- [ ] Add wake-prompt compass packet builder.
- [ ] Add bounded session digest for existing-session catch-up.
- [ ] Add selective event detail reads by event id/filename.
- [ ] Add tests proving catch-up does not dump the full session log into prompt context.

Exit: managed agents know what changed without blindly querying or receiving every event file as context.

### Phase 3.6: Agent State Backend

- [ ] Add canonical `AgentStateStore` and active-session resolver shared by participants, link route, managed status, hooks, fork handoff, MCP context, and wake routing.
- [ ] Migrate or bridge existing split storage:
  - participant reads under `agents` in project fmark dir,
  - legacy `.f-mark/agents` writes from `/agents/:id/link`,
  - managed-agent runtime state from current `agentsDirFor(...)`,
  - hook auto-stream active-session lookups.
- [ ] Add managed-agent state file with paused/display/activity/connection/context/access fields.
- [ ] Add random display-name picker and collision handling.
- [ ] Add `GET /managed-agents/status`.
- [ ] Add `POST /managed-agents/:id/pause`.
- [ ] Add `POST /managed-agents/:id/resume`.
- [ ] Add rename route.
- [ ] Add reconnect route.
- [ ] Add compact/clear routes.
- [ ] Add context status route.
- [ ] Add access read/change routes.
- [ ] Add wake route with paused-agent filtering and mention-target handling.
- [ ] Implement wake matrix: regular no-mention message wakes all active unpaused session agents.
- [ ] Implement wake matrix: regular mentioned message wakes only tagged active unpaused agents.
- [ ] Implement wake matrix: comments wake tagged agents plus commented-content author agent.
- [ ] Implement wake matrix: todo/task creation/edit wakes assigned agents for dirty items.
- [ ] If a tagged target is paused, surface resume offer instead of waking.
- [ ] Add mention metadata to prose/comment schemas.
- [ ] Add `managed-agent.updated` WS broadcasts for agent-state changes.

Exit: backend can drive a complete Agents right-pane and reliable wake targeting.

### Phase 3.7: Session Forking Backend

- [ ] Depend on Phase 3.6 active-session store unification before enabling fork handoff.
- [ ] Add session fork service.
- [ ] Add `POST /sessions/:id/fork`.
- [ ] Duplicate source session folder into a new unique session folder.
- [ ] Write `.fork.json` metadata in the forked session.
- [ ] Register the fork through current folder-based discovery plus path registry/MRU/active path state.
- [ ] Resolve active managed agents linked to the source session.
- [ ] Skip paused, detached, and offline agents by default.
- [ ] Update active-session pointers and managed-agent state to the fork.
- [ ] Set `runtime_session.desired_name` to the fork session id.
- [ ] Rebind MCP context and stream listener targets to the fork.
- [ ] Add runtime fork capability table using research outcomes:
  - Claude: `/branch [name]` after smoke; CLI resume/fork/name path optional after smoke.
  - Codex: `/fork` or `codex fork` best-effort after smoke; no CLI name flag found.
  - Gemini: no native `/fork` or `/branch`; F-Mark handoff prompt is v1.
- [ ] Send verified runtime-native fork/branch command through tmux input queue when supported.
- [ ] Relaunch/rebind active agents according to runtime capability.
- [ ] Send compact fork handoff prompt.
- [ ] Publish `session.forked` and `managed-agent.updated` WS state updates for sessions and agents.

Exit: backend can fork a session, switch active agent context to the fork, and keep the source immutable.

### Phase 4: HTTP MCP Endpoint

- [ ] Implement `/mcp` Streamable HTTP endpoint if SDK/Fastify integration is viable.
- [ ] Use existing bearer auth.
- [ ] Add tests for auth success/failure.
- [ ] Confirm no process-spawning tools are exposed.
- [ ] Manual smoke with at least one runtime over HTTP.

Exit: remote/local HTTP MCP works, or the plan records stdio-only rationale.

### Phase 5: MCP Install Detection And Instructions

- [ ] Add `mcpInstall` modules for Claude/Codex/Gemini.
- [ ] Add status/instructions/apply routes.
- [ ] Add version markers for MCP config and hook config.
- [ ] Implement Claude detection for `.mcp.json` and `~/.claude.json`.
- [ ] Implement Codex detection for verified TOML locations/schema.
- [ ] Implement Gemini detection for `.gemini/settings.json` and `~/.gemini/settings.json`.
- [ ] Add tests for missing, installed, stale version, invalid config, blocked config, duplicate detection.
- [ ] Add manual snippets for both stdio and HTTP where supported.

Exit: setup UI can know whether MCP/hook integration is missing, installed, stale, blocked, or updateable before launching.

### Phase 6: Integration Setup UI

- [ ] Generalize Hook Install modal into Integration Setup.
- [ ] Add MCP status panel.
- [ ] Add MCP install instructions and copy actions.
- [ ] Add local/global scope selector.
- [ ] Add version indicators and update actions.
- [ ] Add auto-apply only for runtimes/scopes verified safe.
- [ ] Update `+` runtime click flow to run preflight before spawn.
- [ ] Add **Install locally/globally and launch** actions.
- [ ] Add **Update locally/globally and launch** actions.
- [ ] Update agent action menu text.
- [ ] Update settings tab.

Exit: user can click a runtime, resolve setup in one sheet, and launch only after MCP/hook setup is valid.

### Phase 6.5: Agents Right Pane And Mentions

- [ ] Add `agents` to `RightTabKey`.
- [ ] Add right-panel Agents tab.
- [ ] Build `RightAgents`.
- [ ] Build `AgentStatusRow`.
- [ ] Add pause/resume handlers.
- [ ] Add rename handler.
- [ ] Add reconnect handler.
- [ ] Add compact/clear handlers.
- [ ] Add access selector handler.
- [ ] Add context meter.
- [ ] Add Add agent action wired to runtime preflight.
- [ ] Add integration setup action.
- [ ] Add terminal/interrupt/goodbye actions.
- [ ] Add Agent button below main composer.
- [ ] Add `@` trigger in main composer.
- [ ] Add Agent button below comment composer.
- [ ] Add `@` trigger in comment composer.
- [ ] Send mention metadata on prose/comment events.
- [ ] Route mention wakes to active unpaused mentioned agents.
- [ ] Show paused/detached agents in mention picker as disabled with clear reasons.
- [ ] Offer resume when user selects/types a paused agent.
- [ ] Disable compact/clear controls while agent is running/notified/access-pending.

Exit: users can inspect, control, and target agents from the right pane and composer/comment mention flows.

### Phase 6.6: Session Forking UI

- [ ] Add session row fork icon button.
- [ ] Ensure session row fork button does not select the source row.
- [ ] Add composer fork icon button for the active session.
- [ ] Build shared fork-name popup.
- [ ] Default fork name from source session slug.
- [ ] Add busy/disabled states for fork in progress.
- [ ] Call `POST /sessions/:id/fork`.
- [ ] Refresh session list and switch to fork on success.
- [ ] Preserve composer draft after successful fork.
- [ ] Refresh participants and managed-agent status after fork.
- [ ] Show agent handoff warnings for skipped/failed agents.

Exit: users can fork from a session row or the composer, land in the fork, and see active agents attached to it.

### Phase 7: Guide And Skill Updates

- [ ] Update `/guide` to be MCP-only.
- [ ] Add `/guide-rest-variant` for the REST/API reference.
- [ ] Update runtime skill bundles.
- [ ] Update `.f-mark/AGENT.md` template.
- [ ] Remove raw API/curl examples from `/guide`.
- [ ] Add tests that `/guide` excludes REST endpoint reference material.
- [ ] Add tests that `/guide-rest-variant` contains the REST protocol reference.
- [ ] Add route tests for MCP guidance per runtime.

Exit: newly spawned agents receive clean MCP-only guidance, while REST documentation remains available separately.

### Phase 8: Hybrid Hook/MCP Behavior

- [ ] Keep hooks working exactly as before.
- [ ] Ensure MCP-posted deliberate events are not duplicated by auto-stream where avoidable.
- [ ] Decide whether MCP tools should add a source marker in event frontmatter/payload.
- [ ] Make presence state distinguish "MCP connected" from "hook recently fired" if useful.
- [ ] Update chip states so missing hook is not shown as broken when MCP is installed.
- [ ] Inject the full `/guide` output as the first managed-agent prompt.
- [ ] Wake agents with MCP-oriented prompts.
- [ ] Add access-request/access-response event kinds.
- [ ] Add UI cards for access requests with reliable approve/deny handling.
- [ ] Route access responses back to the live tmux/runtime prompt when possible.
- [ ] Dedupe hook/MCP turn-end and final-prose events.

Exit: MCP and hooks cooperate without confusing duplicate cards.

### Phase 8.5: Sub-Agent Streaming

- [ ] Add runtime capability flags for sub-agent visibility.
- [ ] Add sub-agent stream parser abstraction.
- [ ] Add explicit event kinds `subagent-run` and `subagent-output`.
- [ ] Capture parent participant id, parent runtime id, parent turn/tool-use id, sub-agent name, sub-agent id, source, source confidence, correlation id, sequence, and status when available.
- [ ] Store sub-agent output in the session feed under the parent participant with sub-agent identity in structured payloads.
- [ ] Add Claude adapter for `Agent` tool hooks, `SubagentStart`, `SubagentStop`, and final-result boxes.
- [ ] Add Codex adapter for `SubagentStart`/`SubagentStop` and final-result boxes; keep progressive/app-server path behind capability flag.
- [ ] Add Gemini adapter for `invoke_agent`/`agent_name` final-result boxes; mark progressive output unsupported until fixtures prove it.
- [ ] Support final-result-only sub-agent capture.
- [ ] Support progressive sub-agent output capture where runtime data allows it.
- [ ] Attribute nested tool calls to the sub-agent when reliable.
- [ ] Add `SubagentBox` renderer component nested inside parent agent live output.
- [ ] Collapse completed sub-agent boxes after parent turn end.
- [ ] Keep failed/cancelled sub-agent boxes visible.
- [ ] Mark unsupported/unknown capability without fabricating sub-agent structure.

Exit: sub-agent work appears in chat as a named subentity of the invoking agent whenever the runtime exposes enough data.

### Phase 9: End-To-End Verification

- [ ] Kernel tests pass.
- [ ] Renderer tests pass.
- [ ] Build passes.
- [ ] Manual smoke Claude: install MCP, spawn agent, post prose via MCP, optional hook capture.
- [ ] Manual smoke Codex: same.
- [ ] Manual smoke Gemini: same.
- [ ] Verify `/guide` with `runtime_id=claude|codex|gemini`.
- [ ] Verify `/guide` has no REST endpoint/curl guidance.
- [ ] Verify `/guide-rest-variant` preserves REST guidance.
- [ ] Verify preflight blocks/sequences launch until setup is applied.
- [ ] Verify stale installed versions suggest update.
- [ ] Verify no bearer token is written into project files by default.
- [ ] Verify setup modal handles invalid config files without crashing.
- [ ] Verify first prompt includes `/guide` plus compass packet.
- [ ] Verify wake prompt includes a bounded delta, not the full session.
- [ ] Verify access request cards can be approved/denied reliably.

Exit: MCP is shippable as the preferred collaboration integration.

## Test Plan

Kernel:

- MCP tool schemas snapshot.
- MCP tools call service functions and write expected event files.
- MCP resources return safe data and never expose `.f-mark/.token`.
- MCP prompts include expected workflow language.
- Inbox/delta tools default session and participant for managed agents.
- Per-agent cursors advance only when expected.
- `fmark_get_inbox` marks returned items as seen automatically.
- `/mcp` auth tests.
- `/mcp` Streamable HTTP tests for invalid/missing `Mcp-Session-Id`, GET/SSE, DELETE, bearer failures, and required CORS headers if HTTP ships.
- `f-mark mcp` stdio smoke harness.
- Install detection tests per runtime.
- Claude install detection tests for project/local/user precedence and stale `F_MARK_MCP_VERSION`.
- Codex config parser/writer tests for user config, project `.codex/config.toml`, env, HTTP headers, allow/deny tools, and invalid TOML.
- Gemini config parser/writer tests for project/user settings, `trust:false`, HTTP `url` + `type`, and invalid JSON.
- Setup route tests.
- Access request/response event tests.
- Wake packet tests with existing sessions and large histories.
- Canonical active-session resolver tests covering participants, link route, managed state, hooks, fork handoff, and MCP context.
- Pause/resume route tests.
- Paused agents are excluded from wake targets.
- Mention-targeted wake tests.
- Comment wake tests for tagged agents and commented-content author.
- Todo/task dirty-assignee wake tests.
- Random display name persistence tests.
- Agent status aggregation tests.
- Compact/clear route capability tests.
- Access/context status fallback tests for unsupported vendors.
- Session fork route copies source folder and leaves source immutable.
- Session fork writes metadata and appears in session list.
- Session fork publishes `session.forked` and refreshes path registry/MRU/active path state.
- Session fork updates active managed-agent session pointers.
- Session fork makes MCP context default to the fork after handoff.
- Session fork makes hook/listener output land in the fork after handoff.
- Session fork skips paused/detached agents by default.
- Sub-agent parser captures final-result-only output when runtime fixtures expose it.
- Sub-agent parser captures progressive output when runtime fixtures expose it.
- Runtime sub-agent adapter fixtures for Claude `Agent`, Codex `SubagentStart`/`SubagentStop`, and Gemini `invoke_agent`.
- Sub-agent attribution links child output to parent participant and parent turn/tool-use.
- Unattributable output remains parent arbitrary output instead of becoming a fake sub-agent.
- Existing REST route regression tests.

Renderer:

- Integration modal renders MCP and hook panels.
- Clicking a runtime calls preflight before spawn.
- Missing setup opens setup sheet before launch.
- Installed setup launches immediately.
- Stale setup shows update action before launch.
- Local/global scope selector writes the expected request.
- Settings integration status rows.
- Copy snippets.
- Apply success/failure states.
- Access request cards render open/approved/denied/expired states.
- Approve/deny actions write responses and send live tmux input when possible.
- Agent wake state shows notified/thinking/ready reliably.
- Agents right-panel tab renders all controls and states.
- Pause/resume controls update state and disable wake eligibility.
- Rename updates display name and mention picker.
- Reconnect action handles detached agents.
- Compact/clear buttons respect runtime capability.
- Access selector shows vendor-supported modes or unknown/unsupported.
- Context meter shows known values or unknown/unsupported.
- Agent mention popover works from composer and comments.
- `@` trigger inserts mention tokens and metadata.
- Selecting a paused mention target offers resume.
- Compact/clear buttons are disabled while running/notified/access-pending.
- Chip access-pending color is distinct from turn-ended color.
- Session row fork button opens name popup without selecting source row.
- Composer fork button opens name popup for current session.
- Fork success switches to the new session and preserves composer draft.
- Fork warnings render skipped/failed agent handoff states.
- Sub-agent output renders as a nested box inside the parent agent's turn.
- Sub-agent box shows runtime-provided name/title and parent relationship.
- Completed sub-agent boxes collapse after parent turn end; failed boxes stay visible.

Manual:

- Run each runtime's list/status command:
  - Claude: `/mcp` or `claude mcp list`
  - Codex: `codex mcp list`
  - Gemini: `/mcp` or `gemini mcp list`
- Ask the agent to say hello using F-Mark.
- Confirm event appears in renderer.
- Ask for a todo and a flow chart.
- Confirm no duplicate prose from MCP plus hook in the common happy path.
- Confirm the first prompt injected into the managed agent contains the full MCP-only `/guide`.
- Join an existing long session and confirm the agent receives a compact catch-up, then pulls selected details through MCP.
- Trigger a runtime access request and confirm the UI shows it as an actionable card.
- Pause an agent, send a message, and confirm it receives no wake.
- Resume the agent and confirm future wake works.
- Mention one agent and confirm only that active unpaused agent wakes.
- Send a normal no-mention message and confirm all active unpaused session agents wake.
- Comment on agent-authored content and confirm the author wakes, plus tagged agents when present.
- Create/edit todos and confirm dirty assignees wake.
- Rename an agent and confirm old event mention metadata still routes by participant id.
- Fork a session from the session list and confirm copied events/assets appear in the fork.
- Fork a session from the composer and confirm active managed agents write future output to the fork.
- Verify runtime-native fork/branch command only runs for runtimes with verified capability.
- Launch an agent flow that invokes a sub-agent and confirm the sub-agent output is nested under the parent agent with the given name when runtime data supports it.

## Open Questions

- After the Fastify spike, should `/mcp` HTTP ship in the same release as stdio or remain a later transport?
- When can stdio mutating tools safely call local services directly instead of proxying to the running kernel HTTP API?
- How should MCP connection status be surfaced if the runtime does not expose it to F-Mark?
- Should F-Mark expose resources for attachments in v1?
- Should MCP tools be allowed under `--no-auth`, or should stdio rely on local token reads even when kernel auth is enabled?
- Should we include `path` in MCP tool envelopes for stale-path protection?
- Do we need a distinct `mcp_status` presence state, or is install status enough?
- Should the integration version marker include package version, schema version, or both?
- Which auto-apply paths are safe enough for v1 after smoke tests: Claude project/user, Codex user/project TOML, Gemini project/user settings?
- Should Codex app-server be adopted narrowly for context/name/approval/sub-agent data, or stay out of v1?
- Can Claude status-line collection be enabled without clobbering user status-line configuration?
- What exact Gemini trust remediation should the setup sheet offer when project config is ignored?
- Which vendor context/access fields pass smoke tests strongly enough to show as first-class controls versus "unknown"?
- Should global setup ever become sticky/preferred after the user chooses it once, or should setup remain local-first every time?
- Should native runtime fork be enabled in v1 for Claude `/branch` and Codex `/fork`, or should v1 use only F-Mark-owned fork handoff prompts?
- Should fork v1 move active agents to the fork, or also support cloned agents so source and fork can both keep live panes?
- Should fork metadata remain hidden in `.fork.json`, or should the fork feed include a visible system event?
- Do progressive sub-agent streams pass smoke tests for Claude or Codex, or should v1 stay final-result-only across all runtimes?
- Should sub-agents ever become durable F-Mark participants, or remain nested subentities of their invoking agent?

## First Implementation Slice

The smallest useful slice:

1. Add canonical `AgentStateStore` active-session resolver.
2. Add `f-mark mcp` stdio on `@modelcontextprotocol/sdk@1.29.0`.
3. Proxy mutating stdio MCP tools through the running kernel HTTP API.
4. Expose `fmark_post_prose`, `fmark_read_events`, and `fmark_end_turn`.
5. Add Claude project-scoped stdio auto-apply with `F_MARK_MCP_VERSION`.
6. Add preflight for Claude MCP status before spawn.
7. Add `/guide` MCP-only and `/guide-rest-variant`.
8. Inject `/guide` as the first managed-agent prompt.
9. Manual smoke with one Claude agent.

After that works, expand to:

- Claude hook setup, status-line context, access request cards, and `/branch` fork smoke.
- Codex/Gemini local/global install support and stale-version update flows.
- Compass inbox/cursor tools.
- Session forking backend/UI.
- Final-result-only sub-agent boxes for fixtures we can verify.
- HTTP MCP after the Fastify transport spike passes.
