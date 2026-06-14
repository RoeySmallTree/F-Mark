# F-Mark Native Session Fork — Implementation Plan

## 1. Intent and scope

Replace the current F-Mark text handoff with native runtime forking. A fork must create a new F-Mark session folder, then create new managed runtime panes that are bound to the fork from process start. The source session, source participant rows, and source tmux panes stay alive and unchanged.

The implementation must not type a handoff prompt, launch prompt, wake prompt, or explanatory message into any runtime as part of fork. From the forked runtime's point of view, it is the provider's normal fork/resume path for the same conversation context.

The target behavior is:

- F-Mark session data: copy the source `.f-mark/sessions/<source_id>` tree to `.f-mark/sessions/<fork_id>` exactly as today, with `.fork.json` metadata updated to point at the fork-side participant ids.
- Source agents: remain attached to the source participant ids and source tmux sessions. Their `active-session`, `tmux-session`, runtime state, and panes are not mutated.
- Fork agents: are new participant ids with their own agent state and tmux sessions. They are spawned with `F_MARK_SESSION_ID=<fork_id>`, `F_MARK_PATH=<project root>`, `F_MARK_AGENT_ID=<fork_participant_id>`, and `F_MARK_RUNTIME_ID=<runtime_id>` at `tmux new-session` time.
- Claude: use `claude --resume <source_handle> --fork-session --name <fork_id>` as the runtime command. Do not use `/branch`.
- Codex: use `codex fork <source_native_session_id>` as the runtime command. Do not use `/fork`, and do not resume the same source session in a second pane.
- Gemini: Gemini has no native fork command. Spawn a fresh Gemini pane bound to the fork and return a structured warning that runtime context was not carried.
- Unknown runtimes: do not prompt. Return a structured warning and skip runtime relaunch unless a runtime-specific native fork adapter exists.

This plan intentionally keeps the public `/sessions/:id/fork`, renderer, and MCP entrypoints. The response contract gains optional fields, but existing fields and status values remain usable.

## 2. Current flow (file:line walk-through)

The fork route is `POST /sessions/:id/fork` in `packages/kernel/src/routes/sessions.ts`. The request schema accepts `path`, `name`, `relaunch_agents`, and `agent_ids` at lines 285-306. The route resolves the active path at lines 314-339, creates an `AgentStateStore`, lists participants, and defaults `requestedAgentIds` to participants whose `active_session` is the source id at lines 341-354.

The F-Mark folder copy happens before agent work. `forkSessionFolder` is called at `packages/kernel/src/routes/sessions.ts:356-361`. Its implementation in `packages/kernel/src/sessions.ts` validates the source at lines 116-122, derives a slug and id at lines 123-127, copies the source directory to a temp dir at lines 145-152, writes `.fork.json` at lines 153-157, and renames the temp directory into place at line 158. Current fork metadata has `agent_participant_ids` only, defined at `packages/kernel/src/sessions.ts:15-23` and populated with the requested source ids at lines 135-143.

The current route then calls `rebindForkAgents` when `relaunch_agents !== false` at `packages/kernel/src/routes/sessions.ts:367-376`. If rebinding is disabled, it returns `skipped-detached` for each requested participant at lines 377-386.

The old handoff text is hard-coded in `forkHandoffPrompt` at `packages/kernel/src/routes/sessions.ts:430-443`:

```text
F-Mark fork handoff
You are now working in forked session ...
Your F-Mark display name is ...
Use the F-Mark MCP tools from server `f-mark`.
Default all F-Mark writes to the new forked session.
Call fmark_get_inbox if you need the bounded delta.
```

`rebindForkAgents` currently filters missing, paused, detached, and non-source participants at `packages/kernel/src/routes/sessions.ts:461-512`. For connected live agents, it mutates the existing source participant: `writeActiveSession(participantId, forkSessionId)` at lines 513-517, `writeRuntimeSession` with `desired_name: forkSessionId` at lines 518-522, and appends a fork log at lines 523-527. It then types the handoff prompt into the existing tmux pane with `sendLiteralText` and Enter at lines 528-535. The returned `ForkedAgentResult` uses the original participant id and original tmux session at lines 537-544.

The route publishes `session.forked` at `packages/kernel/src/routes/sessions.ts:395-402`, then publishes `managed-agent.updated` only for agents whose result status is `"rebound"` at lines 403-412. `publishForkAgentUpdates` rebuilds status rows from participant-scoped agent state at lines 559-624.

The participant/state model is participant-scoped. `participants.json` stores participants, while `active_session` is enriched from `.f-mark/agents/<id>/active-session` or the global v0.5 agents dir in `listParticipants` at `packages/kernel/src/participants.ts:183-200`. `AgentStateStore` reads and writes active session at `packages/kernel/src/services/agentState.ts:93-108`, tmux session at lines 110-123, runtime id at lines 125-135, runtime session info at lines 137-175, control state at lines 177-218, and logs at lines 273-289. A single participant id therefore has one active session and one tmux session pointer today.

Managed agent spawn already has the env hook we need. `TmuxManager.spawnAgent` accepts `env` at `packages/kernel/src/tmux/manager.ts:10-16`, computes the tmux session name from the participant id at lines 71-73, merges env with `F_MARK_PATH` and `F_MARK_AGENT_ID` at lines 76-80, passes all env vars as `tmux new-session -e KEY=VALUE` at lines 81-99, and tags the tmux session with `@fmark-project` and `@fmark-participant` at lines 101-102. `killSession`, `captureSnapshot`, `sendLiteralText`, and `sendKey` are available at lines 140-173.

The canonical spawn route in `packages/kernel/src/routes/managedAgents.ts` registers or reuses a participant at lines 1389-1406, builds a launch prompt at lines 1412-1420, computes runtime args at lines 1421-1427, spawns tmux with `F_MARK_RUNTIME_ID`, `F_MARK_PATH`, and optional `F_MARK_SESSION_ID` at lines 1428-1440, and rolls back by killing tmux if post-spawn state writes fail at lines 1441-1470. It writes `tmux-session`, `runtime`, `runtime-session`, and `active-session` at lines 1446-1451.

The reconnect path follows the same pattern at `packages/kernel/src/routes/managedAgents.ts:1080-1138`: build wake prompt, compute args, spawn with env at lines 1094-1106, write state at lines 1107-1114, and send a prompt after readiness for tmux-delivered prompts at lines 1115-1135.

Readiness is currently best-effort. `runtimeReady` in `packages/kernel/src/routes/managedAgents.ts:220-234` returns true for loose substrings and returns true for unknown runtimes. `waitForRuntimeReady` at lines 236-254 returns `void`, silently returns on capture error at lines 243-250, and silently returns on timeout at line 251.

Runtime defaults are `claude`, `codex`, and `gemini` with `readyDelayMs` in `packages/kernel/src/runtimes/defaults.ts:3-7`.

Hook-side session resolution favors already persisted participant state before env. In `packages/kernel/src/hooks/autoStream.ts:85-116`, autoStream reads `agentState.readActiveSession(participantId)` first at lines 89-90, then considers `F_MARK_SESSION_ID` and payload `fmark_session_id` at lines 92-107, then falls back to the latest session at lines 109-114. This means the fork-side participant must have `active-session=<fork_id>` before the new pane can make its first MCP or hook write, and the new pane must be spawned with the fork env from the start.

Runtime capability declarations currently mark native fork as unverified. Claude declares `native_supported: true`, command `/branch`, `command_accepts_name: true`, and CLI `claude --resume <source> --fork-session --name <name>` at `packages/kernel/src/agents/capabilities.ts:31-43`. Codex declares `native_supported: true`, command `/fork`, no command name support, and CLI `codex fork <session_id> <prompt>` at lines 57-69. Gemini declares `native_supported: false` and no command at lines 83-95.

Renderer callers are thin wrappers. `ForkSessionPopover` calls `client.forkSession(target.id, { name, path })` at `packages/renderer/src/components/ForkSessionPopover.tsx:106-123`, refreshes sessions, participants, and managed-agent status at lines 76-104, and currently closes only if all agents are `"rebound"` and no warnings exist at lines 123-128. Warnings displayed by the popover are currently just top-level warnings plus non-`rebound` statuses at lines 65-74. `client.forkSession` posts to `/sessions/<source>/fork` at `packages/renderer/src/api/client.ts:229-234`. The MCP tool `fmark_fork_session` forwards `session_id`, `name`, `path`, `relaunch_agents`, and `agent_ids` to the same route at `packages/kernel/src/mcp/tools.ts:115-145`.

The current hot tests assert the old handoff contract. `phase17-session-fork-hot.mjs` asserts the live source participant moved to the fork at lines 435-456, checks MCP writes after that handoff at lines 465-491, calls the route at lines 567-579, waits for `managed-agent.updated` on the source participant at lines 586-593, asserts `.fork.json` includes the live source id at lines 599-603, and waits for `"F-Mark fork handoff"` to appear in the live pane at lines 617-624. The UI hot test waits for handoff text at `packages/kernel/tests/hot/phase18-session-fork-ui-hot.mjs:433-434` and again at lines 473-479. The vendor hot test starts real vendor panes with source env at `packages/kernel/tests/hot/phase18-session-fork-vendors-hot.mjs:553-580`, then asserts all three old source participants were rebound and handoff text appeared in the same panes at lines 582-624.

## 3. Decisions per question [A]-[H]

### [A] Runtime fork id control

Decision: F-Mark keeps its fork id stable and records provider-native session ids separately. It does not rename F-Mark session folders to provider ids. It does not claim to control provider-native ids unless the provider exposes a verified id flag.

Verified local CLI evidence:

```text
claude --version
2.1.128 (Claude Code)

claude --help
--fork-session                                    When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)
-n, --name <name>                                 Set a display name for this session (shown in the prompt box, /resume picker, and terminal title)
-r, --resume [value]                              Resume a conversation by session ID, or open interactive picker with optional search term
--session-id <uuid>                               Use a specific session ID for the conversation (must be a valid UUID)
```

Claude decision: use the atomic CLI form, not interactive `/branch`.

Mechanism: spawn the fork pane as:

```text
claude <runtime.args> --resume <source_handle> --fork-session --name <fork_id>
```

`source_handle` is resolved in this order:

- `RuntimeSessionInfo.native_session_id` if present.
- `RuntimeSessionInfo.desired_name` only if `native_name_applied === true`, because F-Mark-created Claude sessions are launched with `--name <F-Mark session id>` today through `spawnArgsForRuntime` at `packages/kernel/src/routes/managedAgents.ts:113-147`.

If neither is available, the Claude participant fails with `ForkedAgentResult.status="failed"` and a warning explaining that the source Claude native session handle is unknown.

Rationale: the help explicitly says `--fork-session` creates a new session id when resuming, and `--name` sets the display name. This is race-free compared with launching `claude --resume` and later typing `/branch <name>`, because the source pane is never touched and the fork/name intent exists in the initial process argv. `--session-id` is not a solution for F-Mark ids because the help requires a UUID and F-Mark session ids are date-prefixed slugs.

Name confirmation: after spawn, the fork flow must confirm readiness and name application. Add a tmux pane-title read (`tmux display-message -t <session> -p "#{pane_title}"`) and accept success only if either the pane title or captured prompt text contains `<fork_id>`. If Claude does not expose the name in title/snapshot for a supported version, this becomes an item in section 11 before flipping `verified:true`.

Verified Codex CLI evidence:

```text
codex --version
codex-cli 0.133.0

codex --help
Commands:
  resume          Resume a previous interactive session (picker by default; use --last to continue the most recent)
  fork            Fork a previous interactive session (picker by default; use --last to fork the most recent)

codex resume --help
Usage: codex resume [OPTIONS] [SESSION_ID] [PROMPT]
[SESSION_ID]          Conversation/session id (UUID) or thread name. UUIDs take precedence if it parses.
[PROMPT]              Optional user prompt to start the session

codex fork --help
Usage: codex fork [OPTIONS] [SESSION_ID] [PROMPT]
[SESSION_ID]          Conversation/session id (UUID). When provided, forks this session.
[PROMPT]              Optional user prompt to start the session
```

Verified Codex storage evidence from this machine:

```text
$HOME/.codex/sessions
$HOME/.codex/sessions/2026/05/27/rollout-2026-05-27T12-38-12-019e6903-6cb7-7390-a101-b052ff69a270.jsonl
```

The first JSONL record is shaped as:

```json
{"type":"session_meta","payload":{"id":"019e6903-6cb7-7390-a101-b052ff69a270","cwd":"/home/roey/workspace/F-Mark","cli_version":"0.133.0"}}
```

Codex decision: use `codex fork <source_native_session_id>` directly as the pane command. Do not use `/fork`. Do not use `codex resume <source>` before forking. Do not pass a prompt, because `codex fork --help` marks `[PROMPT]` optional.

Mechanism:

- Persist Codex native ids in `RuntimeSessionInfo.native_session_id` for newly spawned Codex sessions by diffing `$CODEX_HOME/sessions/**/*.jsonl` before and after spawn/readiness.
- At fork time, require a known source Codex native id. If absent, attempt a deterministic recovery only when exactly one Codex session JSONL for this project and participant spawn window can be identified. If recovery is not unique, fail that participant with a warning rather than guessing.
- Spawn the new fork pane as `codex <runtime.args> fork <source_native_session_id>` with the fork env from tmux creation.
- Capture the generated fork Codex id by diffing `$CODEX_HOME/sessions/**/*.jsonl` before spawn and after readiness, parsing `session_meta.payload.id`, and requiring exactly one new session whose `payload.cwd` is the F-Mark project root and whose id differs from the source native id.
- Store the captured provider id in `RuntimeSessionInfo.native_session_id`, store the source provider id in `RuntimeSessionInfo.native_parent_session_id`, keep `desired_name=<fork_id>`, and keep `native_name_applied=false`.

Rationale: this avoids opening the same Codex source session in two interactive panes and avoids the unreliable problem of typing `/fork` and scraping terminal output. It also preserves F-Mark's preallocated fork id, so `.f-mark/sessions/<fork_id>`, participants, active-session pointers, and websocket messages do not need a rename cascade.

Gemini verified CLI evidence:

```text
gemini --version
0.43.0

gemini --help
Commands:
  gemini mcp                   Manage MCP servers
  gemini extensions <command>  Manage Gemini CLI extensions.
  gemini skills <command>      Manage agent skills.
  gemini hooks <command>       Manage Gemini CLI hooks.
  gemini gemma                 Manage local Gemma model routing
  gemini [query..]             Launch Gemini CLI  [default]
--resume                       Resume a previous session.
--session-id                   Start a new session with a manually provided UUID.
--list-sessions                List available sessions for the current project and exit.
```

Gemini decision: spawn a fresh Gemini agent bound to the fork session, without `--resume`, without `--session-id`, and without a prompt. Return `ForkedAgentResult.status="relaunched"` with `warning` set to a clear message such as:

```text
Gemini has no native fork command; launched a fresh Gemini session bound to the F-Mark fork. F-Mark event history was copied, but Gemini runtime context was not carried.
```

Rationale: silently skipping Gemini hides an important context gap. Faking a fork with `--session-id` would create an id but not carry runtime context, which is worse. A fresh fork-bound pane plus explicit warning is honest and still lets mixed Claude/Codex/Gemini fork actions proceed.

### [B] Source session unaffected

Decision: source F-Mark and provider sessions must be hash-checked in tests, and the implementation must avoid all source-pane input.

F-Mark source folder safety already exists and must be preserved. `forkSessionFolder` copies from source into a temp dir and renames the temp dir into the fork at `packages/kernel/src/sessions.ts:145-158`. The existing Phase 17 hot test snapshots source before and after fork at `packages/kernel/tests/hot/phase17-session-fork-hot.mjs:558-609`; keep that assertion and extend it to provider transcript files.

Claude source safety decision: use only `claude --resume <source_handle> --fork-session --name <fork_id>`. The quoted Claude help says `--fork-session` creates a new session id instead of reusing the original when resuming. The source pane is not touched, and the fork process is born with fork env. The smoke test must hash the source Claude JSONL before and after native fork in an isolated `HOME`/project. If this hash changes in a way other than benign filesystem metadata, do not ship the Claude adapter; either switch to a provider-supported transcript copy or fail Claude fork with a warning until a safe provider path exists.

Codex source safety decision: use `codex fork <source_native_session_id>`, not `codex resume <source>` plus `/fork`. This avoids two live panes attached to the same Codex source transcript. The smoke test must hash the source Codex JSONL before and after `codex fork`. If `codex fork` mutates the source transcript, do not fall back to resume-plus-slash; instead, create a runtime-side copy only if the copied file is accepted by `codex resume <copied_native_id>`, otherwise fail Codex fork with a warning.

Gemini source safety decision: Gemini has no runtime fork, so the source Gemini pane is not resumed, not sent input, and not touched. The new Gemini pane is a clean session bound to F-Mark's copied event log.

### [C] Env at spawn

Decision: for every fork-side pane, `F_MARK_SESSION_ID=<fork_id>` is present in the `tmux new-session` command. No source env is carried and mutated after spawn.

The exact per-agent sequence is:

1. Validate the source participant and source runtime state.
2. Allocate/register a fork-side participant id.
3. Write fork-side agent state before spawn:
   - `agentState.writeActiveSession(forkParticipantId, forkSessionId)`
   - `agentState.writeRuntime(forkParticipantId, runtimeId)`
   - `agentState.writeRuntimeSession(forkParticipantId, initialRuntimeSessionInfo)`
   - `agentState.writeControlState(forkParticipantId, copied/default control state)`
4. Spawn tmux using `tmux.spawnAgent` with:

```ts
env: {
  ...(runtime.env ?? {}),
  F_MARK_RUNTIME_ID: runtimeId,
  F_MARK_PATH: p.root(),
  F_MARK_AGENT_ID: forkParticipantId,
  F_MARK_SESSION_ID: forkSessionId,
}
```

`TmuxManager.spawnAgent` already turns that map into `tmux new-session -e KEY=VALUE` at `packages/kernel/src/tmux/manager.ts:81-99`.

5. Wait for runtime readiness with a strict timeout.
6. Confirm provider fork creation and capture provider native id when applicable.
7. Append a fork log entry to the fork participant.
8. Publish `session.forked`, then `managed-agent.updated` for fork-side participants.

Rollback is per participant:

- If fork participant registration or pre-spawn state write fails: remove the fork participant row if it was created, remove its agent state dir, return `status="failed"`, and do not touch the source participant.
- If `tmux.spawnAgent` fails: remove the fork participant row/state and return `failed`. There is no pane to kill.
- If post-spawn state write fails: kill the new tmux session, remove fork participant row/state, and return `failed`.
- If readiness times out or pane capture fails: kill the new tmux session, remove fork participant row/state, and return `failed` with a warning that includes the runtime id and timeout.
- If Claude name confirmation fails: kill the new tmux session, remove fork participant row/state, return `failed`.
- If Codex native id capture fails or is ambiguous: kill the new tmux session, remove fork participant row/state, return `failed`.
- If cleanup itself fails, preserve the original failure in `warning` and append cleanup failure details to the agent log; do not hide the fork failure.

Because the source participant is never reassigned, the old "revert agentState.active_session to source" rollback becomes unnecessary for the source participant. The stronger guarantee is that source `active-session` was not written at all. Tests must assert that.

### [D] Source pane fate

Decision: split participants.

Reassigning the existing participant would orphan the still-running source pane and violates the requirement that the source run regularly. A per-session participant table would be a larger schema migration and is not necessary for this feature. The fork creates a new agent participant for each successfully forked or Gemini-fallback runtime.

Id generation rule:

```text
ag-f<10 lowercase hex chars>
```

The 10 hex chars are `sha256("<forkSessionId>:<sourceParticipantId>:<attempt>").slice(0, 10)`, with `attempt` from `0` to `63` until the id is unused. This satisfies the current participant id pattern `^(us|ag|sys|grp)-[a-z0-9-]{2,12}$` at `packages/kernel/src/participants.ts:52`. Example: `ag-f3a91c0e42`.

Participant persistence:

- Add a helper in `packages/kernel/src/participants.ts`, for example `registerForkAgentParticipant`, that writes directly to `participants.json` and legacy `config.json` using the same `writeParticipants` path at lines 153-168.
- The fork participant copies `kind: "agent"`, `name`, `color`, and `runtime_id` from the source participant.
- Add optional participant metadata `forked_from_participant_id` and `forked_from_session_id` so the UI and diagnostics can explain lineage without guessing from ids.

Agent state:

- Source participant state remains unchanged:
  - source `active-session` remains `<source_id>`
  - source `tmux-session` remains the source tmux session
  - source `runtime-session.json` remains the source provider info
- Fork participant state is new:
  - fork `active-session` is `<fork_id>`
  - fork `tmux-session` is the new tmux session name
  - fork `runtime` copies the runtime id
  - fork `runtime-session.json` stores `desired_name=<fork_id>` plus native provider ids

Response contract:

- Keep `ForkedAgentResult.participant_id` as the source participant id for caller correlation and backward compatibility.
- Add `fork_participant_id?: string`; set it on `rebound` and `relaunched` results.
- Set `tmux_session` to the new fork-side tmux session on successful fork/fallback.
- Publish `managed-agent.updated` for the fork-side participant id.

Fork metadata:

- Change `.fork.json.agent_participant_ids` to the fork-side ids.
- Add `source_agent_participant_ids` and `agent_participant_map` to preserve the source-to-fork mapping.

### [E] Readiness gating

Decision: add a strict readiness path for fork and make timeout/capture failure explicit. Do not use the current silent `waitForRuntimeReady` behavior for fork.

Current code silently returns on capture error or timeout at `packages/kernel/src/routes/managedAgents.ts:243-251`. The fork path must instead use `waitForRuntimeReadyOrThrow({ tmux, sessionName, runtimeId, timeoutMs, mode: "fork" })`.

Fork readiness predicates:

- Claude:
  - Ready if the captured pane matches `/Try .+for shortcuts/i`, `/for shortcuts/i`, or `/Press Esc to interrupt/i`.
  - Not ready if the pane contains `/Starting|Loading|Connecting/i` and none of the ready patterns match.
  - Name applied if pane title or pane snapshot contains the exact `<fork_id>`.
- Codex:
  - Ready if the captured pane matches `/Ask Codex/i`.
  - Not ready if the pane contains `/Connecting|Loading|Initializing/i` and the ready pattern does not match.
  - Fork confirmed only after a unique new Codex session JSONL id is captured from storage.
- Gemini:
  - Ready if the captured pane matches `/Gemini/i` and either `/shell mode/i`, `/Type your message/i`, or `/>\\s*$/m`.
  - Since Gemini is a clean fallback, no provider fork confirmation is expected.
- Unknown:
  - No native fork readiness predicate. Unknown runtimes are skipped unless a runtime-specific adapter is added.

Timeout policy:

- Use `runtime.readyDelayMs` only as the initial poll budget floor, not the whole readiness timeout.
- Fork readiness timeout should default to `max(runtime.readyDelayMs * 10, 15_000)` with an upper config override in runtime settings if needed.
- Poll every 150 ms as today, but throw `RuntimeReadyTimeoutError` with the last 2000 chars of sanitized snapshot tail.

Failure result:

- Return `ForkedAgentResult.status="failed"`.
- Include a warning such as `codex fork readiness timed out after 15000ms; killed fork pane <tmux_session>`.
- Kill the new pane and remove fork participant state.

### [F] Deletions

Decision: delete the handoff prompt entirely.

Remove `forkHandoffPrompt` from `packages/kernel/src/routes/sessions.ts:430-443`.

Replace the whole old source-participant mutation branch in `rebindForkAgents` at `packages/kernel/src/routes/sessions.ts:513-544`. In particular, remove:

- `writeActiveSession(participantId, forkSessionId)` at lines 513-517.
- Runtime-session overwrite on the source participant at lines 518-522.
- Source participant fork log append at lines 523-527.
- `forkHandoffPrompt` creation and `tmux.sendLiteralText`/`sendKey` at lines 528-535.
- Success result that reports the original tmux session as rebound at lines 537-544.

Participants that cannot be natively forked get structured warnings in `ForkedAgentResult.warning`. They never get text typed into their panes.

### [G] Codex `/fork` id reconciliation

Decision: do not use `/fork`. Reconcile Codex native ids from session storage around `codex fork <source_native_session_id>`.

Storage mechanism:

- Codex home is `runtime.env.CODEX_HOME`, else process env `CODEX_HOME`, else `$HOME/.codex`.
- Session JSONL files are under `$CODEX_HOME/sessions/YYYY/MM/DD/*.jsonl`, verified locally by listing `$HOME/.codex/sessions`.
- Parse only the first JSONL line and require `type === "session_meta"`.
- Native id is `payload.id`; the filename suffix also includes the id, but parsing JSON is the source of truth.
- Project scope is `payload.cwd === p.root()`.

Spawn/capture algorithm:

1. Acquire a Codex session-storage capture lock for this `CODEX_HOME`.
2. Snapshot known ids and paths before spawn.
3. Spawn `codex <runtime.args> fork <source_native_session_id>` in tmux with fork env.
4. Wait for `/Ask Codex/i`.
5. Rescan storage.
6. Filter new candidates to:
   - not present in the before snapshot
   - `payload.cwd === p.root()`
   - `payload.id !== source_native_session_id`
   - file mtime >= fork spawn start time minus 2 seconds
7. If exactly one candidate remains, write it to `RuntimeSessionInfo.native_session_id`.
8. If zero or multiple candidates remain, fail and roll back.
9. Release the capture lock.

No F-Mark folder rename happens. The F-Mark fork id remains the stable user-visible session id. Codex's native id is provider metadata.

### [H] Capabilities table

Decision: keep `verified:false` until the native fork hot tests and manual smoke checklist pass. Then flip Claude and Codex to `verified:true`; Gemini stays `verified:false` with notes explaining the clean fallback.

Update `packages/kernel/src/agents/capabilities.ts`:

- Claude `fork.notes`: state that F-Mark uses atomic `claude --resume <source> --fork-session --name <fork_id>` and verifies source transcript immutability in hot smoke.
- Codex `fork.notes`: state that F-Mark uses `codex fork <source_native_session_id>` and captures the new native id from `$CODEX_HOME/sessions`.
- Gemini `fork.notes`: state that no native Gemini fork exists in Gemini CLI 0.43.0; F-Mark launches a fresh fork-bound Gemini pane with warning.

The Phase 17 hot test must be replaced, not augmented, around `packages/kernel/tests/hot/phase17-session-fork-hot.mjs:435-491` and lines 617-624. The old text-handoff assertions must disappear. The new Phase 17 test must assert split participants, new tmux sessions, fork env at process start, no handoff text, and source state immutability.

## 4. Target sequence per runtime

### 4.1 Claude: ordered steps with sequencing guarantees + failure paths

1. Validate the source participant:
   - exists and `kind === "agent"`
   - `active_session === sourceSessionId`
   - not paused
   - managed and source tmux pane alive
   - `runtime_id === "claude"`

2. Resolve source Claude handle:
   - prefer `runtime_session.native_session_id`
   - else use `runtime_session.desired_name` only when `native_name_applied === true`
   - otherwise fail this participant with warning `Claude native source session handle is unknown; cannot fork without risking the source session`

3. Allocate fork participant id using `ag-f<hash>`, register it in participants, and write fork-side state before spawn:
   - `active-session=<fork_id>`
   - `runtime=claude`
   - `runtime-session.json` initially:

```json
{
  "desired_name": "<fork_id>",
  "native_name_applied": true,
  "native_parent_session_id": "<source_claude_handle>"
}
```

4. Snapshot Claude session storage for the project before spawn:
   - storage root: `$HOME/.claude/projects/<project-key>/*.jsonl`
   - verified local shape: files such as `$HOME/.claude/projects/-home-roey-workspace-F-Mark/d8d3d7e0-31e6-48b8-9fa7-4c54c02f8dd6.jsonl`
   - records include `sessionId` and `cwd` fields.

5. Spawn tmux:

```text
tmux new-session ... -e F_MARK_SESSION_ID=<fork_id> -e F_MARK_AGENT_ID=<fork_pid> -e F_MARK_RUNTIME_ID=claude -- claude <runtime.args> --resume <source_handle> --fork-session --name <fork_id>
```

Do not append launch prompt text.

6. Write fork `tmux-session` immediately after spawn returns. If this write fails, kill the new tmux session and remove fork participant state.

7. Wait strict readiness using Claude fork predicates. If timeout/capture error, kill the pane and remove fork participant state.

8. Confirm name application by pane title or snapshot containing `<fork_id>`. If not confirmed, kill and roll back.

9. Rescan Claude storage and capture the new native session id. Require exactly one new Claude session id for `cwd === p.root()` and id different from the source handle. If ambiguous, kill and roll back.

10. Update fork runtime-session:

```json
{
  "desired_name": "<fork_id>",
  "native_name_applied": true,
  "native_session_id": "<new_claude_session_id>",
  "native_parent_session_id": "<source_claude_handle>"
}
```

11. Append fork participant log:

```json
{
  "event": "fork-native",
  "runtime": "claude",
  "source_session": "<source_fmark_id>",
  "fork_session": "<fork_fmark_id>",
  "source_participant_id": "<source_pid>",
  "fork_participant_id": "<fork_pid>",
  "native_parent_session_id": "<source_claude_handle>",
  "native_session_id": "<new_claude_session_id>",
  "native_command": "claude --resume <source> --fork-session --name <fork_id>"
}
```

12. Return `status="rebound"`, `participant_id=<source_pid>`, `fork_participant_id=<fork_pid>`, `tmux_session=<new_tmux>`, `native_command=<command summary>`, `native_session_id=<new_claude_session_id>`.

### 4.2 Codex: ordered steps with sequencing guarantees + failure paths

1. Validate the source participant as connected, active on the source, not paused, and `runtime_id === "codex"`.

2. Resolve source Codex native id:
   - prefer `runtime_session.native_session_id`
   - else recover from `$CODEX_HOME/sessions/**/*.jsonl` only if exactly one candidate matches the project cwd and the source participant's spawn window
   - otherwise fail this participant with warning `Codex native source session id is unknown; cannot fork without guessing`

3. Allocate/register fork participant and write fork-side state before spawn:

```json
{
  "desired_name": "<fork_id>",
  "native_name_applied": false,
  "native_parent_session_id": "<source_codex_uuid>"
}
```

4. Acquire the Codex storage capture lock for `CODEX_HOME`.

5. Snapshot `$CODEX_HOME/sessions/**/*.jsonl`.

6. Spawn tmux:

```text
tmux new-session ... -e F_MARK_SESSION_ID=<fork_id> -e F_MARK_AGENT_ID=<fork_pid> -e F_MARK_RUNTIME_ID=codex -- codex <runtime.args> fork <source_codex_uuid>
```

Do not pass `[PROMPT]`.

7. Write fork `tmux-session`; on failure kill and roll back.

8. Wait strict readiness for `/Ask Codex/i`; on failure kill, roll back, release the storage lock.

9. Rescan Codex storage and capture exactly one new session id using the algorithm in section 3[G]. If zero or multiple candidates appear, kill, roll back, release lock, and return failed.

10. Update fork runtime-session:

```json
{
  "desired_name": "<fork_id>",
  "native_name_applied": false,
  "native_session_id": "<new_codex_uuid>",
  "native_parent_session_id": "<source_codex_uuid>"
}
```

11. Release storage lock, append fork participant log, return `status="rebound"` with `fork_participant_id`, new tmux session, native parent id, and native session id.

12. No Codex rename command is sent. No verified Codex CLI name flag exists in `codex fork --help` or `codex resume --help`, so F-Mark stores the desired name but does not claim native name application.

### 4.3 Gemini: ordered steps with sequencing guarantees + failure paths

1. Validate the source participant as connected, active on the source, not paused, and `runtime_id === "gemini"`.

2. Allocate/register fork participant and write fork-side state:

```json
{
  "desired_name": "<fork_id>",
  "native_name_applied": false,
  "native_parent_session_id": null
}
```

3. Spawn a fresh Gemini pane:

```text
tmux new-session ... -e F_MARK_SESSION_ID=<fork_id> -e F_MARK_AGENT_ID=<fork_pid> -e F_MARK_RUNTIME_ID=gemini -- gemini <runtime.args>
```

Do not pass `--resume`, `--session-id`, `--prompt`, or `--prompt-interactive`.

4. Write fork `tmux-session`; on failure kill and roll back.

5. Wait strict Gemini readiness. If readiness fails, kill and roll back.

6. Append fork participant log with `event="fork-fallback-fresh-runtime"` and warning text.

7. Return:

```json
{
  "participant_id": "<source_pid>",
  "fork_participant_id": "<fork_pid>",
  "runtime_id": "gemini",
  "display_name": "<same display name>",
  "status": "relaunched",
  "tmux_session": "<new_tmux>",
  "warning": "Gemini has no native fork command; launched a fresh Gemini session bound to the F-Mark fork. F-Mark event history was copied, but Gemini runtime context was not carried."
}
```

### 4.4 Unknown / unsupported runtime: fallback

For runtimes other than Claude, Codex, and Gemini, do not spawn by default and do not prompt. Return:

```json
{
  "participant_id": "<source_pid>",
  "runtime_id": "<runtime_id>",
  "display_name": "<name>",
  "status": "skipped-detached",
  "tmux_session": "<source_tmux>",
  "warning": "runtime <runtime_id> does not expose a verified native fork adapter; no handoff prompt was sent"
}
```

This can be extended later by adding a runtime adapter and capability entry.

## 5. Concurrent fork safety

Decision: serialize forks per project/source session and serialize provider session-id capture per provider storage root.

Problems in the current code:

- `allocateSessionId` in `packages/kernel/src/sessions.ts:73-83` checks for existence before create. Two concurrent forks with the same slug can both choose the same id before either rename lands.
- `forkSessionFolder` uses temp copy and `rename` at lines 145-158 but does not retry allocation if the target appears concurrently.
- Old `rebindForkAgents` mutates participant state by source participant id at `packages/kernel/src/routes/sessions.ts:513-522`, so concurrent fork calls can race on the same `active-session`.
- Provider storage diffing can become ambiguous if two native forks for the same `CODEX_HOME` or Claude project happen simultaneously.

Implementation:

- Add an in-process keyed mutex for `projectRoot + sourceSessionId`.
- Add an on-disk lock directory `.f-mark/locks/fork-<safeSourceSessionId>.lock` acquired with atomic `mkdir`. If the directory exists, wait with jitter until the active fork completes or a lock timeout is reached.
- Write lock metadata `{ pid, source_session_id, started_at }`. If the lock is older than a conservative timeout and the pid is dead, remove it as stale; otherwise return HTTP 409 after timeout.
- Acquire the source fork lock before `forkSessionFolder`. This makes same-source slug allocation deterministic: first fork gets `<date>-<slug>`, second fork sees the first result and gets `<date>-<slug>-2`.
- Keep `forkSessionFolder` temp-copy behavior. If `rename` still fails due to target existence, retry allocation inside the lock once; if it fails again, return 409.
- Add a separate provider capture lock keyed by `claude:<projectRoot>` and `codex:<CODEX_HOME>`. Hold it from native storage before-snapshot through after-scan. This avoids ambiguous "new session file" detection when two forks run concurrently in the same provider storage.
- Fork participant ids include `forkSessionId` in their hash, so two serialized forks generate distinct ids. If a collision exists from stale state, increment the attempt counter.
- Source participant state is never written, so concurrent forks cannot move the source pane away from the source session.

API behavior under concurrency:

- Two `/sessions/:id/fork` calls for the same source wait/serialize. Both may succeed with different fork ids.
- Two fork calls for different source sessions can proceed concurrently, except they serialize briefly if they need the same provider storage capture lock.
- If a second request times out waiting for the lock, it returns HTTP 409 with `error: "fork already in progress for session <id>"`.

## 6. File-by-file change list

`/home/roey/workspace/F-Mark/packages/kernel/src/routes/sessions.ts`

- Replace `rebindForkAgents` with a native fork orchestrator, for example `forkManagedAgentsNative`.
- Delete `forkHandoffPrompt`.
- Stop writing `active-session` and `runtime-session` for source participant ids.
- Create fork participant ids and fork-side agent state.
- Spawn new panes through runtime-specific adapters.
- Use strict readiness and rollback.
- Publish `session.forked` after all participant attempts complete; publish `managed-agent.updated` for fork-side participants.
- Update warnings aggregation to include Gemini fallback and native failures.

`/home/roey/workspace/F-Mark/packages/kernel/src/sessions.ts`

- Extend `ForkMetadata` with:
  - `source_agent_participant_ids: string[]`
  - `agent_participant_map: Record<string, string>`
- Treat `agent_participant_ids` as fork-side ids after native fork.
- Add retry support or expose allocation retry for lock-protected concurrent forks if needed.

`/home/roey/workspace/F-Mark/packages/kernel/src/agents/capabilities.ts`

- Update fork notes for Claude, Codex, and Gemini.
- Leave `verified:false` until the smoke checklist passes.
- After smoke, flip Claude and Codex fork `verified:true`; keep Gemini false.

`/home/roey/workspace/F-Mark/packages/kernel/src/routes/managedAgents.ts`

- Export or move reusable helpers for runtime args, strict readiness, and spawn rollback so fork orchestration uses the same canonical spawn mechanics.
- Do not make existing launch/reconnect prompt paths strict unless tests are updated for that wider behavior. Add a strict fork-only wrapper instead.
- Extend managed spawn/reconnect to capture and persist native runtime ids when possible, so future forks have source handles.

`/home/roey/workspace/F-Mark/packages/kernel/src/tmux/manager.ts`

- Keep existing `spawnAgent` env injection.
- Add `getPaneTitle(sessionName): Promise<string | null>` using `tmux display-message -p "#{pane_title}"` for Claude name confirmation.
- Optionally add `setUserOption` exposure only if tests need to tag fork metadata; not required for core flow.

`/home/roey/workspace/F-Mark/packages/kernel/src/runtimes/defaults.ts`

- No default runtime change required. The fork path should derive strict timeout from `readyDelayMs`.

`/home/roey/workspace/F-Mark/packages/kernel/src/hooks/autoStream.ts`

- Persist native runtime session ids opportunistically when hook payloads include `session_id`.
- After `resolveSessionId`, update `RuntimeSessionInfo.native_session_id` for the active participant if absent or if it matches the current fork.
- Preserve current session resolution order at lines 85-116; this is why fork-side state must exist before spawn.

`/home/roey/workspace/F-Mark/packages/kernel/src/services/agentState.ts`

- Extend `readRuntimeSession` validation to preserve optional fields:
  - `native_session_id`
  - `native_parent_session_id`
  - `native_transcript_path`
  - `native_id_source`
- Add `patchRuntimeSession(participantId, patch)` to avoid read-modify-write duplication.
- Add `removeAgentState(participantId)` for rollback cleanup.

`/home/roey/workspace/F-Mark/packages/kernel/src/participants.ts`

- Add `registerForkAgentParticipant`.
- Add `removeParticipant` for rollback before any events are written by the fork participant.
- Add optional participant metadata support:
  - `forked_from_participant_id`
  - `forked_from_session_id`
- Keep id validation compatible with `ID_PATTERN` at line 52.

`/home/roey/workspace/F-Mark/packages/kernel/src/project.ts`

- Extend kernel `Participant` with optional fork lineage metadata.

`/home/roey/workspace/F-Mark/packages/shared/src/participants.ts`

- Extend shared `Participant` with optional fork lineage metadata.

`/home/roey/workspace/F-Mark/packages/shared/src/sessions.ts`

- Extend `ForkedAgentResult` with optional:
  - `fork_participant_id?: string`
  - `native_session_id?: string | null`
  - `native_parent_session_id?: string | null`
  - `warning_code?: string`
- Keep existing status values. Use `"rebound"` for successful native runtime forks and `"relaunched"` for Gemini clean fallback.

`/home/roey/workspace/F-Mark/packages/shared/src/managedAgents.ts`

- Extend `RuntimeSessionInfo` with optional:
  - `native_session_id?: string | null`
  - `native_parent_session_id?: string | null`
  - `native_transcript_path?: string | null`
  - `native_id_source?: "spawn-storage" | "hook" | "recovered-storage" | "fork-storage" | "manual" | null`
- `AgentStatusRow` does not need a top-level field because it already includes `runtime_session`.

`/home/roey/workspace/F-Mark/packages/renderer/src/components/ForkSessionPopover.tsx`

- Treat `"rebound"` and `"relaunched"` as completed agent results.
- Display `agent.warning` text directly, not just derived status.
- Do not auto-close when Gemini fallback warning exists; the user should see that runtime context was not carried.
- If `fork_participant_id` is present, use it for any future detail link or chip lookup.

`/home/roey/workspace/F-Mark/packages/renderer/src/api/client.ts`

- No behavior change; shared response type update is enough.

`/home/roey/workspace/F-Mark/packages/kernel/src/mcp/tools.ts`

- Update the `fmark_fork_session` description to say "copy a F-Mark session and launch native/fallback fork-side managed agents" instead of "rebind active managed agents".
- No schema change unless a future caller needs an explicit `native_fork` option.

`/home/roey/workspace/F-Mark/packages/kernel/tests/hot/phase17-session-fork-hot.mjs`

- Replace handoff assertions and source participant rebinding assertions with split-participant assertions.
- Add fake native runtime scripts for Claude/Codex/Gemini-like behavior.
- Assert no `"F-Mark fork handoff"` appears anywhere.

`/home/roey/workspace/F-Mark/packages/kernel/tests/hot/phase18-session-fork-ui-hot.mjs`

- Update UI expectations for warnings and fork-side participants.
- Remove waits for handoff text.

`/home/roey/workspace/F-Mark/packages/kernel/tests/hot/phase18-session-fork-vendors-hot.mjs`

- Replace old vendor handoff smoke with native fork smoke.
- Assert source panes stay alive and source participant active sessions remain source.
- Assert new fork panes exist and fork participant active sessions are fork.
- Assert provider source transcript hashes do not change.

`/home/roey/workspace/F-Mark/packages/kernel/tests/mcp/tools.test.ts`

- Keep registration assertions.
- Update description assertions only if tests begin checking tool descriptions.

New file: `/home/roey/workspace/F-Mark/packages/kernel/src/runtimes/nativeFork.ts`

- Runtime adapter registry for Claude, Codex, Gemini fallback, and unknown.
- Argument builders.
- Provider storage scanners.
- Strict provider id capture.

New file: `/home/roey/workspace/F-Mark/packages/kernel/src/runtimes/sessionStorage.ts`

- Pure helpers to scan Claude and Codex session stores.
- Unit-testable parsing of JSONL first records.

New file: `/home/roey/workspace/F-Mark/packages/kernel/src/services/locks.ts`

- In-process keyed mutex plus on-disk lock-dir helper for fork serialization and provider capture serialization.

## 7. Type / contract changes

`ForkedAgentResult`:

```ts
interface ForkedAgentResult {
  participant_id: string;              // source participant id, preserved for request correlation
  fork_participant_id?: string;        // new fork-side participant id on rebound/relaunched
  runtime_id: string | null;
  display_name: string;
  status: "rebound" | "relaunched" | "skipped-paused" | "skipped-detached" | "failed";
  tmux_session?: string | null;        // fork tmux session on success, source tmux on skipped where useful
  native_command?: string | null;
  native_session_id?: string | null;
  native_parent_session_id?: string | null;
  warning?: string;
  warning_code?: string;
}
```

`RuntimeSessionInfo`:

```ts
interface RuntimeSessionInfo {
  desired_name: string | null;         // F-Mark desired display name/session binding
  native_name_applied: boolean;        // true only when the provider accepted a native display-name control
  native_session_id?: string | null;   // provider session id, e.g. Claude UUID or Codex UUID
  native_parent_session_id?: string | null;
  native_transcript_path?: string | null;
  native_id_source?: "spawn-storage" | "hook" | "recovered-storage" | "fork-storage" | "manual" | null;
}
```

`Participant`:

```ts
interface Participant {
  kind: "user" | "agent";
  name: string;
  color: string;
  runtime_id?: string;
  active_session?: string | null;
  forked_from_participant_id?: string;
  forked_from_session_id?: string;
}
```

`ForkMetadata`:

```ts
interface ForkMetadata {
  schema: "fmark.session-fork.v1";
  source_session_id: string;
  source_path: string;
  forked_at: string;
  requested_name: string;
  copied_head?: string;
  agent_participant_ids: string[];              // fork-side ids after this change
  source_agent_participant_ids?: string[];
  agent_participant_map?: Record<string, string>; // source id -> fork id
}
```

No new top-level `AgentStatusRow` field is required. The row already carries `runtime_session`, and fork lineage is available through participants and `.fork.json`.

## 8. Test plan

### 8.1 Unit tests to add/modify (vitest)

Add route-level fork tests in `packages/kernel/tests/routes/sessions.test.ts`:

- Source participant remains on source after fork.
- Fork participant is created with deterministic `ag-f<hash>` id.
- Fork participant `active-session` is written before `tmux.spawnAgent`.
- `tmux.spawnAgent` receives `F_MARK_SESSION_ID=<fork_id>`, `F_MARK_AGENT_ID=<fork_pid>`, `F_MARK_RUNTIME_ID=<runtime>`, and `F_MARK_PATH=<project>`.
- `sendLiteralText` and `sendKey` are never called during fork.
- Spawn failure removes fork participant state and leaves source state unchanged.
- Readiness timeout kills the new tmux session and removes fork participant state.
- Codex id capture ambiguity kills the new tmux session and returns `failed`.
- Gemini fallback returns `relaunched` and warning text.

Add storage parser tests in a new `packages/kernel/tests/runtimes/sessionStorage.test.ts`:

- Parse Codex `$CODEX_HOME/sessions/YYYY/MM/DD/*.jsonl` first-line `session_meta.payload.id`.
- Ignore Codex files with mismatched `cwd`.
- Return ambiguity when multiple new Codex files match.
- Parse Claude `.claude/projects/<project-key>/*.jsonl` `sessionId`/`cwd`.
- Do not read full transcript content beyond the first line when metadata is enough.

Add agent state tests in `packages/kernel/tests/services/agentState.test.ts`:

- `RuntimeSessionInfo` optional native fields round-trip.
- Unknown optional fields are either preserved or rejected intentionally; choose preservation for forward compatibility.
- `patchRuntimeSession` merges without dropping existing fields.
- `removeAgentState` removes active-session, tmux-session, runtime, runtime-session, state, and log files for rollback.

Add participants tests in `packages/kernel/tests/routes/participants.test.ts` or a new participants unit:

- `registerForkAgentParticipant` creates valid ids under `ID_PATTERN`.
- Fork lineage fields are persisted in `participants.json` and legacy config.
- `removeParticipant` is safe for rollback and does not remove source participants.

Add readiness tests in `packages/kernel/tests/routes/managedAgents.test.ts` or a new runtime-ready unit:

- Claude ready patterns pass only on real ready-like text.
- Codex requires `Ask Codex`.
- Gemini requires Gemini plus prompt/shell readiness.
- Timeout throws in strict mode and returns false only in legacy mode.

Update MCP tools test only if the description text is asserted. The current sync test at `packages/kernel/tests/mcp/tools.test.ts:119-142` should continue to pass.

### 8.2 Hot tests to extend (phase17/phase18 specifics)

Phase 17 replacement: `packages/kernel/tests/hot/phase17-session-fork-hot.mjs`

Replace, not augment, the current handoff contract:

- Replace `assertAgentSessions` at lines 435-463 so it asserts:
  - source live participant `active_session === sourceSessionId`
  - fork live participant `active_session === forkSessionId`
  - source live participant `tmux_session === source tmux`
  - fork live participant `tmux_session !== source tmux`
  - fork runtime-session desired name is fork id
  - fork runtime-session native id is present for fake Claude/Codex
- Replace `runMcpPostAfterHandoff` at lines 465-491 with two MCP checks:
  - MCP env using source participant without explicit session writes to source.
  - MCP env using fork participant without explicit session writes to fork.
- Replace the call/assert block at lines 567-579 so success results are keyed by `fork_participant_id`, while `participant_id` remains the source id.
- Replace websocket assertion at lines 586-593 to wait for `managed-agent.updated` on `fork_participant_id`, not source id.
- Replace `.fork.json` assertion at lines 599-603 to require `agent_participant_ids` contains fork ids and `agent_participant_map[source] === fork`.
- Delete the handoff wait at lines 617-624 and assert capture files/panes do not include `"F-Mark fork handoff"`.

Use fake runtime executables:

- `fake-claude`: accepts `--resume`, `--fork-session`, `--name`; writes a fake Claude JSONL in a temp `.claude/projects` tree; prints `Try "..." for shortcuts` and the fork name; blocks until killed.
- `fake-codex`: accepts `fork <source-id>`; writes a fake Codex session JSONL under temp `CODEX_HOME/sessions/YYYY/MM/DD`; prints `Ask Codex`; blocks.
- `fake-gemini`: accepts normal args; prints `Gemini shell mode`; blocks.

Phase 18 UI: `packages/kernel/tests/hot/phase18-session-fork-ui-hot.mjs`

- Replace waits for capture text at lines 433-434 and 473-479.
- Assert the UI displays Gemini warning text when a Gemini fallback is present.
- Assert source participant remains on source and a new fork participant chip appears when the fork is current.
- Keep row-selection and draft-preservation assertions at lines 426-431 and 462-472.

Phase 18 vendor: `packages/kernel/tests/hot/phase18-session-fork-vendors-hot.mjs`

- Replace `checkNativeHelp` at lines 507-519 with stricter help assertions:
  - Claude help has `--fork-session`, `--name`, and `--resume`.
  - Codex help has `fork`, `resume`, and optional `[PROMPT]`.
  - Gemini help has no fork command.
- Replace the old fork assertion at lines 582-624:
  - Seed or recover real native session ids for Claude and Codex in temp provider homes.
  - Snapshot source provider JSONL hashes.
  - Call `/sessions/:id/fork`.
  - Assert source tmux sessions remain alive and source active sessions remain source.
  - Assert new fork tmux sessions exist for Claude, Codex, and Gemini.
  - Assert Claude/Codex fork participants are `rebound`, Gemini is `relaunched` with warning.
  - Assert no pane contains `"F-Mark fork handoff"`.
  - Assert source provider JSONL hashes are unchanged.
  - Assert new provider native ids are recorded in fork participant runtime-session.

Keep the post-fork real model MCP write check at lines 630-635, but target fork participant ids where applicable and explicitly verify source session absence.

### 8.3 Manual smoke checklist that flips capabilities.ts verified:true

Run these only in isolated temp homes/projects or disposable sessions.

1. CLI help smoke:

```bash
claude --version
claude --help | rg -- '--fork-session|--name|--resume|--session-id'
codex --version
codex --help | rg 'resume|fork'
codex resume --help | rg 'Usage: codex resume|SESSION_ID|PROMPT'
codex fork --help | rg 'Usage: codex fork|SESSION_ID|PROMPT'
gemini --version
gemini --help | rg 'fork|resume|session-id|list-sessions'
```

2. Claude native fork smoke:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/home" "$tmp/project"
HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/xdg" claude --help >/dev/null
# Create or identify a disposable Claude source session in "$tmp/project".
# Record its JSONL path under "$tmp/home/.claude/projects".
sha256sum "$source_jsonl" > "$tmp/source.before"
tmux -L fmark-claude-smoke new-session -d -s claude-fork -c "$tmp/project" -- \
  env HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/xdg" \
  claude --resume "$source_handle" --fork-session --name fmark-smoke-fork
# Wait for ready predicate and new JSONL, then:
sha256sum "$source_jsonl" > "$tmp/source.after"
diff -u "$tmp/source.before" "$tmp/source.after"
tmux -L fmark-claude-smoke kill-server
```

3. Codex native fork smoke:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/home/.codex" "$tmp/project"
CODEX_HOME="$tmp/home/.codex" HOME="$tmp/home" codex --help >/dev/null
# Create or identify a disposable Codex source session in "$tmp/project".
sha256sum "$source_jsonl" > "$tmp/source.before"
tmux -L fmark-codex-smoke new-session -d -s codex-fork -c "$tmp/project" -- \
  env HOME="$tmp/home" CODEX_HOME="$tmp/home/.codex" \
  codex --no-alt-screen -C "$tmp/project" -a never -s workspace-write fork "$source_codex_uuid"
# Wait for Ask Codex and one new JSONL under CODEX_HOME/sessions.
sha256sum "$source_jsonl" > "$tmp/source.after"
diff -u "$tmp/source.before" "$tmp/source.after"
tmux -L fmark-codex-smoke kill-server
```

4. Gemini fallback smoke:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/home" "$tmp/project"
tmux -L fmark-gemini-smoke new-session -d -s gemini-fork -c "$tmp/project" -- \
  env HOME="$tmp/home" F_MARK_SESSION_ID=fork-smoke F_MARK_AGENT_ID=ag-fsmoke F_MARK_RUNTIME_ID=gemini \
  gemini --skip-trust --approval-mode yolo
# Wait for Gemini readiness and verify no prompt text was typed.
tmux -L fmark-gemini-smoke kill-server
```

5. F-Mark end-to-end:

```bash
pnpm -F f-mark build
FMARK_HOT=1 node packages/kernel/tests/hot/phase17-session-fork-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase18-session-fork-ui-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase18-session-fork-vendors-hot.mjs
```

Flip `capabilities.ts` Claude/Codex `verified:true` only after these pass and the hot report records provider source transcript immutability.

## 9. Risk register

| Risk | Likelihood | Mitigation | Detection signal in tests |
|---|---:|---|---|
| Claude `--fork-session` still appends metadata to the source JSONL | Medium | Hash source provider transcript before/after; do not ship Claude adapter if source content changes | Phase 18 vendor source hash diff fails |
| Codex `codex fork` mutates source JSONL | Medium | Use `codex fork` instead of resume-plus-slash; hash source transcript before/after | Phase 18 vendor Codex hash diff fails |
| Existing Codex source sessions have no native id in F-Mark state | High for old sessions | Capture ids on future spawn/hook; attempt unique storage recovery; fail with warning if ambiguous | Unit test for unknown/ambiguous recovery returns failed |
| Provider storage diff captures the wrong new session under concurrent forks | Medium | Provider capture lock per Claude project/CODEX_HOME; require cwd and mtime filters | Concurrent hot/unit test creates two sessions and expects ambiguity or serialization |
| Readiness predicate false-positive publishes agent before runtime can receive hooks/MCP | Medium | Strict predicates; require provider id capture for Claude/Codex | Fake runtime delayed-ready test fails if published early |
| Readiness predicate false-negative kills valid panes | Medium | Vendor hot captures last pane snapshot in failure warning; predicates can be tuned from real outputs | Vendor hot timeout with snapshot tail |
| Rollback leaves orphan tmux panes | Medium | Kill on every post-spawn failure; test `tmux list` after failed fork | Route unit and hot failure injection |
| Rollback leaves orphan fork participants | Medium | Add `removeParticipant` and `removeAgentState`; rollback tests inspect participants/state dirs | Unit tests after injected failures |
| UI shows duplicate names and users cannot tell source/fork agents apart | Medium | Current-session filtering shows only fork participants in fork view; lineage metadata available for detail UI | UI hot asserts fork chip appears only in fork session |
| Gemini users assume runtime context carried | High | Always return warning and keep popover open when warnings exist | UI hot checks warning text |
| Old MCP clients expect `participant_id` to be the moved agent | Medium | Preserve `participant_id` as source id and add `fork_participant_id`; do not remove existing fields | Type tests and Phase 17 MCP fork tool case |
| Lock directory becomes stale after kernel crash | Low | Lock metadata with pid/started_at; stale lock cleanup after timeout | Lock unit test with fake stale pid |
| Runtime args order breaks `codex fork` or Claude resume | Medium | Adapter-specific arg builder tests and vendor hot with configured args | Unit arg snapshot + Phase 18 vendor |
| No native name confirmation for Claude in pane title/snapshot | Medium | Treat as open verification before flipping verified; if not exposed, record `native_name_applied` only after alternate verified signal | Manual smoke item fails |

## 10. Rollout strategy

Use a hard cutover for `/sessions/:id/fork`. The current handoff behavior is explicitly wrong for the product goal, so it should not remain behind a default path or silently activate for unsupported runtimes.

Compatibility choices:

- Keep the same HTTP route and MCP tool schema.
- Keep existing `relaunch_agents:false`; it still copies the session folder and returns skipped agent results without spawning fork panes.
- Preserve `ForkedAgentResult.participant_id` as the source participant id and add `fork_participant_id` for new panes.
- Preserve status values. Successful Claude/Codex native forks use `"rebound"`, Gemini clean fallback uses existing `"relaunched"`, skipped paused/detached stay the same, failures stay `"failed"`.
- Existing renderer and MCP callers continue to receive `source_session_id`, `session`, `copied_entries`, `agents`, and `warnings`.

Renderer behavior:

- `ForkSessionPopover` keeps calling the same client method.
- It should keep the popover open when warnings exist, especially Gemini fallback.
- It should refresh status and participants after fork as it does now at `packages/renderer/src/components/ForkSessionPopover.tsx:76-104`.

MCP behavior:

- `fmark_fork_session` continues forwarding to the route at `packages/kernel/src/mcp/tools.ts:134-143`.
- Tool description changes to explain native/fallback fork-side agents.
- MCP callers see structured warnings instead of handoff text.

Capabilities rollout:

- Land code with `verified:false` and updated notes.
- Run fake hot tests and real vendor smoke.
- Flip Claude/Codex `verified:true` in a follow-up patch only after the smoke report proves source transcript immutability and native id capture.

Failure rollout:

- If a runtime cannot be safely forked, the F-Mark session folder is still copied and the response contains a per-agent failure/warning.
- Source panes are never downgraded or stopped because a fork-side launch failed.

## 11. Open verification needed before coding starts

These are the items I could not safely verify here without creating or mutating real provider runtime sessions. They should be run in disposable temp homes/projects before implementation or before flipping capabilities to verified.

1. Verify Claude `--name` survives `--fork-session` and is observable.

Command:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/home" "$tmp/xdg" "$tmp/project"
# Create a disposable source Claude session in "$tmp/project" with --name fmark-source-smoke.
# Then:
tmux -L fmark-claude-name-smoke new-session -d -s claude-fork -c "$tmp/project" -- \
  env HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/xdg" \
  claude --resume fmark-source-smoke --fork-session --name fmark-fork-smoke
tmux -L fmark-claude-name-smoke capture-pane -t claude-fork -p -e -J -S -2000
tmux -L fmark-claude-name-smoke display-message -t claude-fork -p '#{pane_title}'
tmux -L fmark-claude-name-smoke kill-server
```

Success: pane title or snapshot contains `fmark-fork-smoke`, and a new Claude JSONL session id exists.

2. Verify Claude source transcript immutability.

Command:

```bash
sha256sum "$source_claude_jsonl" > "$tmp/source.before"
# Run the Claude fork command above and wait until ready.
sha256sum "$source_claude_jsonl" > "$tmp/source.after"
diff -u "$tmp/source.before" "$tmp/source.after"
```

Success: no content hash change.

3. Verify Codex `codex fork <id>` starts an interactive fork without a prompt.

Command:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/home/.codex" "$tmp/project"
# Create or identify a disposable source Codex interactive session id.
tmux -L fmark-codex-fork-smoke new-session -d -s codex-fork -c "$tmp/project" -- \
  env HOME="$tmp/home" CODEX_HOME="$tmp/home/.codex" \
  codex --no-alt-screen -C "$tmp/project" -a never -s workspace-write fork "$source_codex_uuid"
tmux -L fmark-codex-fork-smoke capture-pane -t codex-fork -p -e -J -S -2000
find "$tmp/home/.codex/sessions" -type f -name '*.jsonl' -print
tmux -L fmark-codex-fork-smoke kill-server
```

Success: pane reaches `Ask Codex`, exactly one new session JSONL appears, and no initial prompt was consumed.

4. Verify Codex source transcript immutability.

Command:

```bash
sha256sum "$source_codex_jsonl" > "$tmp/source.before"
# Run codex fork smoke above and wait until ready.
sha256sum "$source_codex_jsonl" > "$tmp/source.after"
diff -u "$tmp/source.before" "$tmp/source.after"
```

Success: no content hash change.

5. Verify Codex session file metadata is stable across TUI and fork sessions.

Command:

```bash
node -e '
const fs=require("fs");
for (const p of process.argv.slice(1)) {
  const first=fs.readFileSync(p,"utf8").split(/\n/,1)[0];
  const o=JSON.parse(first);
  console.log(JSON.stringify({path:p,type:o.type,id:o.payload?.id,cwd:o.payload?.cwd,source:o.payload?.source,cli_version:o.payload?.cli_version}));
}
' "$tmp/home/.codex"/sessions/*/*/*/*.jsonl
```

Success: fork session first line has `type:"session_meta"`, a UUID-like `payload.id`, and `payload.cwd` equal to the project root.

6. Verify Gemini fallback readiness without prompt.

Command:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/home" "$tmp/project"
tmux -L fmark-gemini-fresh-smoke new-session -d -s gemini-fresh -c "$tmp/project" -- \
  env HOME="$tmp/home" F_MARK_PATH="$tmp/project" F_MARK_SESSION_ID=fork-smoke F_MARK_AGENT_ID=ag-fsmoke F_MARK_RUNTIME_ID=gemini \
  gemini --skip-trust --approval-mode yolo
tmux -L fmark-gemini-fresh-smoke capture-pane -t gemini-fresh -p -e -J -S -2000
tmux -L fmark-gemini-fresh-smoke kill-server
```

Success: pane reaches a Gemini input-ready state, and no F-Mark prompt/handoff text appears.

7. Verify existing-session native id recovery rules.

Command:

```bash
# In a temp project with one known Codex source session:
find "$CODEX_HOME/sessions" -type f -name '*.jsonl' -print
# Then run the planned parser against the project root and spawn-log timestamp.
```

Success: recovery returns exactly one id. If multiple candidates match, the implementation must return a warning/failure rather than guessing.

8. Verify tmux pane title access on this tmux version.

Command:

```bash
tmux -V
tmux new-session -d -s fmark-title-smoke -- sleep 30
tmux display-message -t fmark-title-smoke -p '#{pane_title}'
tmux kill-session -t fmark-title-smoke
```

Success: command returns a title string without error. Local `tmux -V` already returned `tmux 3.4`.
