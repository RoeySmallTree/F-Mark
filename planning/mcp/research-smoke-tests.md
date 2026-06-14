# MCP Phase 0 Research Smoke Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 0 hot-testing only. No MCP implementation, dependency changes, package file edits, or production source edits.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| `node --version` | PASS | `v24.15.0` |
| `pnpm --version` | PASS | `10.33.2` |
| `tmux -V` | PASS | `tmux 3.4` |
| `claude --version` | PASS | `2.1.128 (Claude Code)` |
| `codex --version` | PASS | `codex-cli 0.133.0` |
| `gemini --version` | PASS | `0.43.0` |
| `pnpm view @modelcontextprotocol/sdk version` | PASS | `1.29.0` |
| `claude mcp add --help` | PASS | Command shape confirmed |
| `codex mcp add --help` | PASS | Command shape confirmed |
| `gemini mcp add --help` | PASS | Command shape confirmed |
| Temp F-Mark session creation via existing `/sessions` route injection | PASS | Session folder existed and was empty |

## Baseline Commands

### `node --version`

Status: PASS

Observed output:

```text
v24.15.0
```

### `pnpm --version`

Status: PASS

Observed output:

```text
10.33.2
```

### `tmux -V`

Status: PASS

Observed output:

```text
tmux 3.4
```

### `claude --version`

Status: PASS

Observed output:

```text
2.1.128 (Claude Code)
```

### `codex --version`

Status: PASS

Observed output:

```text
codex-cli 0.133.0
```

### `gemini --version`

Status: PASS

Observed output:

```text
0.43.0
```

### `pnpm view @modelcontextprotocol/sdk version`

Status: PASS

Observed output:

```text
1.29.0
```

## MCP Add Help Commands

### `claude mcp add --help`

Status: PASS

Observed output:

```text
Usage: claude mcp add [options] <name> <commandOrUrl> [args...]

Add an MCP server to Claude Code.

Examples:
  # Add HTTP server:
  claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

  # Add HTTP server with headers:
  claude mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer ..."

  # Add stdio server with environment variables:
  claude mcp add -e API_KEY=xxx my-server -- npx my-mcp-server

  # Add stdio server with subprocess flags:
  claude mcp add my-server -- my-command --some-flag arg1

Options:
  --callback-port <port>       Fixed port for OAuth callback (for servers
                               requiring pre-registered redirect URIs)
  --client-id <clientId>       OAuth client ID for HTTP/SSE servers
  --client-secret              Prompt for OAuth client secret (or set
                               MCP_CLIENT_SECRET env var)
  -e, --env <env...>           Set environment variables (e.g. -e KEY=value)
  -H, --header <header...>     Set WebSocket headers (e.g. -H "X-Api-Key:
                               abc123" -H "X-Custom: value")
  -h, --help                   Display help for command
  -s, --scope <scope>          Configuration scope (local, user, or project)
                               (default: "local")
  -t, --transport <transport>  Transport type (stdio, sse, http). Defaults to
                               stdio if not specified.
```

Confirmed command shape:

```text
claude mcp add [options] <name> <commandOrUrl> [args...]
```

Important flags:

```text
--transport stdio|sse|http
--scope local|user|project
--env KEY=value
--header "Name: value"
```

### `codex mcp add --help`

Status: PASS

Observed output:

```text
Usage: codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)

Arguments:
  <NAME>
          Name for the MCP server configuration

  [COMMAND]...
          Command to launch the MCP server. Use --url for a streamable HTTP server

Options:
  -c, --config <key=value>
          Override a configuration value that would otherwise be loaded from `~/.codex/config.toml`.
          Use a dotted path (`foo.bar.baz`) to override nested values. The `value` portion is parsed
          as TOML. If it fails to parse as TOML, the raw string is used as a literal.
          
          Examples: - `-c model="o3"` - `-c 'sandbox_permissions=["disk-full-read-access"]'` - `-c
          shell_environment_policy.inherit=all`

      --env <KEY=VALUE>
          Environment variables to set when launching the server. Only valid with stdio servers

      --enable <FEATURE>
          Enable a feature (repeatable). Equivalent to `-c features.<name>=true`

      --url <URL>
          URL for a streamable HTTP MCP server

      --bearer-token-env-var <ENV_VAR>
          Optional environment variable to read for a bearer token. Only valid with streamable HTTP
          servers

      --disable <FEATURE>
          Disable a feature (repeatable). Equivalent to `-c features.<name>=false`

  -h, --help
          Print help (see a summary with '-h')
```

Confirmed command shape:

```text
codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)
```

Important flags:

```text
--url <URL>
--env <KEY=VALUE>
--bearer-token-env-var <ENV_VAR>
--config <key=value>
```

### `gemini mcp add --help`

Status: PASS

Observed output:

```text
Usage: gemini mcp add [options] <name> <commandOrUrl> [args...]

Positionals:
  name          Name of the server  [string] [required]
  commandOrUrl  Command (stdio) or URL (sse, http)  [string] [required]

Options:
  -d, --debug              Run in debug mode (open debug console with F12)  [boolean] [default: false]
  -s, --scope              Configuration scope (user or project)  [string] [choices: "user", "project"] [default: "project"]
  -t, --transport, --type  Transport type (stdio, sse, http)  [string] [choices: "stdio", "sse", "http"] [default: "stdio"]
  -e, --env                Set environment variables (e.g. -e KEY=value)  [array]
  -H, --header             Set HTTP headers for SSE and HTTP transports (e.g. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123")  [array]
      --timeout            Set connection timeout in milliseconds  [number]
      --trust              Trust the server (bypass all tool call confirmation prompts)  [boolean]
      --description        Set the description for the server  [string]
      --include-tools      A comma-separated list of tools to include  [array]
      --exclude-tools      A comma-separated list of tools to exclude  [array]
  -h, --help               Show help  [boolean]
```

Confirmed command shape:

```text
gemini mcp add [options] <name> <commandOrUrl> [args...]
```

Important flags:

```text
--scope user|project
--transport stdio|sse|http
--env KEY=value
--header "Name: value"
```

## Temp F-Mark Session Creation Smoke

Status: PASS

Purpose: create one real temp project and one session through the existing kernel route handler without starting a long-lived server.

Harness isolation:

```bash
ROOT="$(mktemp -d /tmp/fmark-hot-project-XXXXXX)"
HOME_DIR="$(mktemp -d /tmp/fmark-hot-home-XXXXXX)"
XDG_DIR="$(mktemp -d /tmp/fmark-hot-xdg-XXXXXX)"
export ROOT
export HOME="$HOME_DIR"
export XDG_CONFIG_HOME="$XDG_DIR"
export CODEX_HOME="$HOME_DIR/.codex"
export FMARK_HOT=1
trap 'rm -rf "$ROOT" "$HOME_DIR" "$XDG_DIR"' EXIT
```

Exact command:

```bash
ROOT="$(mktemp -d /tmp/fmark-hot-project-XXXXXX)"
HOME_DIR="$(mktemp -d /tmp/fmark-hot-home-XXXXXX)"
XDG_DIR="$(mktemp -d /tmp/fmark-hot-xdg-XXXXXX)"
export ROOT
export HOME="$HOME_DIR"
export XDG_CONFIG_HOME="$XDG_DIR"
export CODEX_HOME="$HOME_DIR/.codex"
export FMARK_HOT=1
trap 'rm -rf "$ROOT" "$HOME_DIR" "$XDG_DIR"' EXIT
pnpm -F f-mark exec tsx --eval '
(async () => {
  const { readdir, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { initProject } = await import("./src/project.js");
  const { paths } = await import("./src/paths.js");
  const { createServer } = await import("./src/server.js");

  const root = process.env.ROOT;
  const home = process.env.HOME;
  const xdg = process.env.XDG_CONFIG_HOME;
  const codexHome = process.env.CODEX_HOME;
  if (!root || !home || !xdg || !codexHome) throw new Error("missing isolation env");
  const p = paths(root);
  await initProject(p, 7788);
  const { app } = createServer({ token: null, paths: p });
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { slug: "mcp-hot-baseline" } });
  const body = res.json();
  const sessionDir = join(root, ".f-mark", "sessions", body.id ?? "");
  let dirExists = false;
  let entries = [];
  try {
    const s = await stat(sessionDir);
    dirExists = s.isDirectory();
    entries = await readdir(sessionDir);
  } finally {
    await app.close();
  }
  console.log(JSON.stringify({ root, home, xdg, codexHome, statusCode: res.statusCode, response: body, sessionDir, dirExists, entries }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
'
```

Observed output:

```text
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.33.2.tgz
{
  "root": "/tmp/fmark-hot-project-4gdzwA",
  "home": "/tmp/fmark-hot-home-MBfOSv",
  "xdg": "/tmp/fmark-hot-xdg-MKau61",
  "codexHome": "/tmp/fmark-hot-home-MBfOSv/.codex",
  "statusCode": 200,
  "response": {
    "id": "2026-05-25-mcp-hot-baseline",
    "slug": "mcp-hot-baseline",
    "created_at": "2026-05-25T11:46:54.766Z",
    "path": "/tmp/fmark-hot-project-4gdzwA",
    "path_id": "0ca5d7ea961b"
  },
  "sessionDir": "/tmp/fmark-hot-project-4gdzwA/.f-mark/sessions/2026-05-25-mcp-hot-baseline",
  "dirExists": true,
  "entries": []
}
```

Expected session folder state:

```text
$ROOT/.f-mark/sessions/2026-05-25-mcp-hot-baseline exists
directory entries: []
```

Observed session folder state:

```text
/tmp/fmark-hot-project-4gdzwA/.f-mark/sessions/2026-05-25-mcp-hot-baseline exists
directory entries: []
```

Cleanup verification command:

```bash
for p in /tmp/fmark-hot-project-4gdzwA /tmp/fmark-hot-home-MBfOSv /tmp/fmark-hot-xdg-MKau61; do if [ -e "$p" ]; then printf '%s exists\n' "$p"; else printf '%s removed\n' "$p"; fi; done
```

Observed cleanup output:

```text
/tmp/fmark-hot-project-4gdzwA removed
/tmp/fmark-hot-home-MBfOSv removed
/tmp/fmark-hot-xdg-MKau61 removed
```

## Caveats And Assumptions Not Hot-Tested

- The F-Mark smoke used the existing Fastify route injection harness (`createServer(...).app.inject`) instead of starting a long-lived kernel server on a TCP port. This still exercised the real `POST /sessions` route and project/session filesystem writes.
- No managed agent participant was spawned or registered in this Phase 0 smoke.
- No event files were written, so the expected creation-only session folder state was empty. Later phase gates must hot-test event file creation.
- Vendor MCP config mutation was not performed. The Phase 0 vendor checks only verified local CLI presence and `mcp add --help` command syntax.
- The isolated `HOME` caused Corepack to print a cold-cache download notice for pnpm before the session smoke. The command still passed.
- The passing `pnpm -F f-mark exec tsx --eval` command runs with `packages/kernel` as the eval working directory, so source imports use `./src/...`.
