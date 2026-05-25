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
  paused: boolean;
  connection_state: "connected" | "detached" | "launching" | "offline";
  activity_state: "idle" | "running" | "notified" | "turn-ended" | "access-pending";
  last_seen_cursor_by_session: Record<string, string>;
  context?: AgentContextStatus;
  access?: AgentAccessStatus;
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
  - likely send `/compact` for compact,
  - likely send `/clear` or runtime equivalent for clear,
  - disable if unsupported.
- disable compact/clear while the agent is `running`, `notified`, or waiting on an access request. Enable only when idle/ready/detached states make the operation safe for that runtime.
- route through the existing per-pane input queue.

Research required:

- exact compact/clear command availability for Claude Code, Codex CLI, Gemini CLI.
- whether commands can be sent safely while the runtime is running.
- whether clear destroys context, chat transcript, terminal screen, or only visible UI.

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

Research required:

- Claude Code permission mode/config/readback APIs.
- Codex approval/sandbox/access modes and readback APIs.
- Gemini CLI trust/approval/access modes and readback APIs.
- Whether access changes can be applied live or require restart.

### Context Status

```text
GET /managed-agents/:id/context
```

Returns known context used/available.

Research required:

- reliable context usage retrieval for Claude Code, Codex CLI, Gemini CLI.
- whether hooks expose this in structured payloads.
- whether terminal parsing is reliable enough or should be avoided.

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

### Components

- [ ] `RightAgents`
- [ ] `AgentStatusRow`
- [ ] `AgentPauseToggle`
- [ ] `AgentContextMeter`
- [ ] `AgentAccessSelect`
- [ ] `AgentMentionPopover`
- [ ] `AgentMentionToken`
- [ ] `AccessRequestCard`

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
- [ ] Mention metadata in prose/comment schemas.
- [ ] Access request/response event routes.
- [ ] WS broadcasts for agent state changes.
- [ ] Tests for paused agents not receiving wake.
- [ ] Tests for mention-targeted wake.
- [ ] Tests for random display name persistence.
- [ ] Tests for access request state transitions.

## Vendor Research Checklist

Create a dedicated research pass before implementing context/access/compact/clear for all vendors:

- [ ] Claude Code context used/available retrieval.
- [ ] Codex CLI context used/available retrieval.
- [ ] Gemini CLI context used/available retrieval.
- [ ] Claude Code access/permission modes and live change support.
- [ ] Codex CLI access/approval/sandbox modes and live change support.
- [ ] Gemini CLI trust/access/approval modes and live change support.
- [ ] Claude compact/clear commands and safe timing.
- [ ] Codex compact/clear commands and safe timing.
- [ ] Gemini compact/clear commands and safe timing.
- [ ] Structured permission/access request detection for each runtime.

Until verified, UI should show unsupported/unknown states instead of pretending.
