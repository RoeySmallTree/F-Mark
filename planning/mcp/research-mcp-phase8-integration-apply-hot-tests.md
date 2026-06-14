# MCP Phase 8 Integration Apply Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 8 `POST /managed-agents/integration-apply` for safe stdio MCP install/update.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Claude project apply/list/reapply | PASS | `.mcp.json` written, `claude mcp list` saw `fmark` connected, second apply made no duplicate |
| Claude user apply/list/reapply | PASS | `~/.claude.json` top-level MCP written, `claude mcp list` saw `fmark` connected, second apply made no duplicate |
| Claude local apply/list/reapply | PASS | `~/.claude.json` project-local MCP written under `projects[projectRoot]`, `claude mcp list` saw `fmark` connected, second apply made no duplicate |
| Codex user apply/list/reapply | PASS | `CODEX_HOME/config.toml` written through `codex mcp add`, `codex mcp list --json` saw enabled `fmark`, second apply made no duplicate |
| Gemini project apply/list/reapply | PASS | `.gemini/settings.json` written with `trust:false`, `gemini mcp list` saw `fmark` connected, second apply made no duplicate |
| Gemini user apply/list/reapply | PASS | `~/.gemini/settings.json` written with `trust:false`, `gemini mcp list` saw `fmark` connected, second apply made no duplicate |
| Stale update cases | PASS | Claude project/local, Codex user, Gemini project/user updated old markers to `phase5-stdio-v1` |
| Blocked config cases | PASS | Claude project/local, Codex user, and Gemini project invalid configs returned HTTP 409 and stayed byte-identical |
| Codex project scope | PASS | HTTP 409; no ignored `.codex/config.toml` was created |

Hot report:

```text
/tmp/fmark-mcp-phase8-hot-5WBa7B/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase8-integration-apply-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase8-hot-5WBa7B/report.json
{
  "run": "phase8-mplpwhe4",
  "artifactRoot": "/tmp/fmark-mcp-phase8-hot-5WBa7B",
  "passes": 16
}
```

## Vendor Behaviors Verified

- Claude `--scope project` writes `.mcp.json`.
- Claude `--scope user` writes top-level `mcpServers` in `~/.claude.json`.
- Claude `--scope local` writes `~/.claude.json` under `projects[projectRoot].mcpServers`; Phase 7's detector was corrected to use this real shape.
- Codex CLI `0.133.0` `mcp add/list` uses `CODEX_HOME/config.toml`. A project `.codex/config.toml` MCP entry was not seen by `codex mcp list --json`, so Phase 8 marks Codex MCP project apply unsupported instead of writing ignored config.
- Gemini project/user settings both accept `trust:false`; `gemini mcp list` still reports the server connected in a trusted temp folder.

## Safety Checks

- Vendor MCP config entries carry `F_MARK_MCP_VERSION=phase5-stdio-v1`.
- Vendor MCP config entries do not contain the F-Mark bearer token.
- Reapplying does not duplicate the `fmark` entry.
- Invalid target config is not overwritten.
- Gemini apply forces `trust:false`; stale Gemini configs with `trust:true` are rewritten to `trust:false`.

## Gate Decision

Phase 8 is complete for stdio MCP apply/update:

- Shared apply contracts exist.
- The renderer has a typed `integrationApply` client method.
- The kernel exposes `POST /managed-agents/integration-apply`.
- Claude project/user/local, Codex user, and Gemini project/user scopes are hot-checked through real vendor list commands.
- Codex project MCP apply is explicitly unsupported for the observed CLI behavior, rather than silently writing a config the runtime ignores.

Phase 9 can build setup-first spawn sequencing on top of preflight/apply.
