# Phase 22 Streamable HTTP MCP Hot Tests

Date: 2026-05-26

Final report:

```text
/tmp/fmark-mcp-phase22-hot-SnbvxD/report.json
```

Run id: `phase22-mply23po`

Vendor versions recorded by the hot run:

- Claude: `2.1.128 (Claude Code)`
- Codex: `codex-cli 0.133.0`
- Gemini: `0.43.0`

## Coverage

The final run started a real F-Mark kernel on a random localhost port and exercised the `/mcp` Streamable HTTP endpoint with real session folders and event files.

Passed checks:

- CORS preflight exposes `Authorization`, `Content-Type`, `Accept`, `Mcp-Session-Id`, `MCP-Protocol-Version`, and `Last-Event-ID`, and exposes MCP response headers.
- `/mcp` is bearer-only; query-token and cookie-token auth are rejected for HTTP MCP even though normal UI routes still support them.
- Non-local browser `Origin` is rejected.
- Missing and invalid `Mcp-Session-Id` are rejected for POST, GET/SSE, and DELETE.
- Raw Streamable HTTP initialize, initialized notification, GET/SSE, valid DELETE, and post-DELETE session cleanup work.
- SDK `StreamableHTTPClientTransport` can list tools, call tools, and write real F-Mark events.
- HTTP MCP excludes `fmark_fork_session`, keeping the process-spawning/relaunch-capable tool out of the HTTP transport.
- Claude real model used HTTP MCP to write a real session event.
- Codex real model used HTTP MCP to write a real session event.
- Gemini real model used HTTP MCP to write a real session event.
- No bearer token was written into project config or project files, excluding the normal `.f-mark/.token` runtime secret.

## Findings And Fixes

First hot run report:

```text
/tmp/fmark-mcp-phase22-hot-BsAkJP/report.json
```

Finding: raw initialize can return an SSE-framed JSON-RPC response, not only an `application/json` body. The hot runner now accepts both valid response shapes.

Second hot run report:

```text
/tmp/fmark-mcp-phase22-hot-9dMmbl/report.json
```

Finding: all functional checks passed, but the kernel log showed `RangeError: Maximum call stack size exceeded` during HTTP MCP session cleanup. Root cause was recursive `server.close()` and `transport.close()` through the transport `onclose` callback. The HTTP route now uses a guarded per-session close function.

Final hot run:

```text
/tmp/fmark-mcp-phase22-hot-SnbvxD/report.json
```

The final report passed all checks and the kernel log tail contained no cleanup stack traces.
