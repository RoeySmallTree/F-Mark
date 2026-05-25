# F-Mark kernel MCP architecture findings

Date: 2026-05-25

Scope: implementation architecture for exposing the F-Mark kernel as an MCP server. This is based on `planning/mcp/plan.md`, `planning/mcp/ux-flow.md`, local code inspection, and current MCP SDK docs/source.

## Recommendation

Use the stable TypeScript SDK package, `@modelcontextprotocol/sdk@^1.29.0`, plus its `zod` peer dependency in `packages/kernel`. Build the server with the high-level `McpServer` API from `@modelcontextprotocol/sdk/server/mcp.js`, using `registerTool`, `registerResource`, and `registerPrompt`. Avoid the newer alpha split packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`) until they stabilize.

Implement MCP as an adapter over shared F-Mark services, not as a copy of the REST routes. For stdio v1, mutating calls can pragmatically proxy to the running HTTP kernel to preserve auth, active path resolution, and WebSocket event publication while service extraction is underway. For Streamable HTTP, run MCP in-process inside the Fastify kernel and call the same shared services used by REST.

Prefer these phases:

1. Extract service functions for participant/session/event/todo/flow/html/file behaviors that are currently route-local.
2. Add a stdio MCP command (`f-mark mcp`) that resolves the project/token like hooks do and proxies mutations to the running kernel.
3. Add `/mcp` Streamable HTTP in Fastify once raw response handling and session isolation are verified.
4. Update `/guide` and runtime install flows to prefer MCP while keeping REST and hooks as fallbacks.

## SDK and API

Recommended imports:

```ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
```

Use `WebStandardStreamableHTTPServerTransport` only if a Fastify `Request`/`Reply` to Web `Request`/`Response` bridge proves cleaner than letting the Node transport own `req.raw`/`reply.raw`.

The repo already requires Node `>=20` at the root and in `packages/kernel/package.json`; SDK 1.29.0 requires Node `>=18`, so runtime compatibility is fine. Add `zod` explicitly because the SDK declares it as a peer dependency. The SDK docs and examples show `zod/v4` usage.

Sources:

- MCP TypeScript SDK docs: https://ts.sdk.modelcontextprotocol.io/
- SDK repository: https://github.com/modelcontextprotocol/typescript-sdk
- Stable server docs: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
- Streamable HTTP example: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStreamableHttp.ts
- Stateless HTTP example: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts
- Output schema example: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/mcpServerOutputSchema.ts
- Web-standard transport example: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/honoWebStandardStreamableHttp.ts
- NPM package: https://www.npmjs.com/package/@modelcontextprotocol/sdk

## Transport integration

### stdio

Add a `f-mark mcp` subcommand. Current CLI dispatch only recognizes the hook subcommand (`packages/kernel/src/index.ts:46`, `packages/kernel/src/cli.ts:146`), so this needs a new dispatch path and usage text.

Project context should reuse or extract the hook bootstrap logic: `findFmarkDir` walks upward to `.f-mark`, and `loadHookContext` reads `F_MARK_PATH`, `.f-mark/config.json`, and `.f-mark/.token` (`packages/kernel/src/hooks/bootstrap.ts:4`, `packages/kernel/src/hooks/bootstrap.ts:32`). This is the right starting point for stdio clients because it avoids writing tokens into MCP config files.

Important caveat: direct stdio file writes from a separate MCP process would bypass the running kernel's process-local WebSocket bus and path context. Mutating stdio tools should therefore proxy to the configured `kernelUrl` initially, using the local token, so renderer clients still receive the `event_added`/`event_superseded` messages emitted by the existing routes (`packages/kernel/src/routes/events.ts:77`). Read-only resources can read from disk if that does not create stale path-context behavior.

### Streamable HTTP with Fastify

Add a Fastify MCP route module, likely `packages/kernel/src/mcp/http.ts`, registered from `createServer` after CORS/auth setup and before static routes. Existing server setup already creates Fastify, registers CORS, installs `registerAuthHook`, creates `pathDeps`, registers routes, and wraps the bus with path/revision metadata (`packages/kernel/src/server.ts:79`, `packages/kernel/src/server.ts:141`, `packages/kernel/src/server.ts:173`, `packages/kernel/src/server.ts:188`, `packages/kernel/src/server.ts:211`).

Expose the full Streamable HTTP surface:

- `POST /mcp` for JSON-RPC messages.
- `GET /mcp` for server-to-client streams when using stateful Streamable HTTP.
- `DELETE /mcp` for MCP session termination.

For broad client compatibility, use the SDK's stateful Streamable HTTP pattern with a transport map keyed by the protocol `mcp-session-id`. Do not confuse this with an F-Mark `session_id`. Resumability via `eventStore` is not needed for v1. If implementation complexity is too high, a stateless HTTP spike with `sessionIdGenerator: undefined` is acceptable, but it may limit notifications and some clients' expectations.

Fastify-specific spike required: the Node transport wants `IncomingMessage`/`ServerResponse` and can write the response itself via `handleRequest(req.raw, reply.raw, req.body)`. The route will likely need `reply.hijack()` or equivalent response ownership to prevent Fastify double-send behavior. If that is awkward, try `WebStandardStreamableHTTPServerTransport` and convert the SDK `Response` back into a Fastify reply.

## Auth and context handling

The existing auth hook allows `/health` unauthenticated, permits all requests when auth is disabled, and accepts bearer header, query token, or cookie token (`packages/kernel/src/auth.ts:85`). MCP HTTP clients should use `Authorization: Bearer <token>`. Consider adding an MCP-specific pre-handler that requires bearer auth for `/mcp`, because the global hook currently also accepts query and cookie auth (`packages/kernel/src/auth.ts:107`, `packages/kernel/src/auth.ts:114`, `packages/kernel/src/auth.ts:125`).

MCP context should carry:

- Resolved project/path context from the same `PathDeps` flow used by routes (`packages/kernel/src/routes/pathDeps.ts:9`, `packages/kernel/src/routes/pathDeps.ts:24`).
- The path id/revision used for bus envelopes (`packages/kernel/src/paths/contextRef.ts:17`, `packages/kernel/src/ws/envelope.ts:3`).
- Auth mode and token source for HTTP or stdio.
- Optional participant and F-Mark session defaults.

Follow the session resolution order from `planning/mcp/ux-flow.md`: explicit `session_id`, then `F_MARK_SESSION_ID`, then active-session pointer, then managed runtime context, otherwise return a clear tool error. Keep MCP protocol sessions and F-Mark sessions as separate concepts.

Do not expose process-spawning or tmux controls as MCP tools in v1. The existing server gates managed process APIs behind auth/no-auth policy (`packages/kernel/src/server.ts:80`, `packages/kernel/src/server.ts:271`), and those boundaries should stay narrow.

## Proxy routes vs shared services

Long-term architecture should be shared service functions called by both REST and MCP. Proxying MCP to REST internally would preserve behavior but keep the implementation route-shaped and make typed MCP outputs harder. Copying route handlers would duplicate validation and bus-publish behavior.

Current service-ready pieces already exist:

- Participant helpers: `listParticipants`, `registerAgent`, `updateParticipant` (`packages/kernel/src/participants.ts:176`, `packages/kernel/src/participants.ts:211`).
- Session helpers: `createSession`, `listSessions`, `sessionExists` (`packages/kernel/src/sessions.ts:50`, `packages/kernel/src/sessions.ts:68`, `packages/kernel/src/sessions.ts:88`).
- Event read/write helpers: `writeEventFile`, `readEvents` (`packages/kernel/src/events/writer.ts:40`, `packages/kernel/src/events/reader.ts:38`).
- Prose serialization/validation helpers (`packages/kernel/src/events/prose.ts`, `packages/kernel/src/events/proseValidate.ts`).

Route-local logic that should move behind services:

- Event publish and payload normalization (`packages/kernel/src/routes/events.ts:29`, `packages/kernel/src/routes/events.ts:77`).
- Prose, choices, single-choice, and turn-end event creation (`packages/kernel/src/routes/events.ts:103`, `packages/kernel/src/routes/events.ts:302`, `packages/kernel/src/routes/events.ts:378`, `packages/kernel/src/routes/events.ts:425`).
- Todo snapshots, trees, ownership, cascade remove, and writes (`packages/kernel/src/routes/todos.ts:82`, `packages/kernel/src/routes/todos.ts:164`, `packages/kernel/src/routes/todos.ts:252`, `packages/kernel/src/routes/todos.ts:380`).
- Flow graph validation and writes (`packages/kernel/src/routes/flow.ts:31`, `packages/kernel/src/routes/flow.ts:82`).
- HTML bundle allocation/validation and writes (`packages/kernel/src/routes/html.ts:40`, `packages/kernel/src/routes/html.ts:111`).
- File event metadata and upload handling (`packages/kernel/src/routes/files.ts:21`, `packages/kernel/src/routes/files.ts:234`, `packages/kernel/src/routes/files.ts:295`).

One existing inconsistency to fix during service extraction: `/agents/:id/link` currently receives plain `Paths`, not `PathDeps`, while other path-aware routes use active path resolution (`packages/kernel/src/server.ts:220`, `packages/kernel/src/routes/agents.ts:16`). MCP should not preserve that mismatch.

## Likely file and module changes

Expected changes outside this findings doc during implementation:

- `packages/kernel/package.json`: add `@modelcontextprotocol/sdk` and `zod`.
- `packages/kernel/src/mcp/server.ts`: create and configure `McpServer`.
- `packages/kernel/src/mcp/context.ts`: resolve auth, project path, participant, and F-Mark session defaults.
- `packages/kernel/src/mcp/tools.ts`: register model-facing tools.
- `packages/kernel/src/mcp/resources.ts`: register read-only resources and templates.
- `packages/kernel/src/mcp/prompts.ts`: register prompts.
- `packages/kernel/src/mcp/stdio.ts`: connect `McpServer` to `StdioServerTransport`.
- `packages/kernel/src/mcp/http.ts`: register Fastify `/mcp` routes and Streamable HTTP transports.
- `packages/kernel/src/services/*.ts`: extract shared participant/session/event/todo/flow/html/file services.
- `packages/kernel/src/server.ts`: register HTTP MCP route with auth/path/bus dependencies.
- `packages/kernel/src/cli.ts` and `packages/kernel/src/index.ts`: add `f-mark mcp`.
- `packages/kernel/src/routes/guide.ts`: update guidance to prefer MCP and keep REST fallback.
- Runtime/install modules from `planning/mcp/plan.md`: later add MCP status to spawn/install flows.

## Tool, resource, and prompt schemas

Use model-shaped tools, not one tool per REST endpoint. Keep schemas flat and client-compatible; avoid deep unions or route-specific legacy fields. Validate with `zod/v4`, provide descriptions, and return both readable `content` and typed `structuredContent` for mutating tools. Use `outputSchema` for stable fields such as `session_id`, `participant_id`, `event_id`, `filename`, `kind`, `timestamp`, and `path_id`.

Suggested v1 tools:

- `fmark_register_participant`
- `fmark_link_agent_session`
- `fmark_list_sessions`
- `fmark_create_session`
- `fmark_read_events`
- `fmark_post_prose`
- `fmark_post_turn_end`
- `fmark_post_choices`
- `fmark_post_choice`
- `fmark_get_todos`
- `fmark_post_todo`
- `fmark_post_flow`
- `fmark_post_html`
- `fmark_post_file_event`

Do not expose `fmark_post_tool_use` in v1; it is currently a hook capture endpoint (`packages/kernel/src/routes/events.ts:215`), not a deliberate model authoring primitive.

Suggested resources:

- `fmark://guide`
- `fmark://best-practices`
- `fmark://participants`
- `fmark://sessions`
- `fmark://sessions/{session_id}/events`
- `fmark://sessions/{session_id}/todos`
- `fmark://config`

Use `ResourceTemplate` for session-specific resources. Resources should be read-only and side-effect free. `best-practices` can wrap the existing guide route content (`packages/kernel/src/routes/bestPractices.ts`).

Suggested prompts:

- `fmark_join_session`
- `fmark_write_composable_document`
- `fmark_review_document`
- `fmark_work_todos`
- `fmark_draw_flow`

Annotate read tools as read-only. Mark destructive operations, if added later, with destructive annotations. Keep HTML/file tools conservative: the existing HTML route accepts executable bundle content (`packages/kernel/src/routes/html.ts:111`), and MCP should not broaden that surface without sandbox review.

Specification sources:

- MCP architecture: https://modelcontextprotocol.io/docs/learn/architecture
- Tools spec: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Resources spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- Prompts spec: https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
- Streamable HTTP transport spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- Authorization spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

## Test harness options

Use the existing Vitest patterns:

- Fastify injection/temp project tests already exist for REST routes (`packages/kernel/tests/e2e.test.ts`, `packages/kernel/tests/routes/events.test.ts`, `packages/kernel/tests/routes/todos.test.ts`).
- WebSocket event tests already start a real server on a random port (`packages/kernel/tests/ws.test.ts`).
- Temp project helpers live in `packages/kernel/tests/helpers/tempdir.ts`.

Recommended MCP tests:

- Service unit tests for extracted participant/session/event/todo helpers.
- MCP schema tests that instantiate `McpServer` and call `tools/list`, `tools/call`, `resources/read`, and `prompts/get` through the SDK client.
- Stdio tests using SDK in-memory transport if practical, otherwise a child-process `f-mark mcp` smoke test against a temp kernel.
- Streamable HTTP tests against a live random-port Fastify server using the SDK `Client` plus `StreamableHTTPClientTransport`, with direct JSON-RPC requests for auth-negative cases.
- Bus regression test: call an MCP mutating tool and assert the existing WebSocket receives `event_added`.

## Risks

- Route duplication: copying current route handlers into MCP will fork validation, output shape, and bus behavior. Extract services first where possible.
- Stdio freshness: direct file writes from stdio bypass the running kernel's bus and active path context. Proxy stdio mutations to HTTP until there is a deliberate cross-process event strategy.
- Fastify transport ownership: SDK Streamable HTTP writes raw responses; incorrect `reply` handling can cause double-send bugs or broken SSE.
- Auth leakage: avoid putting bearer tokens into generated MCP config. Prefer stdio with local token discovery; require bearer for HTTP `/mcp` if browser cookie/query auth is too permissive.
- Session confusion: isolate MCP protocol sessions from F-Mark sessions, and do not share one stateful MCP server/transport across unrelated auth contexts.
- Duplicate capture: if an agent both calls MCP `fmark_post_prose` and the hook captures its final answer, duplicate prose can appear. Keep MCP for structured artifacts and hooks for passive ordinary turn capture.
- Multi-path mismatch: some routes use active `PathDeps`; `/agents/:id/link` does not. MCP context must be path-aware from the start.
- HTML/file surface: model-authored HTML/JS and file metadata need tight schemas and existing path containment checks.
- SDK churn: stable SDK 1.x is appropriate now; alpha split packages should be revisited only when they become stable.
