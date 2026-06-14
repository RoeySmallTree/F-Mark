# F-Mark UI/Backend Integration Research

Date: 2026-05-25

Scope: local-code research for F-Mark frontend/backend integration gaps around session forking, sub-agent streaming presentation, agent state, and listeners. This pass intentionally does not update the master plan or any other planning files.

## Executive summary

- Session forking mostly fits the existing session/path route shape, but it needs a real fork service and a path-aware route. The current `POST /sessions` flow already handles active path, registration, MRU, and `PathContextRef`; `POST /sessions/:id/fork` should reuse that machinery rather than invent a second path model.
- The largest backend integration gap is managed-agent active-session state. Managed-agent spawn writes `active-session` through `agentsDirFor(...)`, while participants, `/agents/:id/link`, and hooks still read or write legacy `.f-mark/agents/...` paths. Fork handoff will be unreliable until this storage and resolver split is fixed.
- The frontend changes are concentrated in the sessions panel, composer, API client, app-level WS handling, top bar participant/agent state, and a small shared fork popup state. The current composer draft state is local and should survive a session switch as long as the composer is not remounted or cleared.
- Nested sub-agent boxes should be hosted by the existing feed projection and arbitrary group card path: `projectFeed(...)` groups live mid-turn output, and `ArbitraryGroupCard` is already the card that renders a streaming assistant turn. This avoids major churn in the top-level feed.
- The easiest event model to render cleanly is explicit sub-agent event kinds that still use the parent F-Mark participant as the durable `participant_id`. This preserves event writer validation, keeps sub-agents out of participant chips, and lets the renderer nest by `parent_tool_use_id` and `subagent_id`.
- Current planning files under `planning/mcp/` are dirty or untracked. Future plan edits should be narrow and should avoid broad rewrites to prevent overwriting concurrent planning work.

## Backend impact map with file references

### Session fork route and folder copying

- `packages/kernel/src/routes/sessions.ts:57` defines `SessionRouteDeps` with `fallback` and `ref`; `packages/kernel/src/routes/sessions.ts:88` lists sessions across active, known, favorite, registered, and fallback paths. This is the right place to add `POST /sessions/:id/fork`, because the route already understands multi-path session listing and response enrichment with `path` and `path_id`.
- `packages/kernel/src/routes/sessions.ts:198` implements `POST /sessions`. It already validates optional `body.path`, registers the path, updates active path state, bumps revision, and creates the session under the selected path. Fork should reuse the same source-path validation and active-path update semantics.
- `packages/kernel/src/sessions.ts:50` has `createSession(...)`; `packages/kernel/src/sessions.ts:68` has `listSessions(...)`; `packages/kernel/src/sessions.ts:88` has `sessionExists(...)`. There is no copy/fork helper yet. Add either `forkSession(...)` here or a small service module that:
  - Resolves the source session directory under the requested source path.
  - Allocates a unique target session id using the same slug normalization rules as `createSession`.
  - Copies the source directory into a temporary target under the same `sessionsDir`, then atomically renames it.
  - Writes `.fork.json` metadata with source session id, source path id, requested label, created time, and selected handoff mode.
  - Never mutates the source session folder.
- `packages/kernel/src/state/store.ts:10` defines active path, active revision, known paths, and favorites; `packages/kernel/src/state/store.ts:62` serializes state updates; `packages/kernel/src/state/store.ts:96` maintains MRU. Forking from a session row in `scope=all` should use these helpers when the forked session belongs to a path that is not currently active.
- `packages/kernel/src/paths/active.ts:14` resolves active paths; `packages/kernel/src/paths/registry.ts:6` registers project paths. Fork should register the source/target project path before returning.
- `packages/kernel/src/server.ts:211` wires session routes with `pathDeps`, but `registerSessionRoutes(...)` currently does not receive `tmux` or `bus` directly. If fork is responsible for switching active path and notifying other clients, `SessionRouteDeps` needs either a bus getter and tmux getter, or the route must delegate path switching to existing `/paths/active`. Backend-owned switch is cleaner for cross-tab consistency.
- `packages/kernel/src/routes/paths.ts:148` is the existing active-path switch. It validates the path, updates state/ref, rebinds tmux, and broadcasts `path-switched`. Fork should mirror this behavior if it activates the fork path.
- `packages/kernel/src/ws/bus.ts:7` does not currently include a session fork message. Add a `session.forked` or `session.created` WS message so non-initiating tabs can refresh session lists. If fork switches paths, keep `path-switched` as the authoritative path message and add the fork message for list refresh.

### Managed-agent handoff and active-session state

- `packages/kernel/src/routes/managedAgents.ts:179` spawns managed agents. It writes the active session when `body.session_id` is provided, stores tmux/runtime data, sends a kickoff prompt through `InputQueue`, and broadcasts `managed-agent.spawned`.
- `packages/kernel/src/routes/managedAgents.ts:399` lists managed agents, but the response does not include `active_session`, paused/detached status, display name, runtime session id, context access, or handoff state. Fork UI needs either this route enriched or a dedicated status route to decide which agents can be handed off and to display warnings.
- `packages/kernel/src/agents/managed.ts:14` manages `tmux-session` and `runtime` files only. It has no durable managed-agent state file. Add a small state record if the plan needs paused, detached, killed, context-access, last-handoff, or runtime-session metadata.
- `packages/kernel/src/agents/activeSession.ts:6` provides active-session read/write helpers. These are good primitives, but callers currently disagree about which agents directory to use.
- `packages/kernel/src/agents/locator.ts:17` returns the global per-project agents directory when a `PathContextRef` is available, and legacy `.f-mark/agents` otherwise. This should become the single source of truth for all active-session reads and writes.
- Integration blocker: `packages/kernel/src/routes/managedAgents.ts:140` writes through `agentsDirFor(...)`, but `packages/kernel/src/routes/participants.ts:176`, `packages/kernel/src/hooks/autoStream.ts:202`, and `packages/kernel/src/routes/agents.ts:16` still use legacy `.f-mark/agents`. Fork handoff can update one location while participants and hooks read another. Fix this before relying on forked-session output routing.
- `packages/shared/src/managedAgents.ts:42` defines managed-agent API types and `packages/shared/src/managedAgents.ts:103` defines the spawned WS shape. `ManagedAgent` should grow `active_session` and state fields, or a new status type should be introduced. Add a `managed-agent.updated` message for handoff, pause, detach, and reconnect changes.
- The current spawn env includes `F_MARK_RUNTIME_ID` and `F_MARK_SESSION_ID` in `managedAgents.ts`, while `TmuxManager` adds `F_MARK_PATH` and `F_MARK_AGENT_ID`. Planning references to `F_MARK_PARTICIPANT_ID` should either be reconciled with the current `F_MARK_AGENT_ID` or added as an alias.

### Hook, listener, and output routing

- `packages/kernel/src/hooks/autoStream.ts:202` already prefers an existing `active-session` pointer before env `F_MARK_SESSION_ID`. This is the right behavior for fork handoff: once the pointer is updated, later output should land in the fork even if the old env var is stale.
- The same resolver currently reads legacy `.f-mark/agents`, so the active-session directory mismatch is the main blocker. After centralization, add a regression test proving that stale `F_MARK_SESSION_ID` does not override the fork pointer.
- `packages/kernel/src/hooks/post.ts:18` posts projected events through REST and includes `path` in the payload. That supports path-aware event writes, but it currently only knows prose, tool-use, and turn-end projection.
- `packages/kernel/src/hooks/transcript.ts:1` defines only `text` and `tool_use` turn blocks; `packages/kernel/src/hooks/projectTurn.ts:14` projects only prose and tool-use. Sub-agent capture requires a parser/projection layer that can emit explicit sub-agent run/output events or metadata before posting.
- `packages/kernel/src/routes/events.ts:31` exposes the current event routes. It has no sub-agent event endpoint or schema. The route can support new event kinds with the existing writer/reader pattern once `EventKind` and validation are updated.
- `packages/kernel/src/events/writer.ts:48` validates `participant_id` against known participants. To avoid creating durable participant rows for ephemeral sub-agents, write sub-agent events under the parent managed agent participant id and put sub-agent identity in the JSON payload.
- `packages/shared/src/events.ts:1` defines the canonical `EventKind` union. Any sub-agent event kind must start here, then flow through kernel schemas and renderer cards.

## Frontend impact map with file references

### API, shared state, and app-level refresh

- `packages/renderer/src/api/client.ts:19` defines `SessionMeta`; `packages/renderer/src/api/client.ts:170` defines the client interface; `packages/renderer/src/api/client.ts:290` implements session methods. Add `forkSession(sourceSessionId, body)` with response fields matching the backend fork response, including `id`, `slug`, `path`, `path_id`, `source_session_id`, `copied_events`, and warnings.
- `packages/renderer/src/state/store.ts:32` defines modal keys, and `packages/renderer/src/state/store.ts:45` defines popover keys without payload storage. The shared fork popup should either add a small dedicated fork-flow slice, such as `{ anchorRect, sourceSession, sourcePath, mode }`, or add payload-aware popover state. A dedicated slice is less invasive than forcing payload into the generic popover model.
- `packages/renderer/src/state/store.ts:212` clears events when `setCurrentSession(...)` changes. It does not clear composer content. That is good for preserving drafts, but tests should lock it down.
- `packages/renderer/src/state/store.ts:292` handles `managed-agent.spawned` but drops `active_session` from managed-agent state. Update this path when adding `managed-agent.updated` or richer status events.
- `packages/renderer/src/App.tsx:239` owns the WS subscription. It handles `path-switched`, current `event_added`, and current managed-agent messages. Add handling for `session.forked` and `managed-agent.updated`, and refresh sessions, participants, and managed-agent status after successful fork or after relevant WS messages.
- `packages/renderer/src/api/managedAgents.ts` should be extended if the backend adds a status route or enriches list responses.

### Session row fork button and cross-path switching

- `packages/renderer/src/panels/Sessions.tsx:136` refreshes all sessions; `packages/renderer/src/panels/Sessions.tsx:171` handles row selection and cross-path switching; `packages/renderer/src/panels/Sessions.tsx:347` renders each session row. Add a row-level fork icon button here.
- The row fork button must stop propagation so clicking it does not select the source session. Keyboard handling should also avoid accidentally triggering row selection.
- The row already carries session `path` and `path_id` for all-session results. Pass that source path into the fork request so the backend can fork a session that is not under the current active path.
- On fork success, switch to the forked session, refresh local sessions and all sessions, refresh participants, and refresh managed-agent status. If the backend returns a path different from the current active path, use the response path/path_id to drive the switch rather than guessing from local state.

### Composer fork button and draft preservation

- `packages/renderer/src/compose/Compose.tsx:66` stores composer content and name locally. `packages/renderer/src/compose/Compose.tsx:275` consumes `composeDraft` as an insertion queue, not durable draft storage.
- The composer action row at `packages/renderer/src/compose/Compose.tsx:372` is the right place for a fork icon button. Disable it when there is no current session.
- Forking from the composer should not call the submit path and should not clear `content` or `name`. The current submit path clears content at `packages/renderer/src/compose/Compose.tsx:120`; the fork flow must stay separate.
- If the shared popup or layout remounts the composer, draft preservation becomes fragile. Either keep the popup outside the composer subtree or lift draft state into the store before changing mount behavior.

### Top bar agent state and warnings

- `packages/renderer/src/shell/TopBar.tsx:224` passes the current session id when spawning a managed agent. `packages/renderer/src/shell/TopBar.tsx:181` upserts the participant with `active_session` from spawn response. This is the pattern fork handoff should reuse for moved agents.
- `packages/renderer/src/shell/TopBar.tsx:304` filters chips by `participant.active_session === currentSessionId`. After fork handoff, participant state must be refreshed or updated by WS so chips move to the forked session.
- `packages/renderer/src/components/AgentChip.tsx` can remain mostly presentational. Warnings about skipped handoff, paused agents, disconnected agents, or missing MCP support are better shown in the fork popup result or a small top-bar warning state.
- `packages/renderer/src/components/AgentActionMenu.tsx` already exposes command/reconnect actions. Fork warnings can point users to reconnect without creating a separate agent-control surface.

## Event/rendering model recommendation

### Host nested sub-agent boxes in existing group rendering

- Keep `packages/renderer/src/shell/Feed.tsx` as the top-level feed orchestrator. It already calls `aggregate(events)` and `projectFeed(slice)` before rendering cards.
- Extend `packages/renderer/src/feed/projectFeed.ts`. Its `isMidTurn(...)` function currently groups arbitrary prose and tool-use as streaming turn content. Treat sub-agent run/output events as mid-turn items so they stay inside the parent assistant turn.
- Render nested boxes in `packages/renderer/src/cards/ArbitraryGroupCard.tsx`. This card already renders streaming assistant groups and opens live groups by default. Add a `SubagentBox` child component here or nearby, and let it reuse existing `EventCard`/`ToolUseCard` rendering for nested items.
- Keep a fallback in `packages/renderer/src/cards/EventCard.tsx` for orphaned sub-agent events, but the normal path should be nested under `ArbitraryGroupCard`.
- Add styles near the existing arbitrary group and tool-use styles in `packages/renderer/src/cards/cards.css`.

### Recommended event shape

Use explicit sub-agent events, but keep the durable event `participant_id` as the parent managed agent:

```json
{
  "kind": "subagent-output",
  "participant_id": "agent-reviewer",
  "payload": {
    "parent_participant_id": "agent-reviewer",
    "parent_tool_use_id": "toolu_123",
    "subagent_id": "task_456",
    "subagent_name": "Research",
    "sequence": 3,
    "status": "streaming",
    "item": {
      "kind": "prose",
      "content": "Found the relevant route and state split.",
      "arbitrary": true
    }
  }
}
```

Add a companion run/status event:

```json
{
  "kind": "subagent-run",
  "participant_id": "agent-reviewer",
  "payload": {
    "parent_participant_id": "agent-reviewer",
    "parent_tool_use_id": "toolu_123",
    "subagent_id": "task_456",
    "subagent_name": "Research",
    "status": "started"
  }
}
```

Why this is the least disruptive path:

- It satisfies `events/writer.ts` participant validation because the filename participant is still the parent participant.
- It avoids adding ephemeral sub-agents to `/participants`, presence chips, or managed-agent lists.
- `projectFeed(...)` only needs to classify two new kinds as mid-turn.
- `ArbitraryGroupCard` can derive nested runs from `group.items` without changing the whole feed card API.
- The hook side can start with final-result-only events and later stream progressive output by appending `subagent-output` events with increasing `sequence`.

Avoid putting all sub-agent data only inside `ToolUsePayload.result` unless the initial implementation intentionally supports final summaries only. That is the lowest-churn rendering option, but it will be harder to evolve into live nested streaming and status.

## Specific implications for planning files

### Dirty planning context

The working tree currently has modified planning docs and untracked planning docs:

- Modified: `planning/mcp/agent-control-and-targeting.md`
- Modified: `planning/mcp/compass-flow.md`
- Modified: `planning/mcp/plan.md`
- Modified: `planning/mcp/ux-flow.md`
- Untracked: `planning/mcp/session-forking.md`
- Untracked: `planning/mcp/subagent-streaming.md`

Treat these as active concurrent edits. Future plan updates should be surgical and should not normalize formatting or rewrite unrelated sections.

### `planning/mcp/plan.md`

- Phase 3.7 currently covers session fork backend. It should explicitly include the active-session storage unification before managed-agent handoff is considered complete.
- Phase 3.7 should call out source-path validation for `scope=all` rows and cross-path fork behavior.
- Phase 3.7 should add WS outcomes: `path-switched` when the active path changes and `session.forked` or equivalent when a fork is created.
- Phase 6.6 currently covers fork UI. It should include a shared fork-flow state/popup used by both sessions rows and the composer.
- Phase 6.6 should say composer drafts must be preserved and should not rely on `composeDraft` as persistent draft storage.
- Phase 8.5 should state that sub-agent rendering lives in `projectFeed` and `ArbitraryGroupCard`, not as independent top-level cards by default.
- The test plan should add cross-path fork tests, active-session resolver tests, and renderer group/card tests for sub-agent nesting.

### `planning/mcp/session-forking.md`

- The planned active-session write path should be updated from a hard-coded `.f-mark/agents/<id>/active-session` to a single resolver/writer based on `agentsDirFor(...)`, with legacy fallback only where needed.
- The backend checklist should include a migration/compatibility note for existing legacy active-session pointers.
- The frontend checklist should add explicit refresh requirements: local sessions, all sessions, participants, managed-agent status, and current session events after switching.
- The managed-agent handoff section should distinguish "update active-session pointer" from "tell the live runtime to continue in the fork". The former is necessary for hooks; the latter needs InputQueue/runtime capability and should produce warnings if unavailable.

### `planning/mcp/subagent-streaming.md`

- The event model should specify that sub-agent events use the parent participant id for storage and carry sub-agent identity in payload.
- The renderer checklist should name `projectFeed.ts`, `ArbitraryGroupCard.tsx`, `EventCard.tsx` fallback, and `cards.css`.
- The capture checklist should include fixtures for final-only and progressive sub-agent output.
- The duplication strategy should be explicit. If sub-agent final output is already present in parent prose/tool result, the projection layer must avoid rendering the same text twice.

### `planning/mcp/ux-flow.md` and `planning/mcp/compass-flow.md`

- Reconcile env naming: current code uses `F_MARK_AGENT_ID`; planning references to `F_MARK_PARTICIPANT_ID` should either add an alias or use current naming consistently.
- Add the storage split as a UX risk: chips and output can disagree unless participants and hooks read the same active-session location that managed-agent spawn writes.
- For fork UX, include cross-path source sessions from "all sessions" and make clear that the backend response is the source of truth for the target path/session.

## Concrete recommended plan edits/bullets

### Backend bullets to add

- Add `POST /sessions/:id/fork` in `packages/kernel/src/routes/sessions.ts`, with `body.path` accepted for all-session row forks and response fields that include target session id, target path, source session id, copied counts, handoff result, and warnings.
- Add a session fork service around `packages/kernel/src/sessions.ts` that copies source session folders via temp directory plus atomic rename, writes `.fork.json`, and never mutates the source folder.
- When a fork targets a path that is not active, update kernel state/ref/MRU/registry using the same semantics as `POST /sessions` and `/paths/active`; rebind tmux if the route owns the switch.
- Add a `session.forked` WS message and reuse `path-switched` when active path changes.
- Centralize managed-agent active-session storage and lookup through `agentsDirFor(...)` or a new resolver. Update managed-agent spawn, participants listing, hooks, and `/agents/:id/link` to use the same resolver.
- Add managed-agent status fields or a status route that exposes `active_session`, alive/detached/paused state, runtime id/session, context-access mode, and last handoff warning.
- Implement fork handoff in two phases: update active-session pointer first, then send runtime handoff instructions through `InputQueue` only for live eligible agents. Return warnings for skipped agents.
- Extend shared event types and kernel event routes for `subagent-run` and `subagent-output`, using parent participant ids for event storage.
- Extend hook transcript/projection/post code to emit sub-agent events from fixtures before wiring broader MCP/runtime streaming.

### Frontend bullets to add

- Add `client.forkSession(...)` and shared fork response/warning types in `packages/renderer/src/api/client.ts`.
- Add a shared fork popup state and component that can be opened from `Sessions.tsx` row actions and from the composer action row.
- Add a session-row fork icon button that stops propagation and passes the row's session id plus path into the fork flow.
- Add a composer fork icon button that uses the current session, does not submit, and preserves `content` and `name` draft state.
- After successful fork, set the forked session current, switch to the returned path if needed, refresh sessions/all sessions, participants, managed-agent status, and events.
- Handle `session.forked` and `managed-agent.updated` WS messages in `App.tsx`.
- Update top-bar participant/agent state so chips move when an agent's `active_session` changes after fork handoff.
- Render handoff warnings in the fork popup result or a small top-bar warning surface, with reconnect actions delegated to existing agent controls.
- Add sub-agent nesting in `projectFeed.ts` plus `ArbitraryGroupCard.tsx`, with an `EventCard` fallback for orphaned events.

### Tests to add or extend

- Extend `packages/kernel/tests/routes/sessions.test.ts` for fork creation, copy immutability, `.fork.json`, invalid source/path, cross-path active switch, registry/MRU updates, and WS publication.
- Extend `packages/kernel/tests/sessions.test.ts` for fork service copy semantics and target id uniqueness.
- Extend `packages/kernel/tests/routes/managedAgents.test.ts` for handoff eligibility, active-session pointer update, warnings, and status fields.
- Add or extend active-session resolver coverage so managed-agent spawn, participants, hooks, and `/agents/:id/link` agree on the same location in multi-path mode.
- Extend `packages/kernel/tests/hooks/autoStream.test.ts` to prove an updated active-session pointer routes output to the fork even when `F_MARK_SESSION_ID` still points to the source.
- Extend `packages/kernel/tests/hooks/transcript.test.ts`, `packages/kernel/tests/hooks/projectTurn.test.ts`, and post/event route tests for final-only and progressive sub-agent fixtures.
- Extend `packages/renderer/tests/panels/sessions.test.tsx` for the row fork button, stop-propagation behavior, source path request body, and refresh/switch behavior.
- Extend `packages/renderer/tests/compose.test.tsx` for composer fork and draft preservation.
- Extend `packages/renderer/src/feed/projectFeed.test.ts` for sub-agent events grouped as mid-turn items.
- Extend `packages/renderer/src/cards/ArbitraryGroupCard.test.tsx` for nested sub-agent boxes, status display, and fallback/error states.
- Add API client coverage for `forkSession(...)` and managed-agent status/update messages.
