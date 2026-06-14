# MCP Phase 6 Guide Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 6 `/guide` MCP-first rewrite and `/guide-rest-variant`.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| `/guide?runtime_id=claude` | PASS | Contains `fmark_post_prose`, `fmark_end_turn`, `fmark_read_events`, `fmark://guide`; no REST/curl guidance |
| `/guide?runtime_id=codex` | PASS | Contains MCP-first Codex wording and tool names; no REST/curl guidance |
| `/guide?runtime_id=gemini` | PASS | Contains MCP-first Gemini wording and tool names; no REST/curl guidance |
| `/guide-rest-variant` | PASS | Keeps old HTTP reference with curl, endpoints, and bearer-token guidance |
| `fmark://guide` MCP resource | PASS | Returns the MCP-first guide with the active session and participant id |

Hot report:

```text
/tmp/fmark-mcp-phase6-hot-lVN8rg/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase6-guide-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase6-hot-lVN8rg/report.json
{
  "run": "phase6-mplpak53",
  "artifactRoot": "/tmp/fmark-mcp-phase6-hot-lVN8rg",
  "passes": 5
}
```

## Gate Decision

Phase 6 is complete:

- `/guide` is MCP-first.
- `/guide` tells agents to call `fmark_post_prose` first and `fmark_end_turn` after visible work.
- `/guide` does not include raw REST/curl instructions.
- `/guide-rest-variant` retains the old REST-oriented guide for debugging and custom integrations.
- `fmark://guide` returns the MCP-first guide.

Phase 7 can build integration preflight detection on top of this guide behavior.

## 2026-05-26 Re-Gate

The Phase 6 gate was rerun against the current working tree after the stale
route-test expectations were updated to assert the MCP-first `/guide` contract
and the REST-only `/guide-rest-variant` split.

Fresh hot report:

```text
/tmp/fmark-mcp-phase6-hot-9VYZig/report.json
```

Fresh commands:

```bash
pnpm -F f-mark exec vitest run tests/routes/guide.test.ts
FMARK_HOT=1 node packages/kernel/tests/hot/phase6-guide-hot.mjs
pnpm build
```

Observed:

- Route coverage passed: `tests/routes/guide.test.ts` reported 15 tests
  passed.
- Hot coverage passed: live `/guide` checks for Claude, Codex, Gemini,
  `/guide-rest-variant`, and `fmark://guide` reported 5 passes.
- Full monorepo build passed, including renderer build and kernel renderer
  bundling.
- Gibbs' read-only audit independently confirmed the backend/MCP behavior and
  found two stale renderer orientation snippets that still described `/guide`
  as a raw protocol/event-schema reference. Those snippets were changed to tell
  agents to fetch the MCP tool guide and use the provided `fmark` MCP tools
  instead of raw HTTP.

Gate remains accepted for Phase 6. The MCP-first behavior lives in `/guide`,
the REST protocol reference stays isolated behind `/guide-rest-variant`, and
user-facing setup copy no longer points agents toward the old REST mental model.
