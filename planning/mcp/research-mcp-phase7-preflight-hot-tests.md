# MCP Phase 7 Preflight Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 7 integration preflight detection for Claude, Codex, and Gemini without mutating vendor config.

## Result Summary

| Runtime | Missing | Installed | Stale | Blocked/Invalid |
| --- | --- | --- | --- | --- |
| Claude | PASS | PASS | PASS | PASS, `.mcp.json` left unchanged |
| Codex | PASS | PASS | PASS | PASS, `config.toml` left unchanged |
| Gemini | PASS | PASS | PASS | PASS, `.gemini/settings.json` left unchanged |

Hot report:

```text
/tmp/fmark-mcp-phase7-hot-l7E917/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase7-preflight-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase7-hot-l7E917/report.json
{
  "run": "phase7-mplph5ov",
  "artifactRoot": "/tmp/fmark-mcp-phase7-hot-l7E917",
  "passes": 12
}
```

## Matrix Covered

- Isolated vendor homes/config roots were used for all three runtimes.
- The live kernel route `POST /managed-agents/preflight` was called over HTTP with bearer auth.
- Missing MCP config produced `missing`.
- Current-version MCP config produced `installed`.
- Older version markers produced `stale`.
- Invalid JSON/TOML produced `blocked`.
- Blocked files were read before and after preflight; the bytes stayed identical.
- Runtime executable detection ran through the real local `claude`, `codex`, and `gemini` CLIs.

## Issue Found

The first run failed while checking Gemini's blocked config case:

```text
/tmp/fmark-mcp-phase7-hot-DSvktc/report.failed.json
```

Observed behavior: `gemini --version` reads project `.gemini/settings.json` and exits with a parse error when that file is invalid. This means a broken Gemini project config can make even runtime-version probing fail.

Fix: the hot runner now accepts `runtime.available === false` only for the blocked case, while still requiring runtime availability for missing, installed, and stale states. Production preflight keeps returning the blocked MCP status with the config path and reason instead of writing the invalid file.

## Gate Decision

Phase 7 is complete:

- Shared integration contracts exist.
- The renderer has a typed preflight client method.
- The kernel exposes detection-only `POST /managed-agents/preflight`.
- Claude, Codex, and Gemini preflight detection is hot-checked for missing, installed, stale, and blocked states.
- Detection does not mutate blocked vendor config.

Phase 8 can build safe apply/update behavior on top of this detection layer.
