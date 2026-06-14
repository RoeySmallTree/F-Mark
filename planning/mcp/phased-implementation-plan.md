# MCP Full Implementation Phase Plan

> Date: 2026-05-25
> Purpose: break the MCP grand plan into the smallest buildable, testable phases that can be safely layered without architectural backtracking.

## Verified Local Baseline

These checks were run in this workspace before writing the phase plan:

- Node: `v24.15.0`
- pnpm: `10.33.2`
- tmux: `3.4`
- Claude Code: `2.1.128`
- Codex CLI: `0.133.0`
- Gemini CLI: `0.43.0`
- MCP SDK registry version: `@modelcontextprotocol/sdk` `1.29.0`
- Claude MCP command shape: `claude mcp add [--transport stdio|sse|http] [--scope local|user|project]`
- Codex MCP command shape: `codex mcp add <name> (--url <url> | -- <command>...)`
- Gemini MCP command shape: `gemini mcp add [--scope user|project] [--transport stdio|sse|http]`

## Execution Rules

Every phase has a hot gate. Do not build code in phase N+1 on an assumption from phase N until the hot gate has produced a written result.

Hot tests must:

- use real local SDKs/CLIs when the phase depends on runtime behavior,
- use real F-Mark temp projects and real F-Mark sessions,
- use isolated temp config homes for vendor config writes,
- avoid writing secrets into project config,
- record the exact command, config path, expected state, observed state, and pass/fail result,
- append results to the relevant `planning/mcp/research-*.md` file or to `planning/mcp/research-smoke-tests.md`.

Implementation must keep one canonical backend/frontend contract:

- Shared request/response/event/control types live in `packages/shared/src/*.ts`.
- Kernel routes import shared types where possible.
- Renderer API client imports shared types instead of redefining route shapes locally.
- New route contracts ship before backend and frontend teams implement against them.
- Any temporary compatibility bridge must be named as a bridge and have an exit phase.

## Hot Test Harness

All runtime hot tests should use this isolation pattern:

```bash
ROOT="$(mktemp -d /tmp/fmark-hot-project-XXXXXX)"
HOME_DIR="$(mktemp -d /tmp/fmark-hot-home-XXXXXX)"
XDG_DIR="$(mktemp -d /tmp/fmark-hot-xdg-XXXXXX)"
export HOME="$HOME_DIR"
export XDG_CONFIG_HOME="$XDG_DIR"
export CODEX_HOME="$HOME_DIR/.codex"
```

Expected F-Mark session setup for hot tests:

1. Build or run the kernel from the local workspace.
2. Initialize a temp project at `$ROOT`.
3. Start the kernel with `--path "$ROOT"` and an explicit test port.
4. Create a session through `POST /sessions` with a unique slug.
5. Register or spawn one managed agent participant.
6. Verify event files in `$ROOT/.f-mark/sessions/<session-id>/`.
7. Close kernel/tmux sessions and delete temp config homes after the test.

Hot tests that may open vendor CLIs should be marked manual or guarded by `FMARK_HOT=1`. Automated CI should run mocked/unit/integration tests by default.

## Shared Interface Boundary

Create these shared contract files before feature implementation:

- `packages/shared/src/integrations.ts`
  - `RuntimeId`
  - `IntegrationScope`
  - `IntegrationCheck`
  - `IntegrationLocation`
  - `IntegrationApplyRequest`
  - `IntegrationApplyResponse`
  - `McpInstallStatus`
  - `HookInstallStatusV2`
  - `RuntimeCapability`
- `packages/shared/src/agentState.ts`
  - `ManagedAgentState`
  - `RuntimeSessionIdentity`
  - `AgentContextStatus`
  - `AgentAccessStatus`
  - `AgentStatusRow`
  - `AgentActivityState`
  - `AgentConnectionState`
- `packages/shared/src/compass.ts`
  - `CompassPacket`
  - `InboxItem`
  - `GetInboxRequest`
  - `GetInboxResponse`
  - `MarkSeenRequest`
- `packages/shared/src/sessionForking.ts`
  - `ForkSessionRequest`
  - `ForkSessionResponse`
  - `ForkedAgentResult`
  - `RuntimeForkCapability`
- `packages/shared/src/accessRequests.ts`
  - `AccessRequestPayload`
  - `AccessResponsePayload`
- `packages/shared/src/subagents.ts`
  - `SubagentRunPayload`
  - `SubagentOutputPayload`
  - `SubagentCapability`

Renderer API additions should be typed from these shared files. Backend route-local interfaces may exist only for validation narrowing, not as a second source of truth.

## Phase 0: Baseline Hot-Test Matrix

Goal: prove the test substrate and runtime command assumptions before implementation starts.

Backend work:

- Add `planning/mcp/research-smoke-tests.md` as the running log.
- Add a local hot-test helper doc or script skeleton under `packages/kernel/tests/hot/README.md`.
- Add no production behavior.

Frontend work:

- None.

Hot gates:

- Run `claude --version`, `codex --version`, `gemini --version`, `tmux -V`, `pnpm view @modelcontextprotocol/sdk version`.
- Run `claude mcp add --help`, `codex mcp add --help`, `gemini mcp add --help`.
- Create one temp F-Mark project and one session through existing REST routes.
- Verify expected session folder exists and is empty except event files created by the test.

Expected result:

- A smoke log states the exact local versions and command syntax.
- A temp session id like `<date>-mcp-hot-baseline` exists during the test and is deleted afterward.

Exit criteria:

- No implementation phase may start until this smoke log exists.

## Phase 1: Shared Contracts Only

Goal: establish the backend/frontend contract without changing runtime behavior.

Backend work:

- Add shared contract files listed in "Shared Interface Boundary".
- Export them from `packages/shared/src/index.ts`.
- Replace duplicated renderer-local route types where safe, but do not change route behavior.

Frontend work:

- Update `packages/renderer/src/api/client.ts` imports to use shared contracts for existing compatible types.
- Leave UI unchanged.

Hot gates:

- `pnpm -F @f-mark/shared build`
- `pnpm -F f-mark test`
- `pnpm -F @f-mark/renderer test`

Expected result:

- Generated shared declarations compile.
- No event files or route responses change.

Exit criteria:

- FE and BE teams can import identical interfaces before implementing any new route.

## Phase 2: Canonical Agent State Store

Goal: remove the active-session storage split before MCP, fork, wake, and hooks build on it.

Backend work:

- Add `packages/kernel/src/services/agentState.ts`.
- Move active-session read/write behind one `AgentStateStore`.
- Bridge legacy locations during migration:
  - current `agentsDirFor(...)` managed-agent state,
  - legacy `join(p.fmarkDir(), "agents")` writes from `/agents/:id/link`,
  - hook auto-stream active-session lookup,
  - participant/link use cases.
- Add `runtime_session`, `paused`, `activity_state`, `connection_state`, `context`, and `access` fields with defaults.
- Add `managed-agent.updated` websocket message type in shared contracts.
- Keep `/managed-agents` old shape intact or add compatible fields only.

Frontend work:

- Accept extra fields from `/managed-agents`.
- No visible UI change yet.

Hot gates:

- Unit tests for resolver precedence and legacy bridge reads/writes.
- Existing `packages/kernel/tests/agents/activeSession.test.ts`.
- Existing `packages/kernel/tests/routes/agents.test.ts`.
- Existing `packages/kernel/tests/routes/managedAgents.test.ts`.
- Real session hot test:
  1. create session A,
  2. link agent through `/agents/:id/link`,
  3. read through `AgentStateStore`,
  4. spawn managed agent linked to session B,
  5. verify store reports B and legacy bridge agrees.

Expected result:

- One resolver answers active session for participants, hooks, managed status, MCP context, fork, and wake.

Exit criteria:

- No later phase reads/writes active-session files directly.

## Phase 3: Event Service Extraction And Publisher Contract

Goal: let REST and MCP share the same event-writing path.

Backend work:

- Add `packages/kernel/src/services/events.ts`.
- Move prose, turn-end, tool-use, choices, todo, html, flow, and file write orchestration into service functions.
- Add `packages/kernel/src/services/eventPublisher.ts`.
- Routes call services and publisher instead of owning write/publish logic.
- Preserve stale-path behavior.

Frontend work:

- None.

Hot gates:

- Existing event route tests.
- Existing event writer/reader/prose/tool-use tests.
- Existing websocket event tests.
- Real session hot test:
  1. create one session,
  2. post prose, todo, flow, html, tool-use, turn-end through REST,
  3. verify each file exists with the same suffix and payload shape as before,
  4. verify websocket `event_added` fires once per write.

Expected result:

- REST behavior is byte-compatible except for allowed metadata additions.

Exit criteria:

- MCP tools can call services without duplicating route logic.

## Phase 4: MCP SDK Stdio Spike

Goal: prove the selected SDK works before adding F-Mark tools.

Backend work:

- Add `@modelcontextprotocol/sdk@1.29.0` and `zod`.
- Add a throwaway test-only MCP stdio server under `packages/kernel/tests/mcp/fixtures`.
- Do not expose `f-mark mcp` yet.

Frontend work:

- None.

Hot gates:

- SDK unit test starts a stdio server and calls one echo tool through an SDK client or JSON-RPC harness.
- Confirm stdout contains only MCP JSON-RPC and diagnostics go to stderr.
- Run the throwaway server through at least one runtime's MCP config in a temp HOME:
  - Claude project or local scope,
  - Codex user config or direct temp `CODEX_HOME/config.toml`,
  - Gemini project scope.

Expected result:

- Each runtime can discover or list a test MCP server without touching real user config.

Exit criteria:

- F-Mark MCP implementation may begin only after the SDK transport is proven.

## Phase 5: `f-mark mcp` Minimal Stdio Server

Goal: expose the first real MCP tools through stdio.

Backend work:

- Add CLI subcommand `f-mark mcp`.
- Add modules:
  - `packages/kernel/src/mcp/server.ts`
  - `packages/kernel/src/mcp/context.ts`
  - `packages/kernel/src/mcp/tools.ts`
  - `packages/kernel/src/mcp/resources.ts`
  - `packages/kernel/src/mcp/stdio.ts`
- Implement context resolution:
  1. explicit tool input,
  2. `AgentStateStore.active_session`,
  3. legacy bridge,
  4. env fallback.
- Implement minimal tools:
  - `fmark_read_events`
  - `fmark_post_prose`
  - `fmark_end_turn`
- Implement `fmark://guide` resource.
- Mutating tools proxy to the running kernel HTTP API using `.f-mark/config.json` and `.f-mark/.token`.

Frontend work:

- None.

Hot gates:

- Unit tests for tool schemas and context defaulting.
- JSON-RPC harness test:
  1. create temp project/session/participant,
  2. start kernel on random port,
  3. run `f-mark mcp` against that project,
  4. call `fmark_post_prose` without explicit auth,
  5. verify a prose file lands in the active session.
- Negative tests:
  - no active session returns a clear "link first" error,
  - stale token fails cleanly,
  - unknown participant fails cleanly.

Expected result:

- A model can write a hello and end turn through MCP without REST instructions.

Exit criteria:

- Minimal MCP is real but not yet automatically installed.

## Phase 6: MCP-Only Guide And REST Variant

Goal: stop managed agents from seeing raw REST guidance in normal launch.

Backend work:

- Rewrite `/guide` to be MCP-first and REST-free.
- Add `/guide-rest-variant`.
- Add runtime parameter handling that mentions MCP tools for Claude/Codex/Gemini.
- Preserve composable-prose guidance.

Frontend work:

- Update any guide links/settings labels if they point to old REST guide.

Hot gates:

- Route tests:
  - `/guide` contains MCP tool names,
  - `/guide` contains no curl or endpoint reference table,
  - `/guide-rest-variant` contains REST protocol reference.
- Real hot test:
  1. create session,
  2. fetch `/guide?runtime_id=claude`,
  3. verify first action tells agent to use `fmark_post_prose` and `fmark_end_turn`.

Expected result:

- Managed first prompt can embed `/guide` directly.

Exit criteria:

- Spawn integration can depend on guide text being correct.

## Phase 7: Integration Preflight API, Detection Only

Goal: let the UI ask what is missing without writing config.

Backend work:

- Add shared integration contracts.
- Add route:
  - `POST /managed-agents/preflight`
- Add `packages/kernel/src/mcpInstall/{types,claude,codex,gemini,index}.ts`.
- Detect:
  - runtime executable/version,
  - MCP installed/missing/stale/blocked,
  - hook installed/missing/stale/unsupported,
  - exact local/global config paths,
  - safe auto-apply availability.
- Do not write files yet.

Frontend work:

- Add API client method typed from shared contracts.
- No modal changes yet.

Hot gates:

- Detection unit tests with temp HOME/XDG/CODEX_HOME.
- Runtime CLI hot tests:
  - create isolated config for Claude, Codex, Gemini,
  - run preflight,
  - expect missing locally/globally,
  - write a fake current version entry,
  - expect installed,
  - write an older version,
  - expect stale/update available,
  - corrupt JSON/TOML,
  - expect blocked with path and reason.

Expected result:

- Clicking a runtime can know whether setup is clean before spawn.

Exit criteria:

- Apply routes may be built only after detection is reliable.

## Phase 8: Integration Apply API, Stdio MCP First

Goal: automatically install/update MCP and hooks where safe.

Backend work:

- Add route:
  - `POST /managed-agents/integration-apply`
- Implement stdio MCP apply per runtime:
  - Claude local/project/user as verified,
  - Codex user via CLI where safe and project via TOML writer,
  - Gemini project/user settings with `trust:false`.
- Implement version markers.
- Preserve existing config; never overwrite invalid config.
- Keep HTTP snippets advanced/manual only.

Frontend work:

- Add API client method.
- No full modal yet.

Hot gates:

- File write unit tests for JSON/TOML merge behavior.
- Runtime hot tests in isolated config homes:
  - apply local,
  - run runtime MCP list/status command,
  - verify `f-mark` entry exists and carries version marker,
  - update stale version,
  - verify no duplicate entry.
- Negative hot tests:
  - invalid config is not overwritten,
  - project config never contains bearer token,
  - Gemini `trust` remains false unless user explicitly chooses otherwise in a future feature.

Expected result:

- Kernel can install MCP in a temp project/user scope without manual copy/paste.

Exit criteria:

- UI setup can call preflight/apply safely.

## Phase 9: Spawn Sequencing And First Prompt Injection

Goal: make managed launch setup-first and guide-injected.

Backend work:

- Update `POST /managed-agents/spawn` to:
  - quick-check preflight,
  - register/reuse participant,
  - randomize display name when omitted,
  - set `runtime_session.desired_name` to active F-Mark session id,
  - pass vendor-native name only where supported,
  - inject full `/guide` plus first compass packet,
  - return `mcp_status` and `hooks_status`.
- Preserve old spawn behavior for API callers as a fallback route contract.

Frontend work:

- No new modal yet.
- Accept new response fields and chip states.

Hot gates:

- Route tests with fake tmux/input queue:
  - spawn does not inject REST guide,
  - spawn includes display name, participant id, session id, MCP reminder,
  - spawn returns `mcp_status`.
- Real tmux hot test:
  1. create temp session,
  2. spawn a benign runtime command such as shell/terminal test runtime,
  3. capture tmux pane,
  4. verify full first prompt arrived intact and did not interleave.
- Vendor hot tests:
  - Claude launch receives `--name <fmark-session-id>` when supported by runtime config,
  - Codex/Gemini store desired name but do not fake a native name.

Expected result:

- A launched agent receives all guidance without fetching `/guide`.

Exit criteria:

- Renderer can safely turn runtime click into preflight/apply/spawn flow.

## Phase 10: Integration Setup UI

Goal: replace spawn-now UX with seamless setup-first UX.

Backend work:

- Stabilize preflight/apply response errors for UI display.

Frontend work:

- Rename/generalize hook modal to `IntegrationSetupModal`.
- Add MCP and hook status panels.
- Add Local/Global scope selector.
- Add install/update-and-launch actions.
- Add launch-only path only when MCP is installed or explicit fallback is safe.
- Add exact config paths and version indicators.
- Add blocked/invalid config states.

Shared boundary:

- UI consumes only `IntegrationCheck`, `IntegrationLocation`, and `IntegrationAction` from shared types.

Hot gates:

- Renderer tests:
  - green preflight launches immediately,
  - missing/stale opens modal,
  - local/global action calls apply then spawn,
  - blocked config shows reason and no spawn.
- Manual browser hot test:
  1. start kernel,
  2. click Claude with missing temp config,
  3. verify setup sheet,
  4. install locally and launch,
  5. verify agent chip appears and no broken hook-only language appears.

Expected result:

- User clicks a runtime and either launches or gets one setup sheet.

Exit criteria:

- The old hook-only install path can move under integrations.

## Phase 11: Full MCP Tool Set

Goal: cover the collaboration surface currently taught by `/guide`.

Backend work:

- Add MCP tools:
  - participants/session create/list/link,
  - `fmark_get_inbox`,
  - `fmark_read_event`,
  - `fmark_mark_seen`,
  - todos,
  - choices,
  - flow/html/file metadata,
  - `fmark_request_access`.
- Add resources for participants, sessions, events, todos, inbox.
- Add prompts for join, review, todos, flow, composable docs.
- Add Gemini schema compatibility tests.

Frontend work:

- None unless new event kinds from access request are introduced in this phase; otherwise defer cards.

Hot gates:

- MCP schema snapshot tests.
- JSON-RPC harness for each tool against a real temp kernel/session.
- Runtime hot test for each vendor:
  1. install stdio MCP in isolated config,
  2. start runtime with a prompt that asks it to list tools or use `fmark_post_prose`,
  3. verify the F-Mark event file is created,
  4. verify no REST instruction was needed.

Expected result:

- F-Mark collaboration can be done entirely through MCP tools.

Exit criteria:

- Wake and inbox flows can depend on MCP tools existing.

## Phase 12: Compass Cursors, Inbox, And Wake Backend

Goal: make agents aware of deltas without dumping session context.

Backend work:

- Add `packages/kernel/src/compass/{cursors,packet,inbox}.ts`.
- Store per-agent per-session cursor state through `AgentStateStore`.
- Implement first-prompt and wake-prompt packet builders.
- Implement `POST /sessions/:id/wake`.
- Wake matrix:
  - no-mention message wakes all active unpaused agents,
  - mention wakes tagged agents,
  - comment wakes tagged agents plus commented-content author,
  - todo creation/edit wakes dirty assignees.
- `fmark_get_inbox` marks returned items seen automatically.

Frontend work:

- Add API client `wakeSession`.
- No mention UI yet.

Hot gates:

- Unit tests for cursor advancement.
- Route tests for wake target resolution and paused filtering.
- Real session hot test:
  1. create two agents in one session,
  2. post user prose,
  3. wake session,
  4. verify both panes receive bounded compass packet,
  5. call `fmark_get_inbox`,
  6. verify cursor advances and second call is empty.

Expected result:

- Agents get the delta pushed and can pull details selectively.

Exit criteria:

- Mention UI can route targets into a tested wake backend.

## Phase 13: Agents Status Backend Controls

Goal: expose a reliable control plane before building the right pane.

Backend work:

- Add `GET /managed-agents/status`.
- Add:
  - pause,
  - resume,
  - rename,
  - reconnect,
  - compact,
  - clear,
  - context,
  - access read/change.
- Add capability table per runtime.
- Disable compact/clear while running/notified/access-pending.
- Use `AgentStateStore` for every mutation.

Frontend work:

- Add API client methods only.

Hot gates:

- Route tests for every handler.
- Runtime hot tests:
  - Claude `/compact` and `/clear` while idle,
  - Codex `/compact` and `/clear` while idle,
  - Gemini `/compress` and `/clear` while idle,
  - verify post-clear runtime session identity rebinding where applicable.
- Context hot tests:
  - Claude status-line collection if enabled,
  - Codex/Gemini show `Unknown` unless a verified data path exists.

Expected result:

- Backend status response can drive the entire Agents tab.

Exit criteria:

- Frontend can implement controls without inventing local status logic.

## Phase 14: Agents Right Pane UI

Goal: let the user inspect and control agents.

Backend work:

- Stabilize status response.

Frontend work:

- Add `agents` right-pane tab.
- Build:
  - `RightAgents`,
  - `AgentStatusRow`,
  - pause/resume control,
  - rename,
  - reconnect,
  - compact/clear,
  - access selector,
  - context meter,
  - integration setup action,
  - terminal/interrupt/goodbye actions.
- Add chip states for paused, running, notified, turn-ended, access-pending, detached.

Hot gates:

- Renderer tests for every action handler and disabled state.
- Manual browser hot test:
  1. spawn two agents,
  2. pause one,
  3. verify paused agent is muted and not wake-eligible,
  4. resume,
  5. reconnect/detach states display correctly.

Expected result:

- User can manage agents without terminal knowledge.

Exit criteria:

- Mention UI can reuse status data from the Agents tab.

## Phase 15: Mentions And Targeted Wake UI

Goal: target agents from composer and comments.

Backend work:

- Add mention metadata to prose/comment schemas and event parsing.
- Wake routing consumes participant ids, not display-name text.

Frontend work:

- Add Agent button below main composer and comment composer.
- Add `@` trigger.
- Add multi-select mention popover.
- Insert `@DisplayName` text and send mention metadata.
- Show paused/detached agents disabled with resume/reconnect affordance.

Hot gates:

- Kernel tests for mention metadata validation and wake routing.
- Renderer tests for `@` insertion and metadata.
- Real session hot test:
  1. spawn two active agents,
  2. send no-mention message,
  3. verify both wake,
  4. send `@Ada`,
  5. verify only Ada wakes,
  6. pause Ada and mention her,
  7. verify UI offers resume and no wake is sent until resumed.

Expected result:

- Agent targeting is deterministic and rename-safe.

Exit criteria:

- Comments and tasks can reuse the same targeting machinery.

## Phase 16: Access Requests End To End

Goal: make runtime permission prompts visible and actionable.

Backend work:

- Add event kinds:
  - `access-request`,
  - `access-response`.
- Add detectors:
  - Claude `PermissionRequest`,
  - Codex `PermissionRequest`,
  - Gemini `Notification` `ToolPermission`.
- Add route/action to approve or deny when prompt is still live.
- Mark expired when prompt can no longer be answered.

Frontend work:

- Add `AccessRequestCard`.
- Add chip/top-bar access-pending count/color.
- Add approve/deny handlers.
- Show status open/approved/denied/resolved/expired.

Hot gates:

- Fixture tests for each runtime hook payload.
- Renderer card tests.
- Runtime hot tests:
  1. trigger a safe permission prompt per runtime,
  2. verify an `access-request` event is written,
  3. approve/deny from UI,
  4. verify `access-response` is written,
  5. verify live prompt receives answer or card expires honestly.

Expected result:

- Access prompts are not hidden in arbitrary text.

Exit criteria:

- Access controls in Agents tab can share the same event/status model.

## Phase 17: Session Fork Backend

Goal: fork session folders and move active agents to the fork safely.

Backend work:

- Add session fork service.
- Add `POST /sessions/:id/fork`.
- Copy session folder through temp dir plus atomic rename.
- Write `.fork.json`.
- Update path registry/MRU/active path state.
- Rebind active unpaused agents through `AgentStateStore`.
- Skip paused/detached/offline agents by default.
- Rebind MCP context and stream listener target.
- Publish `session.forked` and `managed-agent.updated`.

Frontend work:

- Add API client `forkSession`.

Hot gates:

- Route tests:
  - copy integrity,
  - source immutability,
  - metadata,
  - path registry/MRU,
  - skipped agents,
  - active-session rebind.
- Real session hot test:
  1. create source session with prose/todo/html/flow/file events,
  2. fork it,
  3. verify copied files match,
  4. verify source receives no new files,
  5. post through MCP after handoff,
  6. verify write lands in fork only.

Expected result:

- F-Mark-owned fork works without relying on vendor-native branch commands.

Exit criteria:

- UI fork buttons can ship before native runtime branch support.

## Phase 18: Session Fork UI And Runtime-Native Fork Capability

Goal: expose fork in the UI, then optionally layer runtime-native branch commands.

Backend work:

- Add per-runtime fork capability:
  - Claude `/branch [name]` after smoke,
  - Codex `/fork` or `codex fork` after smoke,
  - Gemini unsupported in v1.
- Send native command through input queue only when capability is verified.

Frontend work:

- Add session row fork icon with `stopPropagation`.
- Add composer fork icon.
- Add shared fork-name popover.
- Preserve composer draft after fork.
- Refresh sessions, participants, and agent status.
- Show warnings for skipped/failed handoff.

Hot gates:

- Renderer tests for row button not selecting source row.
- Browser hot test for session list and composer fork.
- Runtime hot tests:
  - Claude `/branch <fork-session-id>` in a managed pane,
  - Codex `/fork` in a managed pane,
  - Gemini shows F-Mark handoff only.

Expected result:

- User can fork and keep working with active agents in the new fork.

Exit criteria:

- Fork is fully usable before sub-agent streaming.

## Phase 19: Sub-Agent Event Model And Backend Capture

Goal: capture sub-agent output as nested child work.

Backend work:

- Add event kinds:
  - `subagent-run`,
  - `subagent-output`.
- Add runtime adapters:
  - Claude `Agent` plus `SubagentStart`/`SubagentStop`,
  - Codex `SubagentStart`/`SubagentStop`,
  - Gemini `invoke_agent`.
- Store parent participant, parent turn/tool-use id, sub-agent id/name, status, source, source confidence, correlation id, sequence.
- Final-result-only first; progressive only behind capability flags.

Frontend work:

- Add types only.

Hot gates:

- Fixture tests per runtime.
- Real runtime hot tests:
  1. ask each runtime to invoke a sub-agent/delegated agent where supported,
  2. verify final result can be attributed,
  3. verify unsupported/progressive gaps are marked honestly,
  4. verify unattributable output remains parent arbitrary output.

Expected result:

- Backend produces stable nested sub-agent events.

Exit criteria:

- Renderer can group child events without guessing from terminal text.

## Phase 20: Sub-Agent UI

Goal: render nested sub-agent boxes in the chat.

Backend work:

- Stabilize event payloads and grouping metadata.

Frontend work:

- Update `projectFeed.ts` grouping.
- Add `SubagentBox`.
- Render nested boxes in `ArbitraryGroupCard.tsx`.
- Add fallback in `EventCard.tsx`.
- Collapse completed boxes after parent turn end.
- Keep failed/cancelled expanded.

Hot gates:

- Renderer grouping tests.
- Browser hot test with fixture events and with one real runtime fixture.

Expected result:

- Sub-agent work appears as a named subentity of the invoking agent.

Exit criteria:

- All v1 chat presentation features are covered.

## Phase 21: Stream/MCP Dedupe And Hybrid Hardening

Goal: make hooks and MCP cooperate without duplicate cards.

Backend work:

- Add source markers for MCP-created events where allowed.
- Add turn activity correlation keyed by participant/session/runtime turn.
- Dedupe final prose and turn-end when MCP deliberate events already exist.
- Preserve arbitrary/tool-use capture.

Frontend work:

- Ensure live output grouping handles source markers.

Hot gates:

- Integration tests with MCP post plus hook transcript.
- Real session hot test:
  1. model posts final answer through MCP,
  2. hook also sees terminal final text,
  3. verify only one final visible answer,
  4. verify tool-use still appears.

Expected result:

- Hybrid mode is clean, not noisy.

Exit criteria:

- HTTP MCP can be added without changing event semantics.

## Phase 22: Streamable HTTP MCP

Goal: add `/mcp` HTTP only after stdio is fully proven.

Backend work:

- Add `packages/kernel/src/mcp/http.ts`.
- Register `/mcp`.
- Use bearer auth only.
- Add CORS headers for MCP protocol headers.
- Keep process-spawning tools out of MCP.

Frontend work:

- Integration setup can show HTTP as advanced/manual if shipped.

Hot gates:

- Fastify transport tests:
  - POST,
  - GET/SSE,
  - DELETE,
  - invalid/missing `Mcp-Session-Id`,
  - auth failure,
  - CORS preflight.
- Runtime hot tests for at least one runtime over HTTP.
- Verify no bearer token is written into project config by default.

Expected result:

- HTTP MCP exists as an optional transport, not a prerequisite for managed local agents.

Exit criteria:

- Transport support is complete and does not disturb stdio.

Status 2026-05-26: complete. Hot evidence:
`/tmp/fmark-mcp-phase22-hot-SnbvxD/report.json`.

## Phase 23: Full Vendor E2E Matrix

Goal: verify the whole managed flow per runtime.

Backend work:

- Fix only defects discovered by the matrix.

Frontend work:

- Fix only defects discovered by the matrix.

Hot gates per runtime:

Claude:

- install locally,
- launch managed session with `--name <fmark-session-id>`,
- hello through MCP,
- hook captures tool-use,
- `PermissionRequest` card,
- compact/clear,
- session fork with `/branch` if smoke-enabled,
- sub-agent final-result box.

Codex:

- install globally and locally where safe,
- launch managed session with desired name stored,
- hello through MCP,
- hook captures tool-use,
- `PermissionRequest` card,
- compact/clear,
- session fork with `/fork` if smoke-enabled,
- sub-agent final-result box.

Gemini:

- install project/user with `trust:false`,
- launch managed session with desired name stored,
- hello through MCP,
- access/trust notification card when available,
- `/compress` and `/clear`,
- F-Mark-only session fork,
- `invoke_agent` final-result box if fixture supported.

Expected result:

- The matrix documents exactly which runtime-native capabilities are enabled and which are shown as unsupported/unknown.

Exit criteria:

- Release candidate can be manually verified.

Status 2026-05-26: complete. Hot evidence:
`/tmp/fmark-mcp-phase23-hot-8GEMrx/report.json`.

## Phase 24: Final Manual Verification And Release Hardening

Goal: close the implementation by running the release checklist against current built artifacts, fixing every discrepancy discovered by actual UI/runtime/session checks, and leaving only explicitly accepted vendor-capability limitations.

Backend work:

- Fix only checklist failures discovered against current artifacts.
- Keep all fixes covered by focused tests and a hot runner or real manual transcript.
- Preserve MCP-first `/guide`, `/guide-rest-variant`, hook update/version behavior, path-scoped event reads, and active-path token mirroring.

Frontend work:

- Fix only checklist failures discovered in the production renderer.
- Keep UI fixes covered by focused component tests and a production-Chrome hot check when the behavior depends on real browser state.
- Ensure transient loading states are not blank when they are user-visible.

Hot gates:

- Rebuild current artifacts with `pnpm build`.
- Run full kernel and renderer suites.
- Run the v3 regression hot runner:
  - built authenticated kernel,
  - non-boot project session creation,
  - token mirror mode/content check,
  - MCP SDK stdio write from the non-boot path,
  - production renderer path switch with same session id,
  - managed Codex launch-packet marker capture,
  - built hook CLI launch-packet suppression,
  - normal user-hook prompt preservation.
- Re-run the full vendor E2E matrix on current artifacts when credentials and CLI state are available.
- Update the final checklist with pass/fail evidence and accepted debts.

Expected result:

- The manual checklist is no longer a loose to-do list; every item is either passed with a command/report path, intentionally unsupported with vendor evidence, or recorded as a blocking bug.

Exit criteria:

- `planning/manual-checklist-findings-v3.md` contains the closure record for v3 findings.
- `planning/mcp/implementation-progress.md` points at the latest hot reports and test counts.
- Any newly discovered discrepancy is fixed and re-tested before marking Phase 24 complete.

Status 2026-05-26: complete. Closure evidence:
`planning/manual-checklist-phase24-closure.md`, full all-feature matrix
`/tmp/fmark-full-hot-AavpWQ/matrix.json` (23/23 gates), v3 regression
report `/tmp/fmark-manual-v3-hot-UUujP2/report.json`, aggregate vendor
matrix `/tmp/fmark-mcp-phase23-hot-9X63bS/report.json`, and supplementary
hot sweep reports listed in the closure document. The final sweep found and
fixed a Claude pre-tool confirmation drift in the Phase 16 hot runner, then
reran the affected standalone gate and the full matrix successfully.

## Final Manual Verification Checklist

Use a temp project and isolated config homes first. Repeat in a normal local project only after temp verification passes.

Setup:

- [ ] Kernel starts with auth enabled.
- [ ] Renderer loads.
- [ ] Runtime versions display for Claude, Codex, Gemini.
- [ ] MCP SDK stdio server is available.

Integration setup:

- [ ] Click Claude with missing setup; setup sheet opens.
- [ ] Local/global options show exact config paths.
- [ ] Missing/stale/blocked states render correctly.
- [ ] Install locally and launch works.
- [ ] Update locally and launch works from stale config.
- [ ] Invalid config is not overwritten.
- [ ] No bearer token is written to project config.
- [ ] Repeat equivalent safe setup for Codex and Gemini.

First launch:

- [ ] Agent gets randomized display name.
- [ ] Initial prompt includes full MCP-only `/guide`.
- [ ] Initial prompt includes participant id, F-Mark session id, display name, and compass packet.
- [ ] `/guide` has no curl/raw REST endpoint instructions.
- [ ] `/guide-rest-variant` preserves REST instructions.
- [ ] Agent posts hello through `fmark_post_prose`.
- [ ] Agent calls `fmark_end_turn`.
- [ ] Event appears once in chat.

MCP tools:

- [ ] Read events.
- [ ] Read one event.
- [ ] Post prose.
- [ ] End turn.
- [ ] Create todo.
- [ ] Update todo.
- [ ] Post choices.
- [ ] User answers choice.
- [ ] Post flow.
- [ ] Post html.
- [ ] Attach file metadata.
- [ ] Request access through MCP fallback.

Hook/hybrid behavior:

- [ ] Arbitrary assistant text streams into a working group.
- [ ] Runtime tool-use appears as a tool card.
- [ ] Turn-end closes the working group.
- [ ] MCP final prose is not duplicated by hook final prose.
- [ ] Missing hook does not show as broken when MCP is installed and hook is unsupported.

Agents tab:

- [ ] Agents tab appears in right pane.
- [ ] Each agent row shows display name, runtime, active session, connection, activity, MCP/hook status.
- [ ] Context meter shows real value for verified runtime or Unknown for unsupported.
- [ ] Access selector shows supported modes or disabled unsupported state.
- [ ] Pause stops future wakes.
- [ ] Resume re-enables wakes.
- [ ] Rename updates display name and mention picker.
- [ ] Reconnect works for detached pane.
- [ ] Compact/clear are disabled while running/notified/access-pending.
- [ ] Compact/clear work while idle where supported.

Targeting:

- [ ] No-mention message wakes all active unpaused agents.
- [ ] `@Agent` message wakes only tagged active unpaused agents.
- [ ] Paused tagged agent offers resume, not wake.
- [ ] Comment with no mention wakes commented-content author agent.
- [ ] Comment with mentions wakes tagged agents plus author agent.
- [ ] Todo create/edit wakes dirty assignees.
- [ ] Rename does not break old mention metadata because routing uses participant ids.

Access:

- [ ] Runtime permission prompt creates access-request card where supported.
- [ ] Chip/access badge uses distinct access-pending color.
- [ ] Approve writes access-response and answers live prompt when possible.
- [ ] Deny writes access-response and answers live prompt when possible.
- [ ] Expired prompt is marked expired and not falsely reported as answered.

Session fork:

- [ ] Session row fork button opens name popup without selecting source row.
- [ ] Composer fork button opens name popup for active session.
- [ ] Fork duplicates event files/assets.
- [ ] Source session remains unchanged.
- [ ] UI switches to fork.
- [ ] Composer draft is preserved.
- [ ] Active unpaused agents are rebound to fork.
- [ ] Paused/detached agents are skipped with warnings.
- [ ] MCP writes after fork land in fork only.
- [ ] Hook/listener output after fork lands in fork only.
- [ ] Claude/Codex native fork command runs only if capability smoke passed.
- [ ] Gemini uses F-Mark-only fork handoff.

Sub-agents:

- [ ] Parent agent invokes a sub-agent/delegated agent where supported.
- [ ] Sub-agent box appears nested under parent turn.
- [ ] Box shows runtime-provided name/title when available.
- [ ] Final result appears for final-result-only runtimes.
- [ ] Progressive output appears only for runtimes with verified capability.
- [ ] Failed/cancelled sub-agent boxes remain visible.
- [ ] Unattributable output remains normal parent arbitrary output.

Existing behavior:

- [ ] Existing REST clients still work.
- [ ] Existing hook install/status/apply routes still work or are aliased.
- [ ] Terminal overlay still works.
- [ ] Agent command menu still works.
- [ ] Manual non-MCP flow can use `/guide-rest-variant`.
- [ ] Full `pnpm test` passes.
- [ ] Full `pnpm build` passes.
