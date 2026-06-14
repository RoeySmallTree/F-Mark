# MCP Phase 14 Agents Right Pane UI Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 14 Agents right-pane UI against a live kernel and real managed tmux sessions.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Browser Agents tab controls | PASS | Headless Chrome drove pause/resume, rename, compact, clear, terminal overlay, reconnect, and goodbye/offline state |

Hot report:

```text
/tmp/fmark-mcp-phase14-hot-vpWbup/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase14-agents-ui-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase14-hot-vpWbup/report.json
{
  "run": "phase14-mplrsmck",
  "artifactRoot": "/tmp/fmark-mcp-phase14-hot-vpWbup",
  "passes": 1
}
```

## Browser Flow

The hot run used the production renderer build in headless Chrome against a live kernel. It created one real F-Mark session and two managed tmux capture agents:

```text
session: 2026-05-25-phase14-mplrsmck-ui
agents: ag-p14-a, ag-p14-b
tmux:
  fmark-project-784419e7-ag-ag-p14-a
  fmark-project-784419e7-ag-ag-p14-b
```

The browser verified:

- Agents tab appears in the right panel and lists both active agents.
- Pause changes the row to `paused`.
- Resume clears the paused state.
- Inline rename updates the visible display name to `Ada UI`.
- Compact sends `/compact` to the capture pane.
- Clear sends `/clear` to the capture pane.
- Terminal opens the real terminal overlay for the tmux session.
- Killing an agent pane externally changes the row to `detached` after refresh.
- Reconnect returns the row to `connected` and injects a wake packet.
- Goodbye clears managed state and the row becomes `offline`.

## Issues Found

The first run waited for the participant id in visible body text while the right panel was still on the Log tab. The agent chips existed, but the Agents row was not visible yet. The harness now clicks the Agents tab first.

The second run set a controlled React input by assigning `input.value` directly. React did not treat that as user input. The harness now uses the native input setter plus an `InputEvent`.

The third run expected Goodbye to remove the row. The status API intentionally keeps registered agents visible and marks them `offline` after managed state is cleared. The harness now verifies that state.

## Build Sanity

Before the hot run:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
```

All passed. These are sanity checks only; the gate evidence is the browser hot run above.

## Gate Decision

Phase 14 is complete for the Agents right pane:

- The right panel has an Agents tab backed by the Phase 13 API.
- Rows show connection/activity/paused state, runtime, access, and context.
- Controls call the real backend and refresh state after each action.
- The browser hot run proved the UI against live kernel state and real tmux-managed sessions.

The panel correctly displays context as `Unknown` because Phase 13 did not verify a live context source.
