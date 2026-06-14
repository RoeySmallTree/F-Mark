# F-Mark Agent Compass Flow

> Date: 2026-05-25  
> Purpose: describe the full managed-agent experience as a compass: what the user sees, what the agent receives, what gets streamed, and which planning pieces own each part.

## North Star

The user should feel like they are adding a collaborator, not configuring a protocol.

The agent should feel continuously situated:

- I am inside an F-Mark session.
- I have F-Mark MCP tools.
- I know my participant id and active session.
- F-Mark knows my runtime session id when the runtime exposes it.
- I know what changed since I last acted.
- I should use MCP tools for deliberate writes.
- My ordinary terminal/tool output is being streamed by F-Mark.

Research inputs now integrated:

- `planning/mcp/research-mcp-kernel-architecture.md`: MCP protocol session ids and F-Mark collaboration session ids are different; tool context must resolve F-Mark session defaults through managed-agent state, not MCP transport session ids.
- `planning/mcp/research-fmark-ui-backend-integration.md`: fork, sub-agent rendering, and status refresh touch both backend routes and renderer feed grouping.
- `planning/mcp/research-claude-runtime.md`, `planning/mcp/research-codex-runtime.md`, and `planning/mcp/research-gemini-runtime.md`: vendor runtime ids, context, access, compact/clear, native fork, and sub-agent behavior differ enough that the compass must use capability flags instead of assuming parity.

## End-To-End User Flow

### 1. User Creates An Agent

Interaction:

1. User clicks `+`.
2. User chooses `Claude`, `Codex`, or `Gemini`.
3. F-Mark runs preflight before launching anything.
4. If setup is clean, F-Mark launches immediately.
5. If setup is missing/stale/blocked, F-Mark opens the setup sheet.
6. User chooses **Locally** or **Globally**.
7. User clicks **Install and launch** or **Update and launch**.
8. F-Mark applies MCP + stream hook setup where safe.
9. F-Mark launches the agent in tmux and links it to the current session.
10. If the runtime supports naming its native session at launch, F-Mark names that vendor session with the active F-Mark `session_id`.

What the user sees:

- Runtime row selected.
- Setup sheet only if needed.
- Status rows for runtime, MCP tools, stream capture.
- Local/global scope options with exact config path.
- Version indicators and update prompts.
- Agent chip appears only after launch begins.

What the agent receives:

- Environment:
  - `F_MARK_SESSION_ID`
  - `F_MARK_PARTICIPANT_ID`
  - `F_MARK_RUNTIME_ID`
  - `F_MARK_PATH`
- First prompt injected by F-Mark containing:
  - participant id
  - session id
  - current project path
  - full MCP-only `/guide`
  - a compact "current compass" packet with the session state

Planning owner:

- `planning/mcp/ux-flow.md`: setup-first UX.
- `planning/mcp/plan.md`: preflight/apply/spawn route changes, MCP install modules, first-prompt injection.

Flow-discovered refinement:

- Add an explicit "compass packet" to the first prompt, not only `/guide`.
- Store participant/session defaults server-side so MCP calls do not require session/auth token inputs.
- Runtime session identity is learned after launch from hook payloads or MCP handshake/status, then stored in managed-agent state for reconnect, diagnostics, and right-pane display. Do not block first launch on knowing this id.
- Store the active F-Mark `session_id` as `runtime_session.desired_name` before launch. Pass it as the vendor-native session name/title only when the runtime supports it:
  - Claude: pass through `--name`.
  - Codex: no CLI name setter found; keep desired name only unless app-server is later adopted.
  - Gemini: no human-readable name setter found; keep desired name only.

### 2. Agent Says Hello

Interaction:

1. The injected guide tells the agent to use F-Mark MCP tools.
2. Agent calls `fmark_post_prose` with a short hello.
3. Agent calls `fmark_end_turn`.
4. Renderer shows the hello as a normal agent message.
5. Hook may also stream ordinary terminal text, but duplicate final prose should be suppressed when the same turn already posted deliberate MCP prose.

What the user sees:

- Agent chip transitions from `launching` to `ready`.
- A normal message appears:
  - "Connected. I am in this session and ready."
- A turn boundary appears subtly if useful; it should not be noisy.

Planning owner:

- `planning/mcp/plan.md`: MCP tools, guide changes, hybrid hook/MCP behavior.
- `planning/mcp/ux-flow.md`: first prompt injection and duplicate mitigation.

Flow-discovered refinement:

- Add a server-maintained "turn activity" record keyed by participant/session/current runtime turn. If MCP deliberate prose exists in the turn, the hook should avoid posting duplicate final prose.

### 3. User Sends A Message

Interaction:

1. User writes in the composer.
2. F-Mark writes user prose to the session log.
3. F-Mark updates per-agent unread cursors for active unpaused agents in the session.
4. F-Mark computes a wake packet for target agents.
5. F-Mark sends the wake packet to each managed agent's tmux pane.

What the user sees:

- Their message appears immediately.
- Agent chip can show `notified` or `thinking` once the wake is delivered.

What the agent receives:

The agent should not have to independently query blindly. F-Mark should push a compact delta:

```text
F-Mark compass update
Session: <session-id>
You are: <participant-id>
Use MCP tools from server `f-mark`.

New since your cursor <event-id/timestamp>:
- user prose: <short summary or first line>
- choices/mentions/todos affecting you
- access requests awaiting user action

Use `fmark_read_events` with cursor `<cursor>` for details.
Use `fmark_post_prose`, `fmark_post_todo`, etc. for writes.
```

Planning owner:

- Existing tmux input queue and managed-agent command plumbing.
- `planning/mcp/ux-flow.md`: wake agents with MCP-oriented prompts.

Flow-discovered refinement:

- Add a dedicated wake/delta service. It should compute "what changed for this agent" and send a bounded compass packet.
- Add per-agent session cursors so F-Mark knows what the agent has seen.
- Add `fmark_read_delta` or `fmark_get_inbox` as a higher-level MCP tool.
- Respect paused state: paused agents are excluded from all automatic wake/delta delivery. If explicitly tagged, the UI offers to resume them before sending.
- Wake targeting matrix:
  - regular no-mention message: all active unpaused session agents,
  - regular mentioned message: tagged active unpaused agents only,
  - comment with mentions: tagged active unpaused agents plus the author agent of the commented-on content,
  - comment without mentions: the author agent of the commented-on content,
  - task/todo create or edit: agents assigned to dirty tasks/todos.

### 4. Agent Wakes And Catches Up

Interaction:

1. Agent receives wake packet.
2. Agent calls `fmark_get_inbox` with the provided cursor. Querying inbox marks returned items as seen automatically.
3. Agent can request full details only for relevant files/events.
4. Agent responds with MCP tools and/or normal terminal text.

Catch-up should not dump every file into context.

Preferred catch-up shape:

- Wake packet: tiny summary + cursors + event ids.
- MCP inbox tool: structured list of unread events and action items.
- MCP detail tools: read selected event, doc, attachment, todo tree.
- Optional digest: "summarize session since cursor" generated by kernel from event metadata and short snippets, not by loading all files.

Planning owner:

- MCP resources/tools in `planning/mcp/plan.md`.
- Needs explicit new tools.

Flow-discovered refinement:

- Add `fmark_get_inbox`:
  - defaults participant/session automatically,
  - returns unread events, assigned todos, open choices, access requests, and recommended next action.
  - marks returned items as seen automatically.
- Add `fmark_mark_seen`:
  - available for explicit cursor correction/manual flows, but not required after normal inbox queries.
- Add `fmark_read_event`:
  - reads one event/file by id or filename.

### 5. Agent Produces Output

Output paths:

1. Deliberate F-Mark content goes through MCP tools.
2. Ordinary runtime output goes through stream hooks.
3. Tool calls from the runtime are captured by stream hooks where supported.
4. Runtime access/permission requests are represented as first-class session items when detectable.

What gets saved:

- MCP writes become event files in `.f-mark/sessions/<session-id>/`.
- Hook output becomes prose/tool-use/turn-end event files in the same session.
- Agent-local runtime transcript is not the source of truth; F-Mark event files are.

How MCP calls avoid repeated session/auth inputs:

- The MCP server is installed per project or launched by the managed agent.
- Stdio MCP resolves `.f-mark/config.json` and `.f-mark/.token` itself.
- HTTP MCP receives auth at connection/config level.
- Tool context defaults `participant_id` and `session_id` from:
  1. explicit tool input,
  2. managed-agent state `active_session`,
  3. `.f-mark/agents/<participant-id>/active-session`,
  4. MCP connection/session context,
  5. env (`F_MARK_PARTICIPANT_ID`, `F_MARK_SESSION_ID`).
- Tool schemas should make `participant_id` and `session_id` optional for managed agents.

Planning owner:

- `planning/mcp/research-mcp-kernel-architecture.md`: stdio proxy/context handling and active-session resolver.
- `planning/mcp/plan.md`: MCP context, tools, service extraction.

Flow-discovered refinement:

- Add `packages/kernel/src/mcp/context.ts` as a required part of v1, not a later cleanup.
- Tool output should include `session_id`, `participant_id`, `filename`, `kind`, and cursor info in structured content.

### 6. User Forks A Session

Interaction:

1. User clicks fork on a session row, or clicks fork in the composer pane.
2. F-Mark opens a small name popup.
3. User confirms the fork name.
4. Kernel duplicates the source session folder into a new session folder.
5. Kernel registers the fork for session discovery/state.
6. Kernel switches the UI to the fork.
7. Kernel updates active managed agents so their active session is the fork.
8. Kernel changes MCP context and stream listeners to the fork.
9. Kernel invokes the runtime-native fork/branch command only when the mechanism is verified.
10. Kernel relaunches or rebinds active agents and sends them a fork handoff prompt.

What the user sees:

- The new fork appears as the active session.
- Copied events/assets are visible immediately.
- Active agents remain present in the Agents tab, now attached to the fork.
- Any skipped/failed agent handoff appears as a warning with reconnect/remediate actions.

What the agent receives:

```text
F-Mark fork handoff
You are now working in forked session <new-session-id>, forked from <source-session-id>.
Use the F-Mark MCP tools from server `f-mark`.
Default all F-Mark writes to the new forked session.
```

Planning owner:

- `planning/mcp/session-forking.md`: full fork UX/backend/agent handoff contract.
- `planning/mcp/plan.md`: backend/UI phases and verification.

Flow-discovered refinement:

- MCP context must read active-session state per call or refresh after fork; it must not cache the source session forever.
- Hook/listener routing must prefer the active-session pointer over stale `F_MARK_SESSION_ID`.
- Runtime-native fork command is a smoke-tested capability gate. Do not send `/fork` or `/branch` unless that runtime's managed-pane smoke test passed.
- Current research baseline:
  - Claude: `/branch [name]` after smoke, with CLI resume/fork/name path as optional research.
  - Codex: `/fork`/`codex fork` after smoke, no CLI name flag.
  - Gemini: no native fork/branch; F-Mark handoff prompt is v1.

## Streamed Event Presentation

### Arbitrary Prose / Mid-Turn Text

Source:

- stream hook captures assistant text before final response or explicit MCP writes.

Saved as:

- prose event with `arbitrary: true`.

UI:

- show inside an expandable "Working" or "Live output" group for the agent turn.
- stream progressively when possible.
- collapse by default after turn end if the final/deliberate answer exists.

Planning coverage:

- Existing arbitrary prose grouping.
- Needs duplicate suppression with MCP deliberate prose.

### Tool Calls

Source:

- stream hook captures runtime tool use.
- future MCP middleware can log MCP tool calls automatically if useful.

Saved as:

- `tool-use` event.

UI:

- show as compact tool cards inside the agent's working group.
- card title: tool name + status.
- collapsed input/result by default.
- error state if `success: false`.
- if a tool call produced an F-Mark event through MCP, cross-link to that event.

Planning coverage:

- Existing `tool-use` event kind and renderer cards.
- Needs correlation ids between MCP calls, hook tool-use, and produced event filenames.

### Sub-Agent Output

Source:

- runtime launches a sub-agent/delegated agent/task from inside the parent agent turn.
- hook/live stream/transcript data exposes the child run, child name, or final child result.

Saved as:

- preferred: explicit `subagent-run` and `subagent-output` events.
- store under the parent participant with sub-agent identity in structured payloads.

UI:

- render a dedicated nested box inside the parent agent's working/live output group.
- header shows sub-agent name/title and "launched by <parent agent>".
- status shows running/completed/failed/cancelled/unknown.
- stream child output progressively when available.
- show final child result when only final output is available.
- keep failed sub-agent boxes expanded; collapse completed boxes after parent turn end by default.

Attribution:

- parent F-Mark participant remains the top-level speaker.
- sub-agent is a subentity, not a durable participant in v1.
- use runtime-provided sub-agent name/title when available; otherwise derive a cautious label from the task description or show `Sub-agent`.

Planning coverage:

- New: `planning/mcp/subagent-streaming.md`.
- Research-backed v1:
  - Claude: final-result box from `Agent` hooks and `SubagentStart`/`SubagentStop`; progressive output needs smoke.
  - Codex: final-result box from `SubagentStart`/`SubagentStop`; progressive output likely needs app-server/transcript fixtures.
  - Gemini: final-result box from `invoke_agent`/`agent_name`; progressive output unsupported until fixtures prove it.

### Turn End

Source:

- stream hook Stop event.
- `fmark_end_turn` MCP tool.

Saved as:

- `turn-end` event.

UI:

- should usually be structural, not a visible chat bubble.
- use it to close live output groups, update chip state, and mark the agent as idle/ready.
- optional tiny timestamp marker in logs/details.

Planning coverage:

- Existing `turn-end`.
- Needs clear rule when both hook and MCP emit turn-end: dedupe or coalesce.

### Access Requests

Definition:

Access requests are runtime permission prompts or blocked-action requests that require the user to approve, deny, or adjust policy.

Examples:

- "Claude wants to run command X."
- "Codex needs approval for MCP tool Y."
- "Gemini requests tool trust for f-mark."
- "Project MCP config requires trust before use."

Saved as:

- new event kind recommended: `access-request`.

Payload:

```ts
{
  schema: "fmark.access-request.v1";
  participant_id: string;
  id: string;
  title: string;
  body?: string;
  runtime_id: string;
  request_type: "permission" | "trust" | "config" | "tool" | "command" | "unknown";
  status: "open" | "approved" | "denied" | "resolved" | "expired";
  options: Array<{ id: string; label: string; style?: "primary" | "danger" }>;
  source?: {
    tmux_session?: string;
    tool_name?: string;
    command_preview?: string;
  };
  supersedes?: string;
}
```

UI:

- access requests should appear as actionable cards, not buried in arbitrary text.
- show in the feed and in a top-bar/pending badge.
- show on the agent chip with a distinct notification color from turn-ended.
- actions must be reliable:
  - clicking approve/deny writes an `access-response` event,
  - kernel sends the corresponding answer to the agent pane if the runtime prompt is still active,
  - if the prompt expired, show "expired" and do not pretend it succeeded.

Planning coverage:

- Covered by `planning/mcp/plan.md` Phase 8, `planning/mcp/agent-control-and-targeting.md`, and the runtime research docs.

Flow-discovered refinement:

- Add `access-request` and `access-response` event kinds.
- Add a detector path:
  - hook/parser if runtime exposes structured permission prompt,
  - terminal stream pattern detector only as a fallback,
  - explicit MCP tool `fmark_request_access` for agents/custom integrations.
- Add UI cards and top-bar pending state.
- Add command routing to answer pending runtime prompts through tmux input queue.

Runtime detection baseline:

- Claude: structured `PermissionRequest` hook payloads.
- Codex: structured `PermissionRequest` hook payloads.
- Gemini: `Notification` hook with `notification_type: "ToolPermission"` for observability; live approval/change may require terminal interaction or restart.

## Flow Considerations, Answers, And Planning Coverage

| Question | Answer | Covered by plan? | Refinement needed |
|---|---|---|---|
| How does the user create an agent without setup friction? | Click runtime, preflight, local/global setup sheet if needed, install/update, launch. | Yes: `ux-flow.md`, preflight/apply in `plan.md`. | Make "copy command" advanced fallback only. |
| How does the agent know it is in F-Mark? | First prompt injects `/guide`, env vars, participant/session ids, and compass packet. Every wake repeats a short MCP reminder. | Partly. | Add compass packet explicitly to spawn/wake tasks. |
| Do we know the runtime's own session id/name? | F-Mark knows its own participant/session/tmux ids immediately. Claude hooks/status-line can expose ids/name; Codex/Gemini hooks expose ids but no stable name setter. | New. | Store `runtime_session` in managed-agent state, set `desired_name` to the F-Mark session id, and show Unknown for unsupported fields. |
| How does the agent know what changed? | Kernel tracks per-agent cursors and pushes a wake packet with summary + cursor. Agent can call inbox/delta tools for details. | Partly. | Add wake/delta service plus `fmark_get_inbox`, `fmark_mark_seen`, `fmark_read_event`. |
| Can we push context instead of forcing independent queries? | Yes, push a compact bounded delta. Do not push all files. Include ids and summaries, then let agent pull details selectively. | Not enough. | Add cursor/digest/inbox design. |
| What happens when an agent is paused? | It remains alive but receives no automatic wake packets, mentions, comment nudges, or compass deltas. | New. | Add pause/resume state, routes, UI, and wake filtering. |
| How do users target specific agents? | Use agent tags from composer/comment popover or `@` typing. Mentions store participant ids and wake only mentioned active unpaused agents. | New. | Add mention metadata, popover, parser, wake routing. |
| How does the user fork a session? | Use fork button in a session row or composer, name the fork, duplicate the session folder, switch to the fork, and move active managed agents into it. | New. | Add `POST /sessions/:id/fork`, fork UI, agent handoff, MCP/listener rebind. |
| How are MCP calls authenticated? | MCP server context reads token once; tools default auth/session/participant from connection/env/active-session. | Partly. | Make `mcp/context.ts` mandatory in v1. |
| Does the agent need to pass session/auth every call? | No for managed agents. Tool schema should allow omitted `session_id`/`participant_id`. | Partly. | Add explicit tool defaulting rule and tests. |
| How are ordinary outputs streamed? | Existing stream hook writes arbitrary prose, tool-use, turn-end. | Yes. | Add duplicate suppression when MCP deliberate events exist. |
| How are tool calls shown? | Compact tool cards inside the live working group, with status and expandable input/result. | Mostly existing. | Add correlation between tool calls and MCP-produced events. |
| How are sub-agents shown? | Sub-agent output appears in a nested box inside the parent agent's turn, named with the runtime-provided sub-agent name/title when available. | New. | Add explicit `subagent-run`/`subagent-output` events, per-runtime adapters, `SubagentBox`, and final-result-first capability flags. |
| How is turn end shown? | Structural event: close group, update chip. Usually not a chat bubble. | Partly existing. | Dedupe hook/MCP turn-end. |
| How are access requests shown/responded to? | First-class actionable cards with approve/deny writing `access-response` and sending answer to tmux if live. Agent chip also gets distinct access-pending color. | No. | Add event kinds, detector, UI card, response routing, chip status. |
| How does an existing session join avoid dumping all files into context? | Inject compact compass packet and provide catch-up tools with cursors, summaries, and selective detail reads. | Partly. | Add inbox/digest tools and cursor storage. |
| How do we preserve current behavior? | REST remains, hooks remain, terminal overlay remains, `/guide-rest-variant` preserves raw API guidance. | Yes. | Ensure tests cover old routes and hook behavior. |

## New Planning Items Revealed By This Flow

Add these to the implementation plan:

1. **Compass packet builder**
   - Builds first-prompt and wake-prompt packets.
   - Includes session id, participant id, cursor, new event summaries, pending actions.

2. **Per-agent cursors**
   - Store last seen cursor per participant/session.
   - Advance automatically when `fmark_get_inbox` returns items.

3. **Inbox/delta MCP tools**
   - `fmark_get_inbox`
   - `fmark_read_event`
   - `fmark_mark_seen`

4. **Managed MCP context defaults**
   - No repeated session/auth inputs for managed agents.
   - Defaults must be tested.

5. **Access request event flow**
   - `access-request`
   - `access-response`
   - UI cards
   - response routing into tmux/runtime prompts

6. **Stream/MCP duplicate suppression**
   - Correlate MCP deliberate writes with hook-captured final prose/turn-end.

7. **Existing-session catch-up**
   - Bounded digest instead of dumping the whole event log.
   - Selective detail reads by event id/filename.

8. **Agent control surface**
   - Pause/resume, rename, reconnect, compact, clear, access controls, context visibility.
   - Right-pane Agents tab and tag popovers.

9. **Session fork flow**
   - Session row and composer fork buttons.
   - Session folder duplication and fork metadata.
   - Active managed-agent handoff to the new session.
   - MCP/listener default-session rebind.
   - Runtime-native fork/branch commands behind per-runtime smoke-tested capabilities.

10. **Sub-agent streaming**
    - Detect sub-agent runs from hook/live-stream/transcript data.
    - Preserve parent agent attribution and sub-agent name/title.
    - Render nested sub-agent boxes inside the parent turn.
    - Ship final-result-only where fixtures support it; enable progressive child output only after runtime smoke tests.

## Open Product Questions

1. How aggressive should duplicate suppression be? Conservative dedupe avoids hiding useful output; aggressive dedupe makes the feed cleaner.
2. Should global setup ever be the default on a repo with a writable project config, or always local-first?
3. Should global setup ever be the default on a personal repo after the user has chosen global once, or stay local-first forever?
