# Claude Code MCP Findings

> Date: 2026-05-25  
> Scope: Claude Code MCP installation strategy for F-Mark.  
> Sources: [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), [Claude Code permissions](https://code.claude.com/docs/en/permissions), [Claude Code managed MCP](https://code.claude.com/docs/en/managed-mcp), [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture), [MCP transports spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports). Local sanity check: `claude --version` is `2.1.128`, and `claude mcp add --help` lists `stdio`, `sse`, and `http`.

## Supported Transports And Scopes

- Transports: Claude Code supports local `stdio`, remote `http`, and remote `sse`. HTTP is the recommended remote transport; SSE is deprecated and should not be a F-Mark target. In JSON config, Claude accepts `streamable-http` as an alias for `http`.
- MCP standard transports are `stdio` and Streamable HTTP. Streamable HTTP uses a single endpoint path with POST for client messages and optional GET/SSE for server-to-client streams; local HTTP servers should bind localhost, validate `Origin`, and require auth.
- Scopes: `local` is the default and loads only in the current project, stored under the project entry in `~/.claude.json`; `project` is shared through `<repo>/.mcp.json`; `user` loads in all projects and is stored in `~/.claude.json`.
- Precedence: local > project > user > plugin-provided servers > Claude.ai connectors. A higher-precedence `f-mark` entry can shadow the project entry.
- Claude sets `CLAUDE_PROJECT_DIR` in spawned stdio server environments. F-Mark should use that or MCP `roots/list` to locate the project rather than relying on cwd.

## Install Commands

Recommended first slice, project-shared stdio:

```bash
claude mcp add --transport stdio --scope project f-mark -- npx -y f-mark mcp
```

Private current-project stdio, useful for testing or avoiding VCS changes:

```bash
claude mcp add --transport stdio --scope local f-mark -- npx -y f-mark mcp
```

HTTP, if F-Mark ships `http://localhost:7777/mcp`. Project-safe form stores an env placeholder, not the token:

```bash
claude mcp add --transport http --scope project \
  --header 'Authorization: Bearer ${F_MARK_TOKEN}' \
  f-mark http://localhost:7777/mcp
```

HTTP local/private form with a literal token, only with explicit user consent:

```bash
claude mcp add --transport http --scope local \
  --header "Authorization: Bearer <token>" \
  f-mark http://localhost:7777/mcp
```

## Config Files Touched

- `--scope project`: creates or updates `<repo>/.mcp.json`, under `mcpServers.f-mark`.
- `--scope local`: updates `~/.claude.json` under `projects["<absolute repo path>"].mcpServers.f-mark`.
- `--scope user`: updates `~/.claude.json`; official docs state the file but do not document the exact user-scope JSON shape.
- `claude mcp add` should be preferred for manual install. If F-Mark later auto-applies, write JSON with a parser/serializer and preserve unrelated entries.
- Expected stdio entry shape to accept during detection:

```json
{
  "mcpServers": {
    "f-mark": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "f-mark", "mcp"],
      "env": {}
    }
  }
}
```

- Expected HTTP entry shape:

```json
{
  "mcpServers": {
    "f-mark": {
      "type": "http",
      "url": "http://localhost:7777/mcp",
      "headers": {
        "Authorization": "Bearer ${F_MARK_TOKEN}"
      }
    }
  }
}
```

## Status Detection Strategy

- Parse `<repo>/.mcp.json` and `~/.claude.json` if readable. Never display header values or env values that look secret.
- Detect local scope from `~/.claude.json.projects[repoPath].mcpServers["f-mark"]`. For user scope, tolerate likely top-level or documented-future shapes, but report unknown schema as "manual verification needed".
- Classify transport by `type`, `url`, and `command`: `http`/`streamable-http` or `url` => HTTP; `sse` => deprecated; `command` => stdio.
- Apply Claude precedence. If a local `f-mark` differs from the expected project entry, report a shadowing conflict instead of "installed".
- Match stdio by command and args. Match HTTP by normalized localhost URL and transport; redact headers.
- Check for enterprise policy hints: `/etc/claude-code/managed-mcp.json` on Linux/WSL, `/Library/Application Support/ClaudeCode/managed-mcp.json` on macOS, or `C:\Program Files\ClaudeCode\managed-mcp.json` on Windows. Managed MCP can make `claude mcp add` fail or make configured servers disappear from `/mcp`.
- Use `claude mcp list`, `claude mcp get f-mark`, and in-session `/mcp` as manual smoke/diagnostic steps, not normal kernel status checks.

## Auto-Apply Feasibility And Safety

- Project-scoped stdio auto-apply is feasible and the safest candidate because it need not write bearer tokens. It still writes an executable command to a versioned file and will trigger Claude's project MCP approval prompt, so it should require explicit UI confirmation.
- Local/user auto-apply mutates `~/.claude.json`; avoid unless the user explicitly asks to apply private config. Prefer showing the `claude mcp add` command.
- HTTP auto-apply is safe only if the project config uses an env placeholder such as `${F_MARK_TOKEN}`. Do not write `.f-mark/.token` into `.mcp.json`.
- Avoid auto-writing `headersHelper` initially. It is useful for dynamic auth, but it executes arbitrary shell and Claude only runs project/local helpers after workspace trust.
- Do not set `alwaysLoad` by default. It can make startup block until the server connects and requires Claude Code v2.1.121+.

## Auth And Token Handling

- Preferred v1: stdio server reads `.f-mark/.token` itself after resolving the project via `CLAUDE_PROJECT_DIR` or `roots/list`. This keeps tokens out of Claude config.
- HTTP with bearer auth stores static `--header` values in MCP config. Use local scope for literal tokens, or project scope only with env expansion (`${F_MARK_TOKEN}`) and clear instructions to launch Claude with that env var set.
- Claude supports OAuth for HTTP/SSE servers; access tokens are stored securely/refreshed, and client secrets are stored in keychain or a credentials file rather than config. This is likely overkill for local F-Mark but relevant for future remote/team servers.
- Streamable HTTP security requirements matter even on localhost: bind `127.0.0.1`, validate `Origin`, and require proper auth unless the kernel is intentionally in no-auth mode.

## Approval And Trust Behavior

- Project `.mcp.json` servers require user approval before Claude uses them. Users can reset those decisions with `claude mcp reset-project-choices`.
- MCP tool calls are governed by Claude Code permissions. To avoid repeated prompts, users can allow `mcp__f-mark__*`; deny rules and managed policies still take precedence.
- `bypassPermissions` would auto-approve MCP tools but is much broader than needed. Prefer explicit permission rules.
- Enterprise `managed-mcp.json`, `allowedMcpServers`, and `deniedMcpServers` can block F-Mark even when config files contain a valid entry.

## Manual Smoke Steps

1. Install stdio: `claude mcp add --transport stdio --scope project f-mark -- npx -y f-mark mcp`.
2. Restart Claude Code in the F-Mark repo and accept the project MCP approval prompt.
3. Run `/mcp`; expect `f-mark` connected with a nonzero tool count.
4. Outside a session, run `claude mcp list` and `claude mcp get f-mark` to confirm the detected entry.
5. Ask Claude to read F-Mark state and post a short hello through the MCP tool; confirm the event appears in the renderer.
6. HTTP variant: start the kernel with `/mcp`, export `F_MARK_TOKEN`, install the HTTP entry, launch Claude with `F_MARK_TOKEN` in its environment, then repeat `/mcp` and post-prose checks.

## Open Risks

- `npx -y f-mark mcp` pulls by package name; pinning a version or using a local workspace binary may be safer for development.
- Headless Claude sessions can stall on project MCP approval prompts. Local scope avoids `.mcp.json` approval but moves config into `~/.claude.json`.
- User-scope `~/.claude.json` layout is not fully documented; detection should be tolerant and fall back to manual CLI verification.
- HTTP support in F-Mark must implement Streamable HTTP correctly, including POST/optional GET, auth, origin checks, and keeping MCP session IDs distinct from F-Mark session IDs.
- Tool search may defer F-Mark tool schemas; prompts/guide text should name the server and tools clearly so Claude searches for them.
- Enterprise policy can block or hide the server with little signal to F-Mark unless users run `claude mcp list` or inspect `/mcp`.
