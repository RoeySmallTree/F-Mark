# MCP Agent UX Flow

> Date: 2026-05-25  
> Purpose: define the seamless setup-first managed-agent flow for MCP + stream hooks.

## Product Principle

Adding an agent should feel like a single guided action:

1. User clicks `+` and chooses a runtime, for example `Claude`.
2. F-Mark checks whether that runtime is ready for this project.
3. If anything is missing or stale, a setup sheet opens before launch.
4. User chooses **Locally** or **Globally** and clicks one install/update action.
5. F-Mark installs MCP and stream hooks where safe.
6. F-Mark launches the agent into the current session.
7. The first prompt already contains the full live `/guide` output.

The user should not have to copy `/guide`, paste API instructions, install MCP in a separate ritual, or discover after launch that the agent cannot participate.

## Terms

UI labels should avoid runtime-specific jargon where possible:

- **Locally** means "this project". It writes project-scoped config such as `.mcp.json`, `.codex/config.toml`, or `.gemini/settings.json`.
- **Globally** means "this machine". It writes user/machine-scoped config such as `~/.claude.json`, `~/.codex/config.toml`, or `~/.gemini/settings.json`.

The UI can show secondary text like "Project" and "Machine" under those labels so the scope is obvious.

## Integration Roles

### MCP

MCP is the required model-facing integration for managed agents.

The model uses F-Mark MCP tools to:

- read session events
- post prose, choices, todos, flows, html, files
- end turns
- link itself to a session
- inspect canonical todo state

### Stream Hook

The stream hook is the passive capture and wake/safety layer.

It captures:

- natural assistant text that was not explicitly posted through MCP
- external tool-use telemetry
- turn-end events
- user prompt submission where supported

For a seamless managed-agent launch, F-Mark should set up both MCP and the stream hook when the runtime supports both. MCP alone is enough to make an agent useful, but the happy path should install the complete integration before launch.

## Main Add-Agent Flow

### 1. User clicks a runtime

The existing `+` menu stays visually simple:

- Claude
- Codex
- Gemini
- Terminal
- Manage runtimes

When the user clicks `Claude`, the UI does not immediately spawn. It starts a preflight.

### 2. Kernel runs preflight

Add a preflight endpoint that checks everything needed before launch:

```text
POST /managed-agents/preflight
```

Request:

```ts
{
  runtime_id: string;
  session_id?: string;
}
```

Response:

```ts
{
  runtime_id: string;
  can_launch: boolean;
  recommended_scope: "local" | "global";
  mcp: IntegrationCheck;
  hook: IntegrationCheck;
  runtime: {
    available: boolean;
    executable: string;
    version?: string;
    minimum_version?: string;
    update_available?: boolean;
  };
}

interface IntegrationCheck {
  required: boolean;
  supported: boolean;
  installed: boolean;
  status: "ok" | "missing" | "stale" | "unsupported" | "unknown" | "blocked";
  installed_version?: string;
  bundled_version: string;
  latest_known_version?: string;
  update_available: boolean;
  locations: IntegrationLocation[];
  actions: IntegrationAction[];
}

interface IntegrationLocation {
  scope: "local" | "global" | "system";
  label: string;
  config_path: string;
  exists: boolean;
  installed: boolean;
  installed_version?: string;
  update_available: boolean;
  blocked_reason?: string;
}
```

Versioning matters. Every F-Mark MCP/hook install should include a recognizable marker with the F-Mark integration version, for example:

- MCP config env: `F_MARK_MCP_VERSION=0.5.0`
- hook command flag: `f-mark hook auto-stream --integration-version 0.5.0`
- JSON/TOML comment or adjacent metadata where the runtime config format supports it

If the currently installed version is lower than the bundled version, the setup sheet should suggest **Update** instead of **Install**.

### 3. Setup sheet appears if needed

If preflight finds missing/stale/blocked integration, open a setup sheet before launch.

The sheet header should be direct:

```text
Set up Claude for this F-Mark project
```

Show three compact status rows:

- Runtime: installed / missing / version issue
- MCP tools: installed / missing / update available / blocked
- Stream capture: installed / missing / update available / not supported

Then show scope selector:

- **Locally**: This project
- **Globally**: This machine

Default scope:

- Locally, when project-scoped config is supported and safe.
- Globally, only when project-scoped config is unsupported or explicitly blocked.

Actions:

- **Install locally and launch**
- **Install globally and launch**
- **Update locally and launch**
- **Update globally and launch**
- **Launch anyway** only when MCP is already installed or the runtime is in a deliberate fallback mode.

For managed agents, hide "copy command" behind an advanced disclosure. The primary path is automatic application.

### 4. Kernel applies integration

Add one endpoint that applies the chosen setup plan:

```text
POST /managed-agents/integration-apply
```

Request:

```ts
{
  runtime_id: string;
  scope: "local" | "global";
  install_mcp: boolean;
  install_hook: boolean;
  update_existing: boolean;
}
```

Response:

```ts
{
  applied: boolean;
  mcp: IntegrationCheck;
  hook: IntegrationCheck;
  touched_files: string[];
  warnings: string[];
}
```

Rules:

- Preserve existing runtime config.
- Do not write bearer tokens into project files.
- Prefer stdio MCP so the MCP server reads `.f-mark/.token` itself.
- Require explicit click before writing global/user config.
- Show blocked config files with a precise reason and manual fallback.
- For invalid JSON/TOML, do not overwrite; show repair instructions.

### 5. Kernel launches after setup passes

Only after integration is ready should the UI call:

```text
POST /managed-agents/spawn
```

Spawn should receive the preflight/apply outcome or rerun a quick validation before launch.

`POST /managed-agents/spawn` should:

1. Register or reuse the participant.
2. Link it to the current session.
3. Start tmux with runtime env:
   - `F_MARK_SESSION_ID`
   - `F_MARK_PARTICIPANT_ID`
   - `F_MARK_RUNTIME_ID`
   - `F_MARK_PATH`
4. Inject the first prompt containing the full live `/guide` output.
5. Mark the chip as launching/ready based on tmux state.

Suggested response:

```ts
{
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  active_session: string | null;
  mcp_status: "installed" | "updated" | "missing" | "unknown";
  hooks_status: "installed" | "updated" | "missing" | "not_required" | "unknown";
}
```

### 6. Renderer shows a ready chip

Because setup happened before launch, the chip should usually appear as ready/launching, not broken.

Suggested chip states:

- `launching`: tmux exists, first signal pending.
- `ready`: MCP installed and runtime alive.
- `stream-limited`: MCP installed, hook unavailable or intentionally skipped.
- `needs-setup`: only for launch-anyway/fallback cases.
- `pane-dead`: tmux session exited.
- `offline`: no tmux/presence.

## Setup Sheet Content

### Status rows

Each integration row should show:

- current status
- configured scope
- config path
- installed version
- bundled/current F-Mark version
- update action when stale
- reason when blocked

Example:

```text
MCP tools
Missing locally
.mcp.json
Install v0.5.0
```

Example stale:

```text
Stream capture
Installed locally, v0.4.0
.claude/settings.json
Update to v0.5.0
```

### Scope options

Locally:

- preferred
- scoped to this repo
- easiest to reason about with multi-project F-Mark
- can be committed when appropriate

Globally:

- applies to all projects on this machine
- useful for personal machines
- never silently selected for shared/team repos

### Runtime-specific notes

Claude:

- local/project MCP usually means `.mcp.json`.
- stream hook can be applied to project `.claude/settings.json` or global `~/.claude/settings.json`.

Codex:

- global MCP via `codex mcp add` is well-supported.
- project MCP requires direct `.codex/config.toml` editing and project trust; show this clearly.

Gemini:

- local/project MCP means `.gemini/settings.json`.
- do not set `trust: true` automatically.
- if folder trust blocks project config, show "Trust project in Gemini after launch" or launch with global config.

## First Prompt Injection

Managed spawn should not ask the agent to fetch `/guide`. F-Mark should fetch/build the guide itself and inject it as the first prompt sent to the tmux pane.

The prompt should include:

- participant id
- session id
- current project path
- runtime id
- the full `/guide` markdown
- a compact compass packet for the current session
- a one-line instruction to use F-Mark MCP tools, not raw REST

Template:

```text
You are joining this F-Mark project as participant <agent-id> in session <session-id>.

Use the F-Mark MCP tools exposed by the `f-mark` MCP server for all F-Mark reads and writes.
Do not call the F-Mark REST API unless the user explicitly asks for low-level debugging.

<full /guide markdown here>

Current compass:
- Your last seen cursor: <cursor or none>
- New user/session events: <bounded summary>
- Open choices/todos/access requests relevant to you: <bounded summary>
- Use `fmark_get_inbox` or `fmark_read_event` for details.
```

If the stream hook is installed, the prompt can also say:

```text
Your ordinary terminal output and tool calls may be captured by the F-Mark stream hook. Use MCP for deliberate artifacts such as comments, todos, choices, diagrams, and named documents.
```

## `/guide` Contract

`/guide` should be MCP-first and should not include the REST API reference.

It should describe:

- the connected `f-mark` MCP server
- the tools the agent should use
- how to join/read/respond/end turns with tools
- composable document guidance
- what the stream hook captures automatically
- what not to do

REST guidance moves to:

```text
GET /guide-rest-variant
```

That route is for debugging, custom integrations, and non-MCP clients.

## Connecting Agents To The Current Session

F-Mark should link the agent automatically before the first prompt:

1. Write `.f-mark/agents/<agent-id>/active-session`.
2. Set participant `active_session` in config.
3. Pass `F_MARK_SESSION_ID` into tmux.
4. Include participant id and session id in the injected guide prompt.

MCP server context should resolve session in this order:

1. Explicit `session_id` in tool input.
2. `F_MARK_SESSION_ID`.
3. `.f-mark/agents/<participant-id>/active-session`.
4. If still missing, tool returns a clear "link first" error.

Manual agents can still read `/guide`, but managed agents should receive it automatically.

## Pause, Resume, And Targeting

Users can pause/resume agents from the right-pane Agents tab and agent action surfaces.

Paused means:

- the agent remains registered,
- the tmux pane is not killed,
- the agent can finish any already-running turn,
- F-Mark does not send automatic wake packets, compass deltas, mention nudges, or comment notifications to it.

Resume re-enables wake delivery and can optionally send a small "you were resumed" compass update.

Targeting rules:

- Regular user message with no agent mentions: wake all active unpaused agents linked to the current session.
- Regular user message with agent mentions: wake only tagged active unpaused agents.
- Comment with agent mentions: wake tagged active unpaused agents and the author agent of the commented-on content.
- Comment without agent mentions: wake the author agent of the commented-on content.
- Todo/task creation or edit: wake whoever is assigned to the dirty todo/task.
- Manual wake from the Agents tab: wake that agent if active and unpaused.
- Detached/offline agents are not woken; the UI should offer reconnect.
- Paused agents are never woken automatically. If a user tags a paused agent, offer to resume it before sending.

Mentions:

- available from an Agent button below the main composer and comment composer,
- available through `@` typing,
- multi-select active agents,
- insert `@DisplayName` into the text,
- attach mention metadata with participant ids so rename does not break routing.
- show paused agents as disabled with a resume affordance.

## Intercepting Output

### Existing behavior to preserve

The current hook intercepts runtime output and posts:

- arbitrary/mid-turn prose
- tool-use events
- final prose
- turn-end

This should keep working without MCP and should be automatically configured in the managed happy path where supported.

### With MCP installed

MCP-authored deliberate events should render as first-class F-Mark content.

Potential duplicate issue:

- The model calls `fmark_post_prose("Here is the plan")`.
- The hook also sees the final assistant text and posts it as prose.

Recommended v1:

- Use MCP for named documents, todos, choices, flows, comments, revisions, and explicit "say this to the session" actions.
- Let hooks continue capturing ordinary turn text and tool-use.
- Mark MCP-created events with `source: "mcp"` where event formats allow it.
- Teach the hook to avoid posting duplicate final prose when the same turn already produced a deliberate MCP prose event.

## Waking Agents When Their Turn Arrives

Current wake path should remain tmux input based.

When the human sends a message in the current session:

1. Renderer posts user prose as today.
2. Kernel determines target agents:
   - active managed agents in the current session,
   - assigned todo owners if the user acted on a todo,
   - explicitly mentioned agents if mentions land later.
3. Kernel sends a wake prompt to each target tmux pane via the existing input queue.

Wake prompt:

```text
F-Mark compass update.
Session: <session-id>
You are: <agent-id>
Use MCP tools from server `f-mark`.

New since <cursor>:
- <bounded summary of new user/session events>
- <assigned todos/open choices/access requests>

Call `fmark_get_inbox` for structured details, then respond with F-Mark MCP tools.
```

If MCP is unexpectedly unavailable:

```text
New F-Mark session event in <session-id>. Your F-Mark MCP server appears unavailable. Report the setup issue in the terminal and wait for the user; do not invent REST calls.
```

The hook is still useful after wake:

- UserPromptSubmit hook can record the user's prompt in runtimes that support it.
- Stop hook captures the agent's response and turn-end if the agent does not use MCP tools correctly.

## Existing Session Catch-Up

Joining an existing session should not dump every event file into the agent's context.

Use a staged catch-up:

1. First prompt includes a compact compass packet.
2. Agent calls `fmark_get_inbox` to get unread/actionable state. This marks returned items as seen automatically.
3. Agent calls `fmark_read_event` for selected details.
4. `fmark_mark_seen` remains available for manual correction/advanced flows, but is not required after normal inbox reads.

F-Mark should store per-agent per-session cursors so future wake prompts stay small.

## Access Requests

Runtime permission/trust/config prompts should be first-class F-Mark events when detectable.

UI behavior:

- show access requests as actionable cards in the feed,
- show a pending badge near the agent chip/top bar,
- show a distinct access-pending chip color from turn-ended notification,
- allow approve/deny from the card,
- write an `access-response` event,
- send the answer to the live tmux/runtime prompt when still active,
- mark the request expired if the prompt can no longer be answered.

This should not rely solely on arbitrary streamed text. If the runtime exposes structured permission data, use that. Otherwise, terminal-pattern detection is fallback only.

## Preserving Current Functionality

Must remain true:

- Existing REST clients keep working.
- Current hook install/status/apply flow keeps working, though it can move under the integration setup umbrella.
- Managed spawn still works under the existing auth/process-spawn gates.
- Terminal overlay and agent command menu keep working.
- Agent chips still show pane liveness and presence.
- Manual/non-MCP integrations can use `/guide-rest-variant`.

Compatibility strategy:

- Add preflight/apply before spawn; keep `POST /managed-agents/spawn` for API callers.
- Keep hook routes stable or alias them to integration routes.
- Keep REST APIs stable.
- Keep skill bundles with MCP-first guidance and point REST users to `/guide-rest-variant`.

## Ideal Happy Path

1. User clicks `+` -> `Claude`.
2. UI runs preflight.
3. Setup sheet opens because MCP or hook is missing/stale.
4. User picks **Locally**.
5. User clicks **Install locally and launch**.
6. Kernel writes/updates project MCP and hook config with version markers.
7. Kernel verifies status.
8. Kernel spawns Claude in tmux and links it to the current session.
9. Kernel sends the full `/guide` output as the first prompt.
10. Agent immediately uses `f-mark` MCP tools:
    - `fmark_read_events`
    - `fmark_post_prose`
    - `fmark_end_turn`
11. Stream hook passively captures ordinary output/tool-use.
12. User replies.
13. Kernel wakes the agent through tmux input.
14. Agent reads/responds through MCP; hook remains the safety net.
