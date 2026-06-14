# F-Mark Session Forking Plan

> Date: 2026-05-25  
> Purpose: define a user-visible F-Mark session fork flow that duplicates session state, moves the user into the fork, and reorients managed agents plus MCP/listeners to the new session.

## Product Goal

Forking should feel like creating a branch of the current collaboration.

The user should be able to fork from:

- a session item in the Sessions panel,
- the composer pane for the active session.

The fork should:

- duplicate the source session folder,
- register the new session anywhere session discovery/state needs it,
- switch the UI to the fork,
- relaunch or rebind active managed agents to the fork,
- invoke the runtime-native fork/branch mechanism when supported,
- make MCP calls and stream listeners write to the new session without agents passing new tokens/session ids manually.

Research inputs now integrated:

- `planning/mcp/research-mcp-kernel-architecture.md`: fork handoff requires a single canonical active-session store because participants, managed agents, hooks, and link routes currently read/write different `agents` paths.
- `planning/mcp/research-fmark-ui-backend-integration.md`: the backend route belongs in `packages/kernel/src/routes/sessions.ts`, the service should live in or near `packages/kernel/src/sessions.ts`, and the UI should add `forkSession` in `packages/renderer/src/api/client.ts`.
- `planning/mcp/research-claude-runtime.md`: Claude native branch support is `/branch [name]`, with `/fork` as a context-dependent alias; CLI resume/fork/name requires smoke tests.
- `planning/mcp/research-codex-runtime.md`: Codex has `/fork` and `codex fork`, but no CLI name flag.
- `planning/mcp/research-gemini-runtime.md`: Gemini has no `/fork` or `/branch`; checkpoint resume may approximate branch after smoke tests, but F-Mark-owned handoff is v1.

## UX Entry Points

### Session List Button

Add a small icon button to each session row in `Sessions`.

Behavior:

- The button must not trigger row selection. It should call `stopPropagation`.
- It opens a small name popup anchored to the row action.
- The popup title is `Fork session`.
- Default name is derived from the source slug, for example `<slug>-fork`.
- Primary action is `Fork`.
- While forking, disable the row button and show busy state.
- On success, refresh sessions and switch to the new fork.

Suggested icon:

- Use a lucide branching/fork icon such as `GitBranch` or `GitFork`.

### Composer Button

Add a compact icon button in the composer action area for the active session.

Behavior:

- The button is disabled when there is no active session.
- It opens the same small name popup.
- Default name is derived from the current session slug.
- The action forks the current session and switches into the fork.
- The composer draft should remain intact unless the fork request fails before session switch. After successful switch, keep the draft text in the composer so the user can continue in the fork.

The popup should stay small. V1 should ask only for the fork name. Advanced options can be added later.

## Backend Route

Add:

```text
POST /sessions/:id/fork
```

Implementation location:

- Route: `packages/kernel/src/routes/sessions.ts`, reusing current `SessionRouteDeps`, path validation, active path registration, MRU update, and response shapes from existing session create/list routes.
- Service: `packages/kernel/src/sessions.ts` or `packages/kernel/src/services/sessionForks.ts`, responsible for source directory resolution, unique slug/id allocation, temp copy plus atomic rename, and `.fork.json` writing.
- Broadcasts: publish `session.forked` or an equivalent session-created event, plus `managed-agent.updated` for agent handoff. If active path changes, reuse the existing `path-switched` behavior where applicable.

Request:

```ts
interface ForkSessionRequest {
  path?: string;
  name?: string;
  relaunch_agents?: boolean;
  agent_ids?: string[];
}
```

Defaults:

- `path`: active path, or the source session path when forking from all-sessions UI.
- `name`: `<source-slug>-fork`.
- `relaunch_agents`: `true`.
- `agent_ids`: active managed agents linked to the source session.

Response:

```ts
interface ForkSessionResponse {
  source_session_id: string;
  session: {
    id: string;
    slug: string;
    created_at: string;
    path: string;
    path_id: string;
  };
  copied_entries: number;
  agents: ForkedAgentResult[];
  warnings: string[];
}

interface ForkedAgentResult {
  participant_id: string;
  runtime_id: string | null;
  display_name: string;
  status:
    | "rebound"
    | "relaunched"
    | "skipped-paused"
    | "skipped-detached"
    | "failed";
  tmux_session?: string | null;
  native_command?: string | null;
  warning?: string;
}
```

## Session Duplication Semantics

Forking duplicates the source session folder:

```text
.f-mark/sessions/<source-session-id>/
```

to:

```text
.f-mark/sessions/<new-session-id>/
```

Rules:

- Copy event files, html/embed directories, file attachments, and any session-local assets.
- Use a temp directory plus atomic rename where possible.
- Never mutate the source session.
- Preserve participant ids in copied event filenames and payloads.
- Allocate the new session id with the same uniqueness rules as `createSession`.
- Use the requested name as the slug base.
- Write fork metadata inside the new session folder as a hidden metadata file ignored by `readEvents`, for example:

```text
.f-mark/sessions/<new-session-id>/.fork.json
```

Suggested metadata:

```ts
interface ForkMetadata {
  schema: "fmark.session-fork.v1";
  source_session_id: string;
  source_path: string;
  forked_at: string;
  requested_name: string;
  copied_head?: string;
  agent_participant_ids: string[];
}
```

Registration requirements:

- In the current implementation, the session folder is the session registration because `listSessions` scans `.f-mark/sessions`.
- Still update any path-level state needed for visibility: active path, MRU, project path registry, and path id response fields.
- If a future explicit session registry exists, write the fork into that registry in the same transaction.

## Agent Fork Handoff

V1 contract:

- Forking moves active managed agents from the source session into the fork.
- "Active" means managed, linked to the source session, connected/running or idle, and not paused.
- Paused agents are not woken or relaunched. Keep their paused state and show `skipped-paused`.
- Detached/offline agents are not relaunched automatically unless the user explicitly selected them later.

For each active managed agent:

1. Record current participant id, runtime id, display name, tmux session, and runtime session identity.
2. Update the canonical `AgentStateStore` active-session pointer to the new fork.
3. Bridge/write legacy `.f-mark/agents/<participant-id>/active-session` only through that shared store until old callers are migrated.
4. Set `runtime_session.desired_name` to the new fork session id.
5. Change MCP context resolution so subsequent tool calls default to the new fork.
6. Change stream listener/hook resolution so subsequent output lands in the new fork.
7. Relaunch or rebind the agent runtime according to runtime capability.
8. Send a compact fork handoff prompt.

Fork handoff prompt:

```text
F-Mark fork handoff
You are now working in forked session <new-session-id>, forked from <source-session-id>.
Your F-Mark display name is <display-name>.
Use the F-Mark MCP tools from server `f-mark`.
Default all F-Mark writes to the new forked session.
Call fmark_get_inbox if you need the bounded delta.
```

## Runtime-Native Fork Or Branch Command

Research-backed capability snapshot:

- Claude: use `/branch [name]` after a managed-pane smoke test. `/fork` may be an alias in some contexts, but should not be the production default without verification. `claude --resume <source> --fork-session --name <new-name>` is promising for relaunch flows and must be smoke-tested.
- Codex: `/fork` and `codex fork [SESSION_ID] [PROMPT]` exist. No CLI branch/name flag was found, so the F-Mark fork session id remains `runtime_session.desired_name` unless a future app-server path sets the native thread name.
- Gemini: no `/fork` or `/branch`. Checkpoint commands `/resume save <name>` and `/resume resume <name>` may approximate a branch, but v1 should use F-Mark session copy plus handoff prompt.

Add a runtime capability table:

```ts
interface RuntimeForkCapability {
  supports_native_fork: boolean;
  command?: string;
  command_accepts_name: boolean;
  requires_relaunch: boolean;
  can_rebind_existing_process: boolean;
}
```

Behavior:

- If a runtime supports a native fork command, send the verified command through the tmux input queue.
- If the command accepts a name/title, use the new F-Mark session id.
- If the runtime requires relaunch, start a replacement process bound to the new fork session.
- If no native fork exists, still fork the F-Mark session and reorient MCP/hooks to the fork; the agent receives the fork handoff prompt and uses the copied F-Mark session as context.

Do not guess the command in production. Until a runtime's smoke test passes, use capability `supports_native_fork: false` and rely on the F-Mark fork handoff prompt.

## Relaunch Versus Rebind

The implementation may differ by runtime, but the product contract is stable:

- After fork, active managed agents continue in the new F-Mark session.
- MCP tools default to the new session.
- Hook/listener output writes to the new session.
- The right-pane Agents tab shows each active agent attached to the fork.

Preferred v1 path:

1. If runtime can rebind in-place, keep the existing tmux pane, send the native fork/branch command if supported, update active-session, then send the handoff prompt.
2. If runtime cannot rebind cleanly, relaunch the same participant/runtime into a replacement managed pane bound to the fork. Do not run two live panes for the same participant id unless we first implement cloned participant identities.
3. If relaunch fails after session copy succeeds, keep the fork, show warnings, and keep the agent detached from the fork with a reconnect action.

## MCP And Listener Requirements

MCP context must not cache the source session forever.

Prerequisite:

- Implement the canonical active-session resolver from `planning/mcp/research-mcp-kernel-architecture.md` before shipping fork handoff. This resolver must be used by participants, `/agents/:id/link`, managed-agent status, hooks, fork handoff, MCP context, and wake routing.

Resolution order after this change:

1. Explicit `session_id` in tool input.
2. Managed-agent state `active_session`.
3. `.f-mark/agents/<participant-id>/active-session`.
4. Connection/session env fallback.

Stream hook/listener behavior:

- Hook resolution must prefer the active-session pointer over stale env `F_MARK_SESSION_ID`.
- Any pane listener keyed to old session state must update its target session after fork.
- WS events should publish agent state changes so chips and the Agents tab refresh.

## Frontend Implementation Checklist

- [ ] Add `forkSession(sourceSessionId, body)` to renderer API client.
- [ ] Add session row fork icon button with `stopPropagation`.
- [ ] Add composer fork icon button.
- [ ] Build shared `ForkSessionPopover`.
- [ ] Default popup name from source slug.
- [ ] Keep composer draft after successful fork.
- [ ] Disable fork action when no session is active.
- [ ] Disable repeated fork clicks while request is in flight.
- [ ] Refresh session list after success.
- [ ] Switch current session to the fork after success.
- [ ] Refresh participants and agent statuses after success.
- [ ] Show warnings for skipped/failed agent handoff.
- [ ] Add tests for row button not selecting the source session.
- [ ] Add tests for composer button using current session.

## Backend Implementation Checklist

- [ ] Add session fork service.
- [ ] Add route `POST /sessions/:id/fork`.
- [ ] Validate source session id and path.
- [ ] Allocate unique target session id from requested name.
- [ ] Copy session folder via temp directory then rename.
- [ ] Write `.fork.json` metadata.
- [ ] Update path registry/MRU/active path state as needed.
- [ ] Broadcast `session.forked` or equivalent session-created update.
- [ ] Find active managed agents linked to the source session.
- [ ] Update active-session pointers to the fork through canonical `AgentStateStore`.
- [ ] Update managed-agent state with `active_session` and `runtime_session.desired_name`.
- [ ] Rebind or relaunch agents by runtime capability.
- [ ] Send runtime-native fork/branch command only when verified.
- [ ] Send fork handoff prompt through input queue.
- [ ] Publish WS state updates.
- [ ] Add tests for copy integrity and source immutability.
- [ ] Add tests for MCP context defaulting to the new fork after handoff.
- [ ] Add tests for hook/listener output landing in the fork after handoff.
- [ ] Add tests for paused/detached agents being skipped.

## Open Questions

- Should Claude `/branch` and Codex `/fork` be enabled in v1 after smoke tests, or kept behind an experimental flag while F-Mark handoff remains default?
- Should Gemini checkpoint resume become an optional branch mechanism if smoke tests prove stable session/transcript behavior?
- Should v1 move active agents to the fork, or later support cloned agents so source and fork can both keep live panes?
- Should `.fork.json` be enough metadata, or do we also want a visible system event in the fork feed?
