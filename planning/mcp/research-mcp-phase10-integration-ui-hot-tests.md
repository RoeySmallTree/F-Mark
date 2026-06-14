# MCP Phase 10 Integration Setup UI Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 10 renderer setup-first runtime launch flow against a live kernel and headless Google Chrome.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Missing MCP opens setup and apply launches | PASS | Browser clicked the real `+` menu and Claude row; setup modal showed missing MCP, applied project MCP config, launched a capture runtime, and prompt capture contained MCP tool guidance |
| Installed MCP launches directly | PASS | A second Claude click launched without opening the setup modal |
| Blocked MCP opens modal without spawn | PASS | Invalid `.mcp.json` showed blocked status, disabled the primary action, and did not spawn a runtime |

Hot report:

```text
/tmp/fmark-mcp-phase10-hot-B2UAQD/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase10-integration-ui-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase10-hot-B2UAQD/report.json
{
  "run": "phase10-mplqgz9o",
  "artifactRoot": "/tmp/fmark-mcp-phase10-hot-B2UAQD",
  "passes": 3
}
```

## What Was Verified

- The production renderer bundle was served by the live kernel.
- Headless Google Chrome drove the actual UI through the top-bar `+` menu.
- The modal used live `POST /managed-agents/preflight` responses.
- `Apply and Launch` used live `POST /managed-agents/integration-apply` followed by live spawn.
- The applied Claude project MCP config carried a version marker and did not contain the bearer token.
- The launch prompt captured from the spawned runtime contained MCP tool names and no curl REST guidance.
- Installed preflight skipped the modal and launched directly.
- Blocked preflight kept the modal open, disabled launch/apply, and did not create a new capture file.
- No Phase 10 Chrome/kernel/capture processes remained after the run.

## Issue Found

The first browser harness attached to Chrome's extension background target instead of the page target, so it never saw the F-Mark UI. The runner now selects a DevTools target with `type === "page"` before driving the browser.

Failed harness report:

```text
/tmp/fmark-mcp-phase10-hot-on2U4w/report.failed.json
```

## Gate Decision

Phase 10 is complete:

- Runtime clicks now preflight before spawn.
- Missing/stale/blocked MCP states open the integration setup modal.
- The modal shows runtime, MCP, hook, location, path, and blocked reason state.
- Safe apply calls the Phase 8 backend route and then launches.
- Installed setup launches directly.
- The old automatic hook-only modal no longer appears after spawn.

Phase 11 can add the broader MCP tool/resource set.
