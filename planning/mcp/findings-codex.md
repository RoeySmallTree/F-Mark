# Codex CLI MCP Findings For F-Mark

Date: 2026-05-25  
Local check: `codex-cli 0.133.0` at `/home/roey/.local/share/mise/installs/node/lts/bin/codex`

## Sources Checked

- OpenAI Codex MCP docs: https://developers.openai.com/codex/mcp
- OpenAI Codex config basics: https://developers.openai.com/codex/config-basic
- OpenAI Codex config reference: https://developers.openai.com/codex/config-reference
- OpenAI Docs MCP setup page: https://developers.openai.com/learn/docs-mcp
- OpenAI Codex source:
  - https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs
  - https://github.com/openai/codex/blob/main/codex-rs/config/src/mcp_types.rs
  - https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs
  - https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs
- Local CLI help: `codex mcp --help`, `codex mcp add --help`, `codex mcp list --help`, `codex mcp get --help`.

## Supported Codex MCP Transports

Codex supports MCP servers in both CLI and IDE extension using shared config.

- `stdio`: local process launched by `command` plus optional `args`, `env`, `env_vars`, and `cwd`.
- `streamable_http`: remote/local HTTP endpoint at `url`, with bearer-token env auth, OAuth login support, and optional static/env-sourced headers.

No direct SSE-only transport was found in the current official Codex docs or local CLI help. F-Mark HTTP MCP should implement MCP Streamable HTTP, not plain REST and not SSE-only.

## Exact Install Commands

Recommended v1 for F-Mark is stdio, because it avoids storing bearer tokens in Codex config:

```bash
codex mcp add f-mark --env F_MARK_PATH=/home/roey/workspace/F-Mark -- npx -y f-mark mcp
```

If `f-mark mcp` can discover the project from cwd, this shorter user-level install is also valid:

```bash
codex mcp add f-mark -- npx -y f-mark mcp
```

HTTP without auth, only for local `--no-auth` or smoke environments:

```bash
codex mcp add f-mark --url http://localhost:7777/mcp
```

HTTP with bearer token sourced from the Codex process environment:

```bash
codex mcp add f-mark --url http://localhost:7777/mcp --bearer-token-env-var F_MARK_TOKEN
```

Important: `codex mcp add/remove` writes the global/user config under `$CODEX_HOME/config.toml` (`~/.codex/config.toml` by default). It does not provide a `--scope project` flag. Project-scoped config must be written as `.codex/config.toml` directly.

## `config.toml` Schema

Stdio:

```toml
[mcp_servers.f-mark]
command = "npx"
args = ["-y", "f-mark", "mcp"]
env = { F_MARK_PATH = "/home/roey/workspace/F-Mark" }
startup_timeout_sec = 10
tool_timeout_sec = 60
enabled = true
default_tools_approval_mode = "prompt"
```

Optional stdio keys confirmed by docs/source: `env_vars`, `cwd`, `experimental_environment`, `required`, `enabled_tools`, `disabled_tools`, and per-tool approval under `[mcp_servers.f-mark.tools.<tool>]`.

Streamable HTTP:

```toml
[mcp_servers.f-mark]
url = "http://localhost:7777/mcp"
bearer_token_env_var = "F_MARK_TOKEN"
startup_timeout_sec = 10
tool_timeout_sec = 60
enabled = true
default_tools_approval_mode = "prompt"
```

Header variants:

```toml
[mcp_servers.f-mark]
url = "http://localhost:7777/mcp"
http_headers = { "X-F-Mark-Client" = "codex" }
env_http_headers = { "Authorization" = "F_MARK_AUTH_HEADER" }
```

Do not use `bearer_token = "...";` Codex source rejects inline bearer tokens and tells users to set `bearer_token_env_var`.

## Config Locations And Project Behavior

- User config: `$CODEX_HOME/config.toml`; defaults to `~/.codex/config.toml`.
- Project config: `.codex/config.toml` in the repo/project tree, loaded only for trusted projects.
- System config on Unix: `/etc/codex/config.toml`.
- CLI and IDE extension share the same config layers.
- Precedence from docs: CLI flags/`--config`, profile values, trusted project `.codex/config.toml` layers, user config, system config, defaults.
- Project config can contain `mcp_servers`; Codex only loads it after trust. Because it can start local commands, F-Mark should not silently create project MCP config without an explicit user action.

## Status Detection Strategy

Use TOML parsing, not string matching:

- Resolve `CODEX_HOME` if set, otherwise `~/.codex`, then parse `config.toml`.
- Parse `/home/roey/workspace/F-Mark/.codex/config.toml` if present, but report it as "effective only when Codex trusts this project" unless user config contains a trusted `[projects]` entry for this path/repo root.
- Optionally inspect `/etc/codex/config.toml` read-only when permissions allow.
- Detect by exact server name `f-mark` and by equivalent entries: stdio command/args containing `f-mark` + `mcp`, or HTTP `url` matching the kernel MCP URL.
- Classify transport as `stdio`, `http`, or `unknown`; report disabled entries when `enabled = false`.
- Use `codex mcp list --json` or `codex mcp get f-mark --json` only as a manual/user-triggered diagnostic, with redaction of `http_headers`; the normal kernel UI should avoid spawning Codex for status.

## Auto-Apply Feasibility And Safety

Safest v1: show manual commands/snippets and detect status.

Feasible auto-apply options:

- User-level stdio via `codex mcp add f-mark --env F_MARK_PATH=... -- npx -y f-mark mcp`. This is simple but global, not project-scoped.
- User-level HTTP via `codex mcp add ... --bearer-token-env-var F_MARK_TOKEN`. This stores only the env var name, not the token, but only works if the Codex process environment has `F_MARK_TOKEN`.
- Project-scoped `.codex/config.toml` by direct TOML edit. Use a TOML parser/preserving editor, detect duplicates, and require explicit consent because trusted project config may launch local commands.

Avoid:

- Writing bearer/static secret values to project config.
- Setting `required = true` automatically.
- Setting blanket `default_tools_approval_mode = "approve"` for mutating F-Mark tools before the tool set and approval UX are tested.

## Bearer/Header Handling

- CLI supports `--bearer-token-env-var <ENV_VAR>` for streamable HTTP only.
- Direct TOML supports `bearer_token_env_var`, `http_headers`, and `env_http_headers`.
- `bearer_token_env_var` causes Codex to send `Authorization: Bearer <value>`.
- `env_http_headers` maps a header name to an env var whose value becomes the full header value; useful for custom auth, but the env var must exist in the Codex runtime environment.
- `http_headers` stores plaintext static values. Treat as non-secret only.
- The local `codex mcp add --help` does not expose a generic `--header` flag, so custom headers require direct TOML.

## Manual Smoke Steps

Stdio:

1. Ensure the future command works from this repo: `F_MARK_PATH=/home/roey/workspace/F-Mark npx -y f-mark mcp`.
2. Install: `codex mcp add f-mark --env F_MARK_PATH=/home/roey/workspace/F-Mark -- npx -y f-mark mcp`.
3. Verify config: `codex mcp get f-mark --json`.
4. Start a fresh Codex session in `/home/roey/workspace/F-Mark`.
5. Run `/mcp` in the TUI and confirm `f-mark` is connected and tools are listed.
6. Ask Codex to call a read-only F-Mark tool, then a low-risk write like posting prose to a test session.
7. Remove the global smoke entry when done: `codex mcp remove f-mark`.

HTTP:

1. Start the F-Mark kernel with a real Streamable HTTP MCP endpoint at `http://localhost:7777/mcp`.
2. For auth smoke, export the token in the same shell/tmux environment that launches Codex: `export F_MARK_TOKEN=...`.
3. Install: `codex mcp add f-mark --url http://localhost:7777/mcp --bearer-token-env-var F_MARK_TOKEN`.
4. Start a fresh Codex session, run `/mcp`, and confirm connection.
5. Check F-Mark logs for MCP `initialize`, `tools/list`, and tool-call requests; verify auth failure when `F_MARK_TOKEN` is absent or wrong.

## Open Risks

- Codex MCP behavior is moving quickly; re-check docs and `codex --version` before implementation.
- Official docs support project `.codex/config.toml`, but `codex mcp add/remove` currently edits global `$CODEX_HOME/config.toml` only.
- Project config depends on Codex trust state; F-Mark can infer from user config but cannot guarantee what a running Codex session loaded.
- HTTP is viable only after F-Mark implements MCP Streamable HTTP correctly; existing REST routes are not enough.
- Bearer env vars must reach the Codex process environment, especially for managed tmux spawns.
- Static `http_headers` can leak secrets through config and diagnostics; status UI must redact.
- Tool approval behavior needs real smoke testing with mutating F-Mark tools before auto-approval is recommended.
