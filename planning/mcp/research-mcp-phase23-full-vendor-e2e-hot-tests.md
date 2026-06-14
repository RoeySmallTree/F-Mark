# Phase 23 Full Vendor E2E Matrix Hot Tests

Date: 2026-05-26

Final aggregate report:

```text
/tmp/fmark-mcp-phase23-hot-9X63bS/report.json
```

Run id: `phase23-mpn21gyn`

Full all-feature matrix wrapper:

```text
/tmp/fmark-full-hot-AavpWQ/matrix.json
```

## Matrix Coverage

Phase 23 reran the current code through real-vendor hot legs instead of relying on unit tests or stale evidence. The aggregate report references these live subreports:

- Install/apply scopes: `/tmp/fmark-mcp-phase8-hot-0OHEX1/report.json`
- Managed launch and desired-name storage: `/tmp/fmark-mcp-phase9-hot-6CHEvT/report.json`
- Real MCP hello/write/end-turn: `/tmp/fmark-mcp-phase5-hot-8pkC2i/report.json`
- Compact/clear controls: `/tmp/fmark-mcp-phase13-hot-eoexFx/report.json`
- Access cards/hooks/terminal delivery: `/tmp/fmark-mcp-phase16-hot-GfnZ4O/report.json`
- Session fork handoff and vendor writes: `/tmp/fmark-mcp-phase18-vendors-hot-05AnCU/report.json`
- Real sub-agent capture: `/tmp/fmark-mcp-phase19-vendors-hot-gb93qt/report.json`
- Sub-agent final-result UI boxes from real vendor events: `/tmp/fmark-mcp-phase20-ui-hot-ccqXOb/report.json`
- Latest all-feature wrapper report paths are recorded in `/tmp/fmark-full-hot-AavpWQ/matrix.json`.

Vendor versions recorded in the latest live vendor legs:

- Claude: `2.1.128 (Claude Code)`
- Codex: `codex-cli 0.133.0`
- Gemini: `0.43.0`

## Result

All eight matrix legs passed. The aggregate matrix covers:

- Claude: install scopes, managed launch/name, MCP hello, compact/clear, PermissionRequest card, hook capture, session fork, sub-agent capture, and sub-agent UI box rendering.
- Codex: install scope behavior including unsupported project scope, managed launch/name, MCP hello, compact/clear, PermissionRequest card, hook capture, session fork, sub-agent capture, and sub-agent UI box rendering.
- Gemini: project/user install behavior, managed launch/name, MCP hello, `/compress` and `/clear`, access/trust notification card path, terminal delivery, F-Mark-owned session fork, `invoke_agent` sub-agent capture, and sub-agent UI box rendering.

## Findings And Fixes

First Phase 23 aggregate failure:

```text
/tmp/fmark-mcp-phase23-hot-JulN3A/report.failed.json
```

Finding: Claude was launched but the Phase 16 hot runner sometimes left the prompt in the interactive input box. The hot runner now pastes through a tmux buffer and sends a second submit key.

Standalone Phase 16 verification after that fix:

```text
/tmp/fmark-mcp-phase16-hot-odQn3H/report.json
```

Second finding: Gemini interprets hook `timeout` values as milliseconds. Product install output and the Gemini hot configs used `300`, which meant 300 ms and caused hook timeout warnings/flakes. Updated Gemini hook timeout values to `300000`.

Final Phase 23 rerun:

```text
/tmp/fmark-mcp-phase23-hot-8GEMrx/report.json
```

The final aggregate run passed after both fixes.

Final completion sweep:

```text
/tmp/fmark-mcp-phase23-hot-9X63bS/report.json
```

This rerun passed after a later Phase 16 hot-runner hardening for Claude's plain-language pre-tool confirmation prompt.
