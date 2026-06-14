# MCP and Kernel Architecture Research Outcome

Research date: 2026-05-25

This document answers the remaining MCP transport, TypeScript SDK, and F-Mark kernel architecture questions for the managed-agent plan. It is intentionally limited to research findings and recommended edits. It does not modify the master plan.

## Executive Summary

| Area | Status | Recommendation |
| --- | --- | --- |
| MCP TypeScript SDK choice | Ship now | Use stable `@modelcontextprotocol/sdk@1.29.0` with `zod`. Avoid building production code on the split v2 alpha packages until they leave alpha. |
| `f-mark mcp` stdio server | Ship now | Implement first. It avoids HTTP auth/header/client config risk, matches local assistant integrations, and can initially proxy mutating calls to the running kernel HTTP API so websocket/bus behavior stays consistent. |
| `/mcp` Streamable HTTP endpoint | Research more | Keep a shared MCP server registry, but ship HTTP after a Fastify transport spike. The SDK examples are Express/raw Node oriented, and Fastify response ownership needs proof. |
| Fastify MCP integration | Research more | Spike `StreamableHTTPServerTransport` with Fastify `request.raw` and `reply.raw`/`reply.hijack()`, including SSE GET and DELETE cleanup. No mature official Fastify adapter was found. |
| MCP auth | Ship now | For HTTP, require `Authorization: Bearer <kernel token>` on `/mcp`. Do not put bearer tokens in project-scoped MCP config. For stdio, prefer local token discovery and proxying. |
| Server lifecycle | Ship now | Use one server factory for tools/resources/prompts. Use one stdio transport per CLI process. For HTTP, use one transport per MCP protocol session keyed by `Mcp-Session-Id`, cleaned up on close/delete. |
| Service extraction | Ship now | Extract route-local participant/session/event/todo logic before broad MCP tools. REST routes and MCP handlers should call the same services. |
| Active-session state | Blocked for forks | Current code has split active-session storage between `.f-mark/agents` and the global path-aware agents dir. Fork handoff and MCP context are not reliable until this is unified. |
| F-Mark-only session fork | Ship now after state fix | Folder-copy fork is feasible because `listSessions` scans session folders. It must also update path registry/MRU/active path when needed and re-point managed agents through a unified store. |
| Runtime-native fork | Research more | Keep as per-runtime research. Do not depend on native `/fork` or equivalent for v1. |
| Sub-agent streaming | Research more | Prefer explicit event kinds for durable nested runs, or metadata-only only if renderer grouping is changed at the same time. Source/correlation IDs are required either way. |

## Primary Sources

MCP specification and SDK sources used:

- MCP latest transport spec, including stdio and Streamable HTTP: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP authorization spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP tools spec: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP resources spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- MCP prompts spec: https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
- TypeScript SDK repository: https://github.com/modelcontextprotocol/typescript-sdk
- Stable v1 SDK branch: https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x
- Stable SDK server docs: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
- Stable SDK Streamable HTTP examples: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStreamableHttp.ts and https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts
- npm registry package pages: https://www.npmjs.com/package/@modelcontextprotocol/sdk, https://www.npmjs.com/package/@modelcontextprotocol/server, https://www.npmjs.com/package/@modelcontextprotocol/node, https://www.npmjs.com/package/@modelcontextprotocol/express

Registry check on 2026-05-25:

- `@modelcontextprotocol/sdk` latest: `1.29.0`, Node `>=18`, peer dependencies `@cfworker/json-schema` and `zod`.
- `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, and `@modelcontextprotocol/express`: `2.0.0-alpha.2`, Node `>=20`.
- F-Mark already requires Node `>=20` in `package.json` and `packages/kernel/package.json`, so runtime compatibility is not the blocker. Stability is.

## Findings By Topic

### 1. Current MCP TypeScript SDK Status

#### Stable package

The stable implementation path is still `@modelcontextprotocol/sdk@1.29.0`. The official TypeScript SDK repository now also shows a split-package v2 line, but the npm packages in that split are alpha. F-Mark should use the stable package for the first implementation and keep the server factory narrow enough to migrate later.

Relevant APIs in the stable SDK:

- `McpServer` for high-level server registration.
- `registerTool` for tool APIs, with input schemas and optional annotations such as read-only/destructive semantics. See the MCP tools spec and SDK server docs.
- `registerResource` and `ResourceTemplate` for resource URIs and URI templates. Resources are best for read-only context such as session lists, participant state, current path state, recent events, and planning file summaries.
- `registerPrompt` for reusable prompt templates. Prompts are a good fit for F-Mark guide/setup prompts and session handoff prompts.
- `StdioServerTransport` for local process transport.
- `StreamableHTTPServerTransport` for MCP's current HTTP transport.

#### Stdio transport

The MCP transport spec says stdio servers are launched as local subprocesses by the client. The server reads newline-delimited JSON-RPC from stdin and writes JSON-RPC to stdout. Logging must go to stderr, because stdout is protocol traffic. This matches a `f-mark mcp` subcommand well.

Implication for F-Mark:

- Add a true `mcp` subcommand in `packages/kernel/src/index.ts` and `packages/kernel/src/cli.ts`; current subcommand handling only recognizes `hook` (`packages/kernel/src/index.ts:48`, `packages/kernel/src/cli.ts:146`).
- Keep stdout clean in `f-mark mcp`; route logs to stderr.
- Start with stdio as the supported local integration path.

#### Streamable HTTP transport

The current MCP transport spec defines Streamable HTTP as a single MCP endpoint that supports POST and GET, with optional DELETE. POST carries JSON-RPC requests, responses, and notifications. GET can open an SSE stream for server-to-client messages. Servers may assign an `Mcp-Session-Id` during initialization; clients then include that header on later requests. Clients should include `MCP-Protocol-Version` after initialize. `Mcp-Session-Id` is the MCP protocol session id, not the F-Mark session id.

Implication for F-Mark:

- Use `/mcp` as the endpoint.
- Implement POST, GET, and DELETE when HTTP ships.
- Store HTTP transports in a map keyed by MCP protocol `Mcp-Session-Id`.
- Clean up map entries on transport close and DELETE.
- Do not reuse F-Mark session ids as MCP session ids.
- Add CORS allowance for `Mcp-Session-Id`, `MCP-Protocol-Version`, and `Last-Event-ID` if browser-based clients are supported. Current CORS only allows `Authorization, Content-Type` (`packages/kernel/src/server.ts:141`).

#### Fastify integration concerns

F-Mark uses Fastify 5 (`packages/kernel/package.json`) and registers Fastify routes in `packages/kernel/src/server.ts`. The stable SDK examples are Express/raw Node oriented and use Node request/response objects. No official stable Fastify adapter was found. The v2 alpha line has `@modelcontextprotocol/express` and `@modelcontextprotocol/node`, not a stable Fastify package.

Implication for F-Mark:

- Treat `/mcp` HTTP as a spike-backed phase, not the first supported path.
- Verify whether Fastify can safely hand response ownership to `StreamableHTTPServerTransport` using `request.raw`, `reply.raw`, and likely `reply.hijack()`.
- The spike must cover JSON POST, SSE GET, DELETE session cleanup, auth failure, and missing/invalid `Mcp-Session-Id`.

#### Auth and headers

The MCP authorization spec is bearer-token oriented. F-Mark already supports bearer auth in `packages/kernel/src/auth.ts:107`; it also supports query-token and cookie flows for browser use (`packages/kernel/src/auth.ts:114`, `packages/kernel/src/auth.ts:125`).

Implication for F-Mark:

- `/mcp` should require `Authorization: Bearer <kernel token>`.
- Do not document query-token auth for MCP clients.
- Do not store bearer tokens in project-local MCP config. The planning docs already lean this way in `planning/mcp/ux-flow.md:175`.
- For stdio, prefer local discovery of `.f-mark/config.json` and `.f-mark/.token`, then proxy to the running kernel if needed.

#### Server lifecycle

The SDK lifecycle is transport-driven: create/register the server, connect it to a transport, and close/cleanup the transport when the connection ends.

Recommended F-Mark shape:

```text
packages/kernel/src/mcp/
  server.ts       createFmarkMcpServer(...)
  context.ts      resolve path/session/participant per call
  tools.ts        register tools
  resources.ts    register resources
  prompts.ts      register prompts
  stdio.ts        runFmarkMcpStdio(...)
  http.ts         registerMcpHttpRoutes(...)
```

The factory should register the same tools/resources/prompts for both transports. Context must be resolved per request/tool call, not captured during process start or MCP initialize, because active path and active session can change during the server lifetime.

### 2. Stdio First, HTTP Later

Recommendation: ship stdio first, design for HTTP, and implement `/mcp` after service extraction plus a Fastify transport spike.

Why stdio first:

- It is the simplest official local MCP transport.
- It avoids HTTP client header storage, CORS, cookies, and `Mcp-Session-Id` handling.
- It matches local assistant integrations and the setup-first UX.
- It lets F-Mark expose useful read/write tools before HTTP transport risk is resolved.

Why not both as the first milestone:

- HTTP correctness is not just another route. It has protocol session lifecycle, GET SSE, DELETE cleanup, extra headers, and Fastify response ownership concerns.
- The local kernel currently has route-local business logic. Shipping both transports before service extraction would duplicate behavior.

Concrete v1 server shape:

- `f-mark mcp`
  - Stdio MCP server.
  - Resolves target project by explicit `--path`, `F_MARK_PATH`, or walking from cwd to `.f-mark`.
  - Reads kernel port/token from `.f-mark/config.json` and `.f-mark/.token`.
  - Initially proxies mutating tools to the running kernel HTTP API so existing auth, stale-path checks, writer, bus, and websocket broadcast behavior remain authoritative.
  - Can call extracted read-only services directly once path-aware context is unified.

- `/mcp`
  - Streamable HTTP MCP endpoint mounted in the existing Fastify server after auth middleware.
  - Requires bearer auth.
  - Supports POST, GET, DELETE.
  - Manages SDK transports by MCP `Mcp-Session-Id`.
  - Uses the same `createFmarkMcpServer` and per-call context resolver as stdio.
  - Does not ship until the Fastify transport spike passes.

### 3. Local Code Integration Points

#### Route and service extraction

The MCP server needs the same behavior as REST routes without copying route handlers. The current code has reusable low-level pieces, but much business logic is route-local.

Extract these services first:

- `services/publish.ts` or `events/publisher.ts`
  - Centralize event bus messages now duplicated in routes.
  - Current duplication appears in `packages/kernel/src/routes/events.ts:77`, `packages/kernel/src/routes/todos.ts:354`, `packages/kernel/src/routes/flow.ts:56`, `packages/kernel/src/routes/html.ts`, and `packages/kernel/src/routes/files.ts:217`.

- `services/events.ts`
  - Wrap `writeEventFile` from `packages/kernel/src/events/writer.ts:40`.
  - Wrap `readEvents` from `packages/kernel/src/events/reader.ts:38`.
  - Export operations for prose, tool-use, choices, choice, turn-end, and reads.
  - Keep stale-path validation behavior equivalent to `packages/kernel/src/routes/stalePath.ts:27`.

- `services/todos.ts`
  - Move todo snapshot/tree/cascade/write/list logic out of `packages/kernel/src/routes/todos.ts:82`.
  - MCP should call the same todo mutation service as REST so `todo` events and bus notifications stay identical.

- `services/sessions.ts`
  - Wrap `createSession`, `listSessions`, and `sessionExists` from `packages/kernel/src/sessions.ts:50`.
  - Move all-sessions/path-aware listing logic from `packages/kernel/src/routes/sessions.ts:88`.
  - Add `forkSession` here.

- `services/participants.ts`
  - Wrap register/list/update/link operations from `packages/kernel/src/participants.ts`.
  - Make active-session reads/writes path-aware and consistent with managed-agent state.

- `services/embeds.ts` or separate flow/html/file services
  - Extract route-local validators and writers from `packages/kernel/src/routes/flow.ts`, `packages/kernel/src/routes/html.ts`, and `packages/kernel/src/routes/files.ts`.
  - This can happen after initial MCP if v1 MCP tools avoid those write surfaces.

#### Event writer/reader

`writeEventFile` is already a good shared primitive. It validates session existence, participant existence, output path containment, and unique filenames (`packages/kernel/src/events/writer.ts:40`). `readEvents` already supports since/kind/participant filters (`packages/kernel/src/events/reader.ts:38`).

Gaps:

- Publishing is separate and duplicated.
- Event schema does not yet include sub-agent kinds or source/correlation metadata.
- `parseEventFilename` accepts `[a-z-]+` kinds at the filename level, but `EventKind` is a TypeScript union that must be extended for new kinds (`packages/shared/src/events.ts:1`, `packages/shared/src/filenames.ts:1`).

#### Bus and websocket

The websocket bus is centralized in `packages/kernel/src/ws/bus.ts`, and `wrapBusWithPathEnvelope` adds path id/revision (`packages/kernel/src/ws/envelope.ts:12`). This is good for MCP as long as MCP mutations go through the same publishing service or HTTP proxy path.

Gaps:

- There is no `session-added`, `session-forked`, or `agent-state-updated` bus message today.
- Managed-agent bus messages exist for spawned/killed/terminal output (`packages/kernel/src/ws/bus.ts:40`), but not for active-session pointer changes or fork handoff.
- If stdio directly writes files without publishing through the server process, renderers will not update. This is why v1 stdio mutating tools should proxy through the running kernel or use a shared publisher that reaches the server bus.

#### Active-session pointers

There are currently multiple active-session locations:

- Participant listing reads active sessions from `join(p.fmarkDir(), "agents")` (`packages/kernel/src/participants.ts:176`).
- The link route writes to `join(p.fmarkDir(), "agents")` (`packages/kernel/src/routes/agents.ts:34`).
- Managed-agent code uses `agentsDirFor(...)`, which can be the global path-aware agents directory (`packages/kernel/src/agents/locator.ts:17`, `packages/kernel/src/routes/managedAgents.ts:137`).
- Hook auto-stream reads from `ctx.fmarkDir/agents` before falling back to env (`packages/kernel/src/hooks/autoStream.ts:202`).

This is the biggest fork/MCP correctness gap. F-Mark needs one `AgentStateStore` or equivalent service that:

- Resolves the canonical agents dir for the current path.
- Preserves legacy `.f-mark/agents` fallback during migration.
- Stores active F-Mark session, runtime id, runtime session id, tmux session, desired runtime session name, and state.
- Is used by participants, `/agents/:id/link`, `/managed-agents`, hooks, fork handoff, and MCP context resolution.

#### Hook auto-stream and stale env

Managed tmux spawns set `F_MARK_SESSION_ID` and `F_MARK_PATH` at process start (`packages/kernel/src/routes/managedAgents.ts:221`, `packages/kernel/src/tmux/manager.ts:72`). Existing running processes cannot have those env vars changed after a fork.

Hook resolution does read active-session before env, which is the right order in principle (`packages/kernel/src/hooks/autoStream.ts:202`). However, it reads the legacy project-local agents dir, while managed state may be stored in the global path-aware agents dir. Fork handoff will be unreliable until those stores are unified.

MCP context resolution should use the same rule:

1. Explicit tool argument if supplied.
2. Unified agent active-session state.
3. Canonical active-session pointer.
4. Environment fallback only for legacy.
5. Reject if ambiguous.

Do not cache active session at MCP initialize time.

#### Managed agents state

Managed state is spread across small files in an agent dir: `tmux-session`, `runtime`, and `active-session` (`packages/kernel/src/agents/managed.ts`, `packages/kernel/src/agents/activeSession.ts`). The planning docs propose a richer `state.json` in `planning/mcp/agent-control-and-targeting.md:25`.

Recommendation:

- Promote the proposed managed-agent `state.json` to a prerequisite for reliable targeting/fork/MCP.
- Keep compatibility with existing files during migration.
- Add one state update service and one bus notification for state changes.
- Make `GET /managed-agents/status` read from this service rather than reconstructing state from tmux and presence only (`packages/kernel/src/routes/managedAgents.ts:399`).

### 4. Session Fork Implementation Implications

#### Folder-copy service

F-Mark can implement a v1 fork without native runtime support by copying the session folder. `listSessions` discovers sessions by scanning directories under `sessionsDir` (`packages/kernel/src/sessions.ts:68`), so a correctly named copied folder is enough for basic registration.

Recommended `forkSession` behavior:

- Validate source path and source session exist.
- Allocate a unique target session id using the same slug normalization rules as `createSession` (`packages/kernel/src/sessions.ts:50`).
- Copy the source session directory to a temp directory under the target sessions directory.
- Preserve event files and assets.
- Write fork metadata such as `.fork.json` with source path id, source session id, fork time, and requested label.
- Atomically rename temp directory to final session id.
- Return target path, path id, session id, and copied file counts.

#### Path registry, MRU, and active path switching

Folder copy alone is not enough when forking into or from a path that is not currently active.

The session creation route already updates active path, registry, and MRU when a `path` is supplied (`packages/kernel/src/routes/sessions.ts:215`, `packages/kernel/src/routes/sessions.ts:242`). The fork service should reuse extracted path activation helpers from this code.

If fork creation switches the active path:

- Update active path state.
- Register the target project path.
- Update MRU/favorites state as appropriate.
- Update `PathContextRef`, which increments revision (`packages/kernel/src/routes/paths.ts:148`).
- Broadcast `path-switched` when active path changes (`packages/kernel/src/routes/paths.ts:162`).

#### Agent active-session state

After a fork, handoff needs to re-point selected agents to the new F-Mark session. Current pieces:

- `writeActiveSession` writes one active-session file (`packages/kernel/src/agents/activeSession.ts:19`).
- `/agents/:id/link` writes legacy active-session pointers (`packages/kernel/src/routes/agents.ts:34`).
- Managed spawn writes active-session to the path-aware managed agents dir (`packages/kernel/src/routes/managedAgents.ts:238`).

Required before fork handoff:

- Unify active-session storage.
- Update the managed `state.json`.
- Broadcast agent-state change.
- Ensure participants, managed-agent status, hooks, and MCP all read the new pointer.

#### Listener/hook stale env issue

Fork handoff cannot rely on `F_MARK_SESSION_ID` in an existing process. That env var is set when the process starts and will remain stale. The hook must read the canonical active-session pointer before env fallback, and it must read the same canonical store as managed agents.

This is a blocker for reliable fork handoff and for post-fork MCP context when the caller targets a managed agent.

### 5. Sub-Agent Event Model Implications

There are two viable models:

#### Preferred: explicit event kinds

Add durable event kinds such as:

- `subagent-run`
- `subagent-output`

Benefits:

- Renderer can explicitly group nested runs instead of guessing.
- Queries can include/exclude child work.
- MCP and hooks can emit structured child lifecycle events without pretending they are normal parent prose/tool-use.

Costs:

- Extend `EventKind` and payload schemas in `packages/shared/src/events.ts`.
- Extend renderer cards. Unknown event kinds currently return `null` in `packages/renderer/src/cards/EventCard.tsx:85`, so new events will be invisible until rendered.
- Add grouping logic in `packages/renderer/src/feed/projectFeed.ts`.

#### Minimal: metadata on prose/tool-use

Add metadata fields to existing prose/tool-use events and keep event kinds unchanged.

Benefits:

- Smaller schema surface.
- Existing cards may display raw content without new components.

Risks:

- `projectFeed` currently treats every `tool-use` and arbitrary prose as mid-turn content (`packages/renderer/src/feed/projectFeed.ts:22`) and groups by contiguous participant (`packages/renderer/src/feed/projectFeed.ts:59`). Child agent content would flatten into the parent run unless projection logic changes.
- `ToolUseCard` does not display nested/source/correlation metadata (`packages/renderer/src/cards/ToolUseCard.tsx`).
- Metadata-only is easy to miss in later consumers.

Recommendation:

- Use explicit event kinds for the durable event log, with renderer support in the same milestone.
- If planning chooses metadata-first as a smaller spike, make renderer grouping changes mandatory in that same spike.

Required fields either way:

- `source`: `hook`, `transcript`, `terminal-stream`, `mcp`, or `runtime`.
- `source_confidence`: `confirmed`, `inferred`, or `unknown`.
- `correlation_id`: stable id tying child run/output/tool-use together.
- `parent_turn_id`.
- `parent_tool_use_id` if known.
- `parent_participant_id`.
- `runtime_id`.
- `runtime_session_id`.
- `subagent_id` or inferred child label.
- `subagent_name` if known.
- `sequence`.
- `status`: `started`, `delta`, `completed`, `failed`, or `unknown`.

Renderer rule:

- Do not group sub-agent output only by contiguous participant.
- Attach child events to the parent turn/tool by `correlation_id` and parent ids.
- Preserve source attribution in the UI so MCP-created events, hook transcript events, and terminal stream events can be de-duplicated.

### 6. Exact Plan Edits Recommended

These are recommended edits for the planning docs. They are not applied here.

#### `planning/mcp/plan.md`

Replace the MCP research placeholders with:

- Use `@modelcontextprotocol/sdk@1.29.0` for v1. Do not use the v2 split packages until they are stable; as of 2026-05-25 `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, and `@modelcontextprotocol/express` are `2.0.0-alpha.2`.
- Implement `f-mark mcp` stdio first.
- Build shared MCP modules:
  - `mcp/server.ts` for server factory.
  - `mcp/context.ts` for per-call path/session/participant resolution.
  - `mcp/tools.ts`, `mcp/resources.ts`, `mcp/prompts.ts`.
  - `mcp/stdio.ts`.
  - `mcp/http.ts` after the HTTP spike passes.
- For v1 stdio, proxy mutating tools to the running kernel HTTP API using the local bearer token so bus/websocket behavior stays centralized.
- Implement `/mcp` later as Streamable HTTP with POST, GET, DELETE; stateful transports keyed by MCP `Mcp-Session-Id`; bearer auth; and no conflation with F-Mark session ids.
- Add a Fastify transport spike before marking `/mcp` shippable. The spike must verify `reply.hijack()` or equivalent response ownership with SSE GET.
- Extract services before broad MCP tools:
  - publish/event bus service.
  - events service.
  - todos service.
  - sessions/fork service.
  - participants/active-session service.
  - managed-agent state service.
- Add active-session store unification as a prerequisite for session fork and agent-targeted MCP tools.
- Add CORS headers for `Mcp-Session-Id`, `MCP-Protocol-Version`, and `Last-Event-ID` when `/mcp` ships.

#### `planning/mcp/ux-flow.md`

Recommended edits:

- Default local setup to stdio (`f-mark mcp`) because it avoids storing bearer tokens in assistant/project config.
- Make HTTP `/mcp` an advanced or later integration mode unless the target client has secure user-level header storage.
- Preflight should check:
  - `f-mark mcp` exists.
  - `.f-mark/config.json` and `.f-mark/.token` are readable for stdio proxy mode.
  - Running kernel URL is reachable when mutating tools are enabled.
- Clarify that MCP clients receive server name/tool names, not raw REST endpoints.
- Add duplicate suppression requirement using `source` and `correlation_id` fields across hook/MCP/runtime-originated events.

#### `planning/mcp/compass-flow.md`

Recommended edits:

- Update context resolution order to prefer the canonical active-session pointer/managed state before env fallback. Existing env such as `F_MARK_SESSION_ID` can be stale after fork.
- Add explicit note: MCP protocol `Mcp-Session-Id` is not a F-Mark session id.
- Add source/correlation IDs as required for hook auto-stream, MCP tools, fork handoff, and sub-agent streaming.
- Mark fork handoff as dependent on active-session store unification and hook stale-env fix.
- When describing wake/catch-up, specify that all event reads go through extracted event reader/service rather than route-only code.

#### `planning/mcp/agent-control-and-targeting.md`

Recommended edits:

- Promote managed-agent `state.json` from proposed shape to prerequisite infrastructure.
- Define one canonical `AgentStateStore` used by:
  - `/participants`
  - `/agents/:id/link`
  - `/managed-agents/status`
  - hook auto-stream
  - session fork handoff
  - MCP context resolution
- Add migration behavior from current `tmux-session`, `runtime`, and `active-session` files.
- Add `agent-state-updated` bus message or equivalent.
- Require `/managed-agents/status` to report active F-Mark session, runtime id, runtime session id, tmux session, hook status, and stale-env/fork-handoff status from the unified store.

#### `planning/mcp/session-forking.md`

Recommended edits:

- State that F-Mark-only folder-copy fork can ship before native runtime fork.
- Keep native runtime fork blocked on per-runtime research.
- Specify temp-copy plus atomic rename behavior.
- State that `listSessions` registers copied folders by directory scan, but path registry/MRU/active path must also be updated when the fork target path changes.
- Add active-session store unification as a prerequisite.
- Add hook stale-env requirement: hooks must read canonical active-session state before env fallback and from the same store as managed agents.
- Add fork handoff steps:
  - create folder copy;
  - update active-session pointer/state for targeted agents;
  - broadcast state change;
  - send handoff prompt through the existing input queue;
  - avoid native `/fork` until runtime research is complete.

#### `planning/mcp/subagent-streaming.md`

Recommended edits:

- Choose explicit event kinds for the durable v1 design, or explicitly label metadata-only as a spike.
- If explicit:
  - add `subagent-run` and `subagent-output` to shared event schemas;
  - add renderer cards/projection in the same milestone.
- If metadata-only:
  - update `projectFeed` grouping in the same milestone so child work does not flatten into parent arbitrary groups.
- Add required fields:
  - `source`, `source_confidence`, `correlation_id`, `parent_turn_id`, `parent_tool_use_id`, `parent_participant_id`, `runtime_id`, `runtime_session_id`, `subagent_id`, `subagent_name`, `sequence`, `status`.
- Add renderer rule: group by correlation/parent ids, not only by contiguous participant.
- Mark Codex/Gemini/native sub-agent detection as runtime research if no transcript format is confirmed.

## Open Smoke Tests And Spikes

Run these locally after plan edits are accepted:

- SDK stdio smoke: start `f-mark mcp`, initialize, list tools, call `fmark_list_sessions`, confirm stdout is protocol-only and logs go to stderr.
- Stdio proxy smoke: with a running kernel, call a mutating MCP tool and confirm `/ws` receives the expected bus event.
- Fastify HTTP transport spike: POST initialize, POST tools/list, GET SSE, DELETE session, missing bearer returns 401, invalid or missing `Mcp-Session-Id` after initialize returns protocol-appropriate failure.
- CORS spike: confirm browser preflight allows `Authorization`, `Content-Type`, `Mcp-Session-Id`, `MCP-Protocol-Version`, and `Last-Event-ID`.
- Event service regression: REST prose/tool-use/todo writes and MCP writes produce identical files and identical bus messages.
- Fork service smoke: fork a session with attachments/html, confirm source unchanged, target has `.fork.json`, and `/sessions?scope=all` lists it with correct path/path_id.
- Active path smoke: fork into another path, confirm registry/MRU, `PathContextRef` revision, and `path-switched` behavior.
- Hook stale-env smoke: start a fake managed agent with old `F_MARK_SESSION_ID`, change canonical active-session pointer, run hook auto-stream, and confirm the event lands in the new fork. This is expected to fail before active-session store unification.
- Managed state smoke: after spawn/link/fork/restart, confirm `/participants`, `/managed-agents/status`, hooks, and MCP context all agree on active session.
- Sub-agent renderer fixture: add parent tool-use plus child sub-agent events and confirm child output renders nested or grouped by correlation, not flattened by contiguous participant.
- Runtime research spikes: verify native fork and sub-agent transcript support separately for Claude, Codex, and Gemini before adding runtime-specific commands to the plan.
