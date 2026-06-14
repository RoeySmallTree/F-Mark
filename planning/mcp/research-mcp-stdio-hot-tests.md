# MCP Phase 4 Stdio Transport Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 4 only. Add the stable MCP SDK dependency and prove stdio transport/config behavior before implementing `f-mark mcp`.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| SDK stdio client against disposable echo fixture | PASS | `phase4_echo` listed and returned `F_MARK_PHASE4_ECHO:phase4-mplnvgli:sdk-probe` |
| Raw JSON-RPC harness against disposable echo fixture | PASS | stdout produced 3 parseable JSON-RPC lines only; diagnostics went to stderr |
| Claude project MCP config in isolated temp project/home | PASS | `claude mcp list` health check reported `phase4-fmark-echo ... Connected` |
| Codex MCP config in isolated temp `CODEX_HOME` | PASS | `codex mcp list --json` reported enabled stdio server |
| Gemini project MCP config in isolated temp project/home | PASS | `gemini mcp list` reported `phase4-fmark-echo ... Connected` |
| Cleanup | PASS | temp project/home/xdg removed; report retained |

Hot report:

```text
/tmp/fmark-mcp-phase4-hot-cCpPeT/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase4-mcp-stdio-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase4-hot-cCpPeT/report.json
{
  "run": "phase4-mplnvgli",
  "fixture": "/home/roey/workspace/F-Mark/packages/kernel/tests/mcp/fixtures/phase4-echo-server.mjs",
  "artifactRoot": "/tmp/fmark-mcp-phase4-hot-cCpPeT",
  "passes": 6,
  "vendors": [
    "claude",
    "codex",
    "gemini"
  ]
}
```

## Implementation Added For The Gate

- Added dependency `@modelcontextprotocol/sdk@1.29.0`.
- Added dependency `zod`.
- Added disposable stdio echo fixture at `packages/kernel/tests/mcp/fixtures/phase4-echo-server.mjs`.
- Added guarded hot runner at `packages/kernel/tests/hot/phase4-mcp-stdio-hot.mjs`.

The hot runner is not a normal unit test and exits unless `FMARK_HOT=1` is set.

## Vendor Config Shapes Observed

### Claude

Command:

```text
claude mcp add --scope project phase4-fmark-echo -- /home/roey/.local/share/mise/installs/node/24.15.0/bin/node /home/roey/workspace/F-Mark/packages/kernel/tests/mcp/fixtures/phase4-echo-server.mjs
claude mcp list
```

Observed config path:

```text
/tmp/fmark-mcp-phase4-hot-cCpPeT/project/.mcp.json
```

Observed list result:

```text
phase4-fmark-echo: .../node .../phase4-echo-server.mjs - Connected
```

### Codex

Command:

```text
codex mcp add phase4-fmark-echo -- /home/roey/.local/share/mise/installs/node/24.15.0/bin/node /home/roey/workspace/F-Mark/packages/kernel/tests/mcp/fixtures/phase4-echo-server.mjs
codex mcp list --json
```

Observed config path:

```text
/tmp/fmark-mcp-phase4-hot-cCpPeT/home/.codex/config.toml
```

Observed list result:

```text
"name": "phase4-fmark-echo"
"enabled": true
"transport": { "type": "stdio", ... }
```

Codex emitted a non-blocking warning because the isolated `CODEX_HOME` lived under `/tmp` and it refused to create helper binaries there. MCP add/list still passed and wrote only to the temp `CODEX_HOME`.

### Gemini

Command:

```text
gemini mcp add --scope project --transport stdio --trust phase4-fmark-echo /home/roey/.local/share/mise/installs/node/24.15.0/bin/node /home/roey/workspace/F-Mark/packages/kernel/tests/mcp/fixtures/phase4-echo-server.mjs
gemini mcp list
```

Observed config path:

```text
/tmp/fmark-mcp-phase4-hot-cCpPeT/project/.gemini/settings.json
```

Observed list result:

```text
phase4-fmark-echo: .../node .../phase4-echo-server.mjs (stdio) - Connected
```

Discrepancy found and fixed in the hot runner:

- First run added Gemini project MCP config but `gemini mcp list` reported the server disabled because the temp folder was untrusted.
- Fix: seed isolated `~/.gemini/trustedFolders.json` with the temp project path before running Gemini MCP commands.
- The final runner now fails if Gemini output contains `Disabled` or `untrusted`.

## Gate Decision

Phase 4 is complete for stdio transport and vendor config discovery/listing. `f-mark mcp` implementation can begin in Phase 5.

## 2026-05-26 Re-Gate

Re-ran the Phase 4 hot gate against the current working tree:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase4-mcp-stdio-hot.mjs
```

Result:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase4-hot-kCe5xQ/report.json
passes: 6
vendors: claude, codex, gemini
```

The rerun again passed SDK stdio list/call, raw JSON-RPC stdout purity, Claude isolated project add/list, Codex isolated `CODEX_HOME` add/list, Gemini trusted project add/list, and cleanup.
