# Gemini CLI MCP Findings for F-Mark

Date: 2026-05-25  
Scope: research only. This file covers Gemini CLI installation/configuration for the planned `f-mark` MCP server.

## Sources Checked

- Official Gemini CLI MCP docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
- Gemini CLI reference, MCP management: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md#mcp-server-management
- Gemini CLI configuration docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Gemini CLI trusted folders docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
- Gemini CLI enterprise/MCP policy docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/enterprise.md#managing-custom-tools-mcp-servers
- Official settings schema: https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json

Local sanity check: this machine has `gemini` 0.43.0, and `gemini mcp add --help` matches the official add flags below, including `--scope user|project`, `--transport stdio|sse|http`, `--env`, `--header`, `--timeout`, and `--trust`.

## Bottom Line

Use project-scoped stdio first:

- It avoids writing F-Mark bearer tokens into Gemini settings.
- It matches F-Mark's planned `f-mark mcp` command.
- Gemini's default MCP scope is already `project`, which writes `.gemini/settings.json`.
- Do not auto-set `trust: true`; let Gemini prompt for F-Mark tool calls.

HTTP is supported via Streamable HTTP, but authenticated HTTP should be manual/user-scoped until header token handling is smoke-tested. SSE is supported by Gemini but is not an F-Mark target unless F-Mark later exposes an SSE MCP endpoint.

## Transports And Scopes

Supported transports:

- `stdio`: `command` plus optional `args`, `env`, `cwd`; Gemini spawns a subprocess.
- `http`: Streamable HTTP, stored as `httpUrl`.
- `sse`: Server-Sent Events, stored as `url`.

`mcpServers` transport precedence is `httpUrl`, then `url`, then `command` if more than one appears.

Supported `gemini mcp add` scopes:

- `project`: default; writes `<project>/.gemini/settings.json`.
- `user`: writes `~/.gemini/settings.json`.

Other config layers exist but are not exposed as `gemini mcp add` scopes: system defaults, system overrides, and enterprise/admin settings can merge, override, allowlist, or block MCP servers.

## Exact Commands

Recommended project stdio command for the future published `f-mark mcp` entrypoint:

```bash
gemini mcp add --scope project --transport stdio \
  --env F_MARK_PATH=/home/roey/workspace/F-Mark \
  --timeout 30000 \
  f-mark npx -y f-mark mcp
```

Equivalent shorter form, relying on Gemini defaults:

```bash
gemini mcp add -s project -e F_MARK_PATH=/home/roey/workspace/F-Mark f-mark npx -y f-mark mcp
```

User-scope stdio variant:

```bash
gemini mcp add --scope user --transport stdio \
  --env F_MARK_PATH=/home/roey/workspace/F-Mark \
  --timeout 30000 \
  f-mark npx -y f-mark mcp
```

HTTP only when F-Mark exposes `POST /mcp` Streamable HTTP and auth is disabled:

```bash
gemini mcp add --scope project --transport http \
  --timeout 30000 \
  f-mark http://localhost:7777/mcp
```

Authenticated HTTP command, safe only if the user accepts that the header value is persisted in Gemini settings:

```bash
gemini mcp add --scope user --transport http \
  --header "Authorization: Bearer <token>" \
  --timeout 30000 \
  f-mark http://localhost:7777/mcp
```

SSE syntax, only if F-Mark later exposes an SSE MCP endpoint:

```bash
gemini mcp add --scope project --transport sse \
  f-mark http://localhost:7777/sse
```

Do not auto-run a command with `--trust`.

## `settings.json` Shape

Recommended project stdio entry:

```json
{
  "$schema": "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json",
  "mcpServers": {
    "f-mark": {
      "command": "npx",
      "args": ["-y", "f-mark", "mcp"],
      "env": {
        "F_MARK_PATH": "/home/roey/workspace/F-Mark"
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

HTTP shape:

```json
{
  "mcpServers": {
    "f-mark": {
      "httpUrl": "http://localhost:7777/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      },
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Relevant optional properties: `description`, `includeTools`, `excludeTools`, `cwd`, `headers`, `env`, `authProviderType`, `oauth`, `targetAudience`, and `targetServiceAccount`. Gemini also supports global `mcp.allowed` and `mcp.excluded`.

Use the alias `f-mark`, not an underscore alias, because Gemini warns that underscores in server aliases can confuse policy parsing of `mcp_<server>_<tool>` names.

## Config Locations

Normal locations:

- Project: `.gemini/settings.json`
- User: `~/.gemini/settings.json`
- System defaults: `/etc/gemini-cli/system-defaults.json` on Linux
- System overrides: `/etc/gemini-cli/settings.json` on Linux

Platform variants and overrides:

- Windows system path: `C:\ProgramData\gemini-cli\...`
- macOS system path: `/Library/Application Support/GeminiCli/...`
- `GEMINI_CLI_HOME` changes the user config root; Gemini creates `.gemini` inside it.
- `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` and `GEMINI_CLI_SYSTEM_SETTINGS_PATH` can override system paths.
- Trust state defaults to `~/.gemini/trustedFolders.json`, overrideable with `GEMINI_CLI_TRUSTED_FOLDERS_PATH`.
- Disabled/enabled MCP state is stored in `~/.gemini/mcp-server-enablement.json`.
- OAuth tokens for remote MCP are stored in `~/.gemini/mcp-oauth-tokens.json`.

## Trust Behavior

There are two separate trust layers:

- MCP server trust: `trust: true` or `gemini mcp add --trust` bypasses all tool-call confirmations for that server. F-Mark should not set this automatically.
- Folder trust: if Gemini folder trust is enabled and the project is untrusted, Gemini ignores project `.gemini/settings.json`, ignores project `.env`, disables tool auto-acceptance, and does not connect MCP servers.

Gemini docs say `/permissions trust [<directory-path>]` manages folder trust. The MCP docs also mention `gemini trust` in the `gemini mcp list` note; treat that as a documentation inconsistency to smoke-test before putting it in UI copy.

## Status Detection Strategy

Use file parsing for F-Mark UI status, and reserve `gemini mcp list` for manual smoke:

1. Parse `.gemini/settings.json` and the effective user file, respecting `GEMINI_CLI_HOME` if known.
2. Optionally read system settings if accessible; report that system/admin config may override local state.
3. Detect `mcpServers["f-mark"]` and classify transport:
   - stdio: `command: "npx"` with args containing `["-y", "f-mark", "mcp"]`, or a future direct `f-mark mcp`.
   - http: `httpUrl` matching the current F-Mark `/mcp` URL.
   - sse: `url`, supported by Gemini but not expected for F-Mark v1.
4. Check `mcp.allowed`, `mcp.excluded`, `includeTools`, and `excludeTools` for blockers.
5. Check `~/.gemini/mcp-server-enablement.json` for disabled `f-mark`.
6. If project config exists but folder trust may be active, show "configured, may require project trust" rather than "connected".
7. Treat invalid JSON or unknown schema as "manual instructions needed".

Do not run `gemini mcp list` from the kernel for background status. It can attempt connections, may spawn stdio servers, and reports stdio servers as disconnected when the current folder is untrusted.

## Auto-Apply Feasibility And Safety

Safe first auto-apply target:

- Project-scoped stdio only.
- Structured JSON parse/merge of `.gemini/settings.json`.
- Preserve unrelated settings and existing `mcpServers`.
- Create `.gemini/` and `settings.json` only with explicit user action.
- Set `trust: false`.
- Set `F_MARK_PATH` to the absolute project root.
- Do not write tokens.

Avoid for v1 auto-apply:

- Authenticated HTTP entries with literal bearer tokens.
- `--trust` / `trust: true`.
- Editing `mcp.allowed` automatically, because it changes the user's MCP policy surface.
- System-level Gemini settings.

If an allowlist already exists and omits `f-mark`, report that F-Mark is configured but blocked and provide manual instructions.

## Auth And Headers

For stdio, prefer that `f-mark mcp` resolves the project root, reads `.f-mark/config.json`, and reads `.f-mark/.token` when the kernel is in token mode. This keeps secrets out of Gemini settings.

For HTTP/SSE, Gemini supports `--header` and a `headers` object. A literal bearer header will be persisted to the selected settings file. Project-scope authenticated HTTP is therefore unsafe by default.

Gemini settings support environment-variable expansion, and MCP `env` values are explicitly expanded. Before relying on `${F_MARK_TOKEN}` inside `headers.Authorization`, smoke-test header expansion specifically; if it works, prefer user-scope config plus shell-provided `F_MARK_TOKEN`.

Gemini also supports OAuth for remote SSE/HTTP MCP servers, including `/mcp auth`, dynamic discovery, Google ADC, and service-account impersonation. That is not needed for local F-Mark bearer auth.

## Manual Smoke Steps

1. Implement/build `f-mark mcp`; start the F-Mark kernel from `/home/roey/workspace/F-Mark`.
2. Run the project stdio add command above from the project root.
3. Start `gemini` from `/home/roey/workspace/F-Mark`.
4. If prompted by folder trust, inspect the `.gemini/settings.json` change and trust the folder only if expected. In-session command: `/permissions trust /home/roey/workspace/F-Mark`.
5. Run `/mcp` or `/mcp list`; verify `f-mark` is connected and tools/resources are listed.
6. Run `/mcp schema` to inspect tool schemas after Gemini sanitization.
7. Ask Gemini to call an F-Mark tool, for example post a short hello event, and confirm the tool call when prompted.
8. Verify the event appears in the F-Mark renderer.
9. Run `gemini mcp list` from a shell as a secondary diagnostic; remember it has no flags and stdio status depends on folder trust.
10. Restart Gemini and confirm the server reconnects.

## Open Risks

- `f-mark mcp` and `/mcp` do not exist yet; all commands are installation targets for the planned server.
- `npx -y f-mark mcp` depends on the published package name/version. Local dev may need a different command until packaging is ready.
- Header environment interpolation for `headers.Authorization` needs a direct smoke test before any auto-apply path uses it.
- Project trust can make an installed project config inactive or make `gemini mcp list` show stdio as disconnected.
- System/admin settings can override `f-mark`, disable MCP, or require `mcp.allowed`.
- Gemini strips some schema properties such as `$schema` and `additionalProperties`, and sanitizes/truncates tool names. F-Mark tool schemas need a Gemini compatibility test.
- Sandboxed Gemini sessions may not be able to run `npx`, access the project root, read `.f-mark/.token`, or reach `localhost:7777`.
- Avoid duplicate events when MCP and F-Mark stream hooks are both enabled.
- Need to confirm whether F-Mark's `.f-mark/config.json` always reflects non-default kernel ports before stdio MCP proxies to the HTTP API.
