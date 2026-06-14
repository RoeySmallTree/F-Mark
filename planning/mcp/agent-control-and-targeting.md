# Agent Control, Targeting, And Right-Pane Plan

> Date: 2026-05-25  
> Purpose: specify the user-facing agent controls and the backend/frontend work needed to make managed agents feel reliable, targetable, and inspectable.

## Decisions From Product Direction

1. Users can pause/resume each agent.
   - Paused agents do not receive wake packets, compass deltas, comment notifications, tag-targeted wakes, or automatic "new message" nudges.
   - Pause does not kill the tmux pane and does not interrupt an already-running turn. Interrupt remains a separate explicit action.

2. `fmark_get_inbox` marks queried items as seen automatically.
   - The tool returns the old cursor, the new cursor, and the items it marked seen.
   - Add an optional future `peek` mode only if needed; v1 default is automatic mark-seen.

3. Access requests appear in two places.
   - Agent chip/top status gets a notification color distinct from turn-ended/idle.
   - Feed/chat shows actionable access request cards and badges.

4. Agent display names are randomized on creation.
   - Names come from a hardcoded array.
   - The initial prompt tells the agent its display name.
   - Mentions use `@display-name`.

## Integrated Research Inputs

- `planning/mcp/research-mcp-kernel-architecture.md`: active-session state is currently split across participants, legacy link routes, managed-agent runtime files, and hooks. Agent controls must use one canonical `AgentStateStore` before pause/resume, fork handoff, MCP context, and wake targeting can be reliable.
- `planning/mcp/research-fmark-ui-backend-integration.md`: `GET /managed-agents/status` must include active session, pause state, connection/activity state, display name, runtime session, context, access, and pending counts for the right-pane Agents tab.
- `planning/mcp/research-claude-runtime.md`: Claude exposes runtime session ids through hooks, context through status-line JSON, access requests through `PermissionRequest`, and compact/clear through `/compact`/`/clear`.
- `planning/mcp/research-codex-runtime.md`: Codex exposes runtime session/turn ids through hooks, access requests through `PermissionRequest`, compact/clear through `/compact`/`/clear`, but context usage needs app-server or transcript work.
- `planning/mcp/research-gemini-runtime.md`: Gemini exposes runtime session ids through hooks, access prompts through `Notification` `ToolPermission`, compact through `/compress`, and `/clear` resets the runtime session id; context usage should be unknown/estimated.

## Backend Data Model

### Agent State

Add persistent managed-agent state beyond current tmux/runtime sibling files.

Suggested file:

```text
.f-mark/agents/<participant-id>/state.json
```

Suggested shape:

```ts
interface ManagedAgentState {
  participant_id: string;
  display_name: string;
  runtime_id: string;
  active_session: string | null;
  runtime_session?: RuntimeSessionIdentity;
  paused: boolean;
  connection_state: "connected" | "detached" | "launching" | "offline";
  activity_state: "idle" | "running" | "notified" | "turn-ended" | "access-pending";
  last_seen_cursor_by_session: Record<string, string>;
  context?: AgentContextStatus;
  access?: AgentAccessStatus;
}

interface RuntimeSessionIdentity {
  id: string | null;
  name: string | null;
  desired_name: string | null;
  transcript_path?: string | null;
  source: "hook" | "mcp-handshake" | "spawn" | "unknown";
  updated_at: string;
}

interface AgentContextStatus {
  status: "known" | "unknown" | "unsupported";
  used?: number;
  available?: number;
  unit: "tokens" | "percent" | "unknown";
  source: "runtime" | "hook" | "manual" | "unknown";
  updated_at: string;
}

interface AgentAccessStatus {
  status: "known" | "unknown" | "unsupported";
  mode?: string;
  available_modes: string[];
  source: "runtime" | "config" | "unknown";
  updated_at: string;
}
```

Participant config should continue to store the public participant identity. Managed-agent state stores operational controls.

Current implementation note:

- F-Mark already stores the F-Mark participant id, active F-Mark session id, runtime id, and tmux session name.
- Hook auto-registration can map external runtime `session_id` values in `.f-mark/hooks/auto-stream-agents.json`, but managed tmux-spawned agents do not currently expose a vendor session identity in `GET /managed-agents`.
- The new state file must normalize vendor/runtime identity as `runtime_session`, updated from hook payloads and, where available, MCP handshake/status.
- On managed spawn, set `runtime_session.desired_name` to the active F-Mark `session_id`. If the vendor runtime supports a session title/name at creation time, pass that same `session_id` as the vendor-native session name/title.
- Runtime session `name` is the actual confirmed vendor-native name/title. If Claude/Codex/Gemini expose only an id or do not allow setting names, keep `desired_name` as the F-Mark alias and show the F-Mark display name plus the desired session id/shortened vendor id.
- Store and read `active_session` through a single `AgentStateStore`/resolver. Legacy files can be bridged during migration, but participants, hooks, MCP context, wake routing, and fork handoff must not each invent their own active-session lookup.

### Random Display Names

Add:

```text
packages/kernel/src/agents/displayNames.ts
```

Example starter array:

```ts
export const AGENT_DISPLAY_NAMES = [
  "Ada",
  "Linus",
  "Grace",
  "Katherine",
  "Claude",
  "Nia",
  "Mira",
  "Otto",
];
```

Creation rules:

- If user supplied a name, use it.
- Otherwise pick a random unused name for the current project.
- If all are used, append a short suffix: `Ada-2`, `Ada-3`.
- Persist as participant name/display name.
- Initial prompt says: `Your F-Mark display name is Ada. Users may mention you as @Ada.`

## Backend Routes

### Agent List/Status

```text
GET /managed-agents/status?session_id=<id>
```

Returns all registered agents relevant to the active path, including managed/unmanaged status where known.

```ts
interface AgentStatusRow {
  participant_id: string;
  display_name: string;
  runtime_id: string | null;
  active_session: string | null;
  runtime_session: RuntimeSessionIdentity;
  managed: boolean;
  paused: boolean;
  connection_state: "connected" | "detached" | "launching" | "offline";
  activity_state: "idle" | "running" | "notified" | "turn-ended" | "access-pending";
  tmux_session: string | null;
  mcp_status: string;
  hook_status: string;
  context: AgentContextStatus;
  access: AgentAccessStatus;
  pending_access_count: number;
}
```

### Pause/Resume

```text
POST /managed-agents/:id/pause
POST /managed-agents/:id/resume
```

Handlers:

- validate participant id,
- write `paused`,
- broadcast managed-agent state update,
- if paused, remove agent from wake target sets.

Pause should not:

- kill tmux,
- clear active session,
- block manual terminal interaction,
- block explicit user actions like "send message to this agent" after confirmation.
- hide the agent from mention search entirely. If a user selects/types a paused agent, the UI should offer to resume it before sending.

### Rename

```text
PATCH /participants/:id
```

or:

```text
PATCH /managed-agents/:id
```

Body:

```json
{ "display_name": "Ada" }
```

Handler:

- update participant name,
- update managed-agent display name if separate,
- preserve mention history by storing participant ids in event metadata.

### Reconnect

```text
POST /managed-agents/:id/reconnect
```

Behavior:

- if tmux pane exists but state is detached, reattach state.
- if tmux pane is gone, spawn the same runtime with same participant id/session.
- rerun integration preflight if needed.
- inject a reconnect compass prompt, not a full new onboarding unless needed.

### Compact / Clear

```text
POST /managed-agents/:id/compact
POST /managed-agents/:id/clear
```

Implementation:

- use runtime capability table to decide command:
  - Claude: `/compact` and `/clear`; re-send compass after PreCompact/PostCompact or SessionStart/End signals.
  - Codex: `/compact` and `/clear`; `/clear` starts a fresh thread, so rebind runtime session identity afterward.
  - Gemini: `/compress` for compact; `/compact` is an alias to smoke-test; `/clear` resets chat and creates a new runtime session id.
- disable compact/clear while the agent is `running`, `notified`, or waiting on an access request. Enable only when idle/ready/detached states make the operation safe for that runtime.
- route through the existing per-pane input queue.

Remaining smoke checks:

- Verify the exact idle-state signal before sending compact/clear to each runtime.
- Verify post-clear runtime session id rebinding for Codex and Gemini.
- Verify whether Gemini `/compact` alias is safe enough to expose or whether UI should label only `/compress`.

### Access Status And Change Access

```text
GET /managed-agents/:id/access
PATCH /managed-agents/:id/access
```

Body:

```ts
{
  mode: string;
}
```

Requirements:

- expose vendor-supported access/permission modes,
- allow changing when supported,
- show unsupported/unknown when not reliably retrievable.

Research-backed behavior:

- Claude: expose launch/readback permission mode where available; create access-request cards from structured `PermissionRequest` hooks. Live mode change needs smoke before enabling.
- Codex: expose approval policy and sandbox mode from launch/config; create access-request cards from structured `PermissionRequest` hooks. Prefer app-server or smoke-tested terminal path for live changes.
- Gemini: expose launch-time `--approval-mode`, sandbox, and trust state. Treat live access changes as unsupported/restart-required unless future smoke proves otherwise; create access-request cards from `Notification` `ToolPermission` where available.

### Context Status

```text
GET /managed-agents/:id/context
```

Returns known context used/available.

Research-backed behavior:

- Claude: prefer status-line JSON `context_window`; hooks alone are insufficient.
- Codex: show `Unknown` unless app-server or transcript fixtures provide a stable token usage field.
- Gemini: show estimated/unknown; no stable external context-used API has been found.

If any vendor cannot reliably expose context usage, UI must show `Unknown` rather than inventing a number.

### Wake Targeting

```text
POST /sessions/:id/wake
```

Body:

```ts
{
  source_event: string;
  target_participant_ids?: string[];
  reason: "user-message" | "comment" | "mention" | "todo" | "manual";
}
```

Handler:

- resolve targets,
- remove paused agents,
- compute compass packets,
- send wake prompt via tmux input queue,
- mark agents `notified`,
- do not wake detached/offline agents unless reconnect is requested.

Wake targeting rules:

- Regular message with no agent mentions: wake all active unpaused agents linked to the current session.
- Regular message with one or more agent mentions: wake only tagged active unpaused agents.
- Comment with one or more agent mentions: wake tagged active unpaused agents and the author agent of the commented-on content, if that author is active and unpaused.
- Comment with no agent mentions: wake the author agent of the commented-on content, if active and unpaused.
- Todo/task creation or edit: wake agents assigned to any dirty todo/task touched by the change, if active and unpaused.
- Manual wake from the Agents tab: wake the selected agent if active and unpaused; if paused, offer resume first.

All wake target resolution must remove paused agents before delivery. If a tagged/assigned/comment-author agent is paused, the UI should show a resume affordance rather than silently waking it.

### Session Fork Handoff

Session forking is specified in `planning/mcp/session-forking.md`, but it must update the same managed-agent state described here.

When `POST /sessions/:id/fork` moves active agents into the fork:

- update `active_session` to the fork session id,
- update `.f-mark/agents/<participant-id>/active-session`,
- set `runtime_session.desired_name` to the fork session id,
- preserve `display_name`, `paused`, access, and context state,
- leave paused agents paused and skipped,
- broadcast agent-state updates so the right-pane Agents tab and chips re-render against the fork.

## Agent Mentions / Tags

### Input UX

Add agent tagging in both:

- main composer,
- comment composer.

Two entry points:

1. Agent button below the input, popover like Skills/Presets.
2. `@` typing trigger inside the textarea.

Popover behavior:

- lists active agents in the current session,
- supports multi-select,
- shows runtime icon/status,
- shows paused/detached agents as disabled with reason,
- selecting a paused agent opens an "Resume agent?" inline confirmation,
- selected agents insert `@DisplayName` tokens into the input.

### Event Metadata

Do not rely only on display-name text. Display names can change.

Add optional mention metadata to prose/comment events:

```ts
mentions?: Array<{
  participant_id: string;
  display_name: string;
  token: string;
}>
```

Wake routing uses `participant_id`, not text parsing.

Renderer can still display `@DisplayName` inline.

### Wake Prompt Mentioning

When waking an agent due to a mention, include:

```text
You were mentioned as @Ada in the user's message.
Your F-Mark display name is Ada.
```

For comment mentions:

```text
You were mentioned as @Ada in a comment on <target>.
Use `fmark_get_inbox` to inspect the comment and target event.
```

## Right Pane Agents Tab

Add a new right-panel tab:

```ts
type RightTabKey = "todos" | "comments" | "named" | "log" | "agents";
```

Component:

```text
packages/renderer/src/panels/right/RightAgents.tsx
```

### Tab Header

Label:

```text
Agents
```

Badge:

- pending access requests count,
- or number of active/running agents if no requests.

### Row Content

Each agent row should show:

- avatar/runtime icon,
- display name,
- runtime id,
- paused/active toggle,
- connection state:
  - connected,
  - detached,
  - launching,
  - offline,
- activity state:
  - idle,
  - running,
  - notified,
  - turn ended,
  - access pending,
- context used/available:
  - progress bar when known,
  - `Unknown` when not supported,
- access permission mode:
  - current mode,
  - dropdown if changeable,
  - disabled with reason if not retrievable,
- MCP/hook setup status,
- pending access count.

### Row Actions

Each action must have a concrete handler.

| UI control | Handler | Backend route |
|---|---|---|
| Pause | `onPause(agentId)` | `POST /managed-agents/:id/pause` |
| Resume | `onResume(agentId)` | `POST /managed-agents/:id/resume` |
| Rename | `onRename(agentId, name)` | `PATCH /participants/:id` or `PATCH /managed-agents/:id` |
| Reconnect | `onReconnect(agentId)` | `POST /managed-agents/:id/reconnect` |
| Add agent | `onAddAgent()` | opens existing runtime picker/preflight |
| Compact | `onCompact(agentId)` | `POST /managed-agents/:id/compact` |
| Clear | `onClear(agentId)` | `POST /managed-agents/:id/clear` |
| Change access | `onChangeAccess(agentId, mode)` | `PATCH /managed-agents/:id/access` |
| Integration setup | `onIntegrationSetup(agentId)` | opens setup sheet |
| Terminal | `onOpenTerminal(agentId)` | existing terminal overlay |
| Interrupt | `onInterrupt(agentId)` | existing command route |
| Goodbye | `onGoodbye(agentId)` | existing confirmed delete route |

### Right Pane Empty States

- No agents: "No agents in this session" plus Add agent button.
- All paused: show paused state and Resume actions.
- Detached agents: show Reconnect action.
- Telemetry unavailable: show "Context unavailable for this runtime" without alarming color.
- Running agents: compact/clear disabled with tooltip "Available when idle".

## Agent Chips And Notifications

Chip states/colors should distinguish:

- running: active/thinking color,
- turn ended: completion notification color,
- access pending: attention color distinct from completion,
- paused: muted/disabled treatment,
- detached: outline/warning treatment,
- stream-limited: secondary warning,
- ready/idle: neutral ready state.

Access pending should appear both:

- on chip/top-bar notification,
- as access request cards in feed/chat.

Turn-ended notification should appear on chip but should not look like an access request.

## Frontend Implementation Checklist

### Store/types

- [ ] Add `agents` tab to right panel state.
- [ ] Add agent status slice or extend presence slice.
- [ ] Add paused/activity/connection/access/context fields.
- [ ] Add pending access count.
- [ ] Add selected mentions state for compose/comment drafts.

### API client

- [ ] `getAgentStatus(sessionId)`
- [ ] `pauseAgent(id)`
- [ ] `resumeAgent(id)`
- [ ] `renameAgent(id, displayName)`
- [ ] `reconnectAgent(id)`
- [ ] `compactAgent(id)`
- [ ] `clearAgent(id)`
- [ ] `getAgentAccess(id)`
- [ ] `changeAgentAccess(id, mode)`
- [ ] `getAgentContext(id)`
- [ ] `wakeSession(sessionId, targets, sourceEvent, reason)`
- [ ] `forkSession(sessionId, body)`

### Components

- [ ] `RightAgents`
- [ ] `AgentStatusRow`
- [ ] `AgentPauseToggle`
- [ ] `AgentContextMeter`
- [ ] `AgentAccessSelect`
- [ ] `AgentMentionPopover`
- [ ] `AgentMentionToken`
- [ ] `AccessRequestCard`
- [ ] `ForkSessionPopover`
- [ ] `SubagentBox`

### Compose/comment integration

- [ ] Agent button below main composer input.
- [ ] `@` trigger in main composer.
- [ ] Agent button below comment composer input.
- [ ] `@` trigger in comment composer.
- [ ] Mention tokens inserted into text.
- [ ] Mention metadata sent with prose/comment POST.
- [ ] Mentioned agents used for wake targets.

### Tests

- [ ] Right panel includes Agents tab.
- [ ] Agents tab row renders statuses and actions.
- [ ] Pause/resume calls correct handlers.
- [ ] Paused agent is excluded from wake targets.
- [ ] Mention popover lists active agents and shows paused/detached agents disabled with reasons.
- [ ] Mention popover offers resume when selecting paused agents.
- [ ] Regular no-mention message wakes all active unpaused session agents.
- [ ] Mentioned message wakes only tagged active unpaused agents.
- [ ] Comment wakes tagged agents and commented-content author agent.
- [ ] Todo/task creation/edit wakes dirty assignees.
- [ ] Compact/clear disabled while running/notified/access-pending.
- [ ] `@` insertion creates metadata.
- [ ] Comment mentions create metadata.
- [ ] Access request card approve/deny actions.
- [ ] Chip shows distinct access-pending vs turn-ended state.
- [ ] Fork handoff updates agent rows to the forked session.
- [ ] Sub-agent output renders as nested child of the invoking agent, not as a separate top-level agent.

## Backend Implementation Checklist

- [ ] Managed-agent state file.
- [ ] Random display name picker.
- [ ] Status aggregation route.
- [ ] Pause/resume routes.
- [ ] Rename route.
- [ ] Reconnect route.
- [ ] Compact/clear routes.
- [ ] Access read/change routes.
- [ ] Context read route.
- [ ] Wake route with mention/target handling.
- [ ] Session fork handoff updates active managed-agent state.
- [ ] Sub-agent attribution stores parent participant/turn/tool-use and child name when available.
- [ ] Mention metadata in prose/comment schemas.
- [ ] Access request/response event routes.
- [ ] WS broadcasts for agent state changes.
- [ ] Tests for paused agents not receiving wake.
- [ ] Tests for mention-targeted wake.
- [ ] Tests for fork handoff changing agent active-session pointers.
- [ ] Tests for sub-agent output attribution and nested rendering data.
- [ ] Tests for random display name persistence.
- [ ] Tests for access request state transitions.

## Runtime Capability Smoke Checklist

Research outcome docs answer the broad questions. These remaining checks decide whether a control is enabled in v1 or shown as unknown/unsupported:

- [ ] Claude status-line context installer/readback without clobbering user config.
- [ ] Codex app-server or transcript path for context usage; otherwise keep `Unknown`.
- [ ] Gemini context usage fixture; otherwise keep estimated/unknown.
- [ ] Claude live permission-mode change; otherwise require restart.
- [ ] Codex live approval/sandbox change; otherwise require restart or app-server.
- [ ] Gemini live access/trust change; default to restart-required.
- [ ] Idle-state safety for Claude `/compact` and `/clear`.
- [ ] Idle-state safety for Codex `/compact` and `/clear`, plus post-clear runtime session rebinding.
- [ ] Idle-state safety for Gemini `/compress` and `/clear`, plus post-clear runtime session rebinding.
- [ ] Claude `/branch [name]` managed-pane behavior.
- [ ] Codex `/fork` and `codex fork` managed-pane behavior.
- [ ] Gemini checkpoint resume behavior, if considered for optional native branch.
- [ ] Claude progressive sub-agent stream visibility.
- [ ] Codex progressive sub-agent/app-server/transcript visibility.
- [ ] Gemini progressive `invoke_agent`/`SubagentProgress` visibility.

Until a smoke item passes, the UI should show unsupported/unknown states instead of pretending.
