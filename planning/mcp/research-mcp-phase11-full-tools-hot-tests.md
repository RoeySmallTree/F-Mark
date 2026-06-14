# MCP Phase 11 Full Tool Set Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 11 expanded stdio MCP tools/resources against a live kernel plus real vendor MCP discovery.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| SDK MCP full tool/resource matrix | PASS | 17 MCP tools listed and exercised against a real temp project/session |
| Real vendor MCP list checks | PASS | Claude, Codex, and Gemini listed the expanded `fmark` MCP server from isolated config homes |

Hot report:

```text
/tmp/fmark-mcp-phase11-hot-9aI78C/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase11-mcp-full-tools-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase11-hot-9aI78C/report.json
{
  "run": "phase11-mplqowhs",
  "artifactRoot": "/tmp/fmark-mcp-phase11-hot-9aI78C",
  "passes": 2
}
```

## Tool Matrix

The SDK hot runner listed and exercised:

- `fmark_list_sessions`
- `fmark_create_session`
- `fmark_list_participants`
- `fmark_register_agent`
- `fmark_link_agent`
- `fmark_read_events`
- `fmark_read_event`
- `fmark_get_todos`
- `fmark_post_prose`
- `fmark_post_todo`
- `fmark_post_tool_use`
- `fmark_post_choices`
- `fmark_post_choice`
- `fmark_post_flow`
- `fmark_post_html`
- `fmark_post_file_ref`
- `fmark_end_turn`

Resources read:

- `fmark://guide`
- `fmark://sessions`
- `fmark://participants`
- `fmark://events`
- `fmark://todos`

## Issue Found

The first run found a schema mismatch: `fmark_post_tool_use` made `tool_use_id`, `input`, and `success` optional while the live REST route requires them. The MCP schema was tightened and the runner now posts a required `tool_use_id`.

Failed report:

```text
/tmp/fmark-mcp-phase11-hot-It1rcT/report.failed.json
```

## Gate Decision

Phase 11 is complete for the existing collaboration write surface:

- MCP tools proxy through live kernel routes.
- The real event feed contained prose, todo, tool-use, choices, choice, flow, html, file, and turn-end events written through MCP.
- Real Claude/Codex/Gemini MCP list commands discovered the expanded server from isolated config.

This phase does not claim autonomous model use of every new tool; it verifies protocol/tool behavior through the SDK and real vendor MCP discovery. Phase 12 can build cursor/inbox/wake flows on this broader MCP surface.
