# Phase 15 Mentions And Targeted Wake Hot Tests

Date: 2026-05-25

Scope: mention metadata, main composer targeting, comment targeting, paused/detached mention affordances, todo assignee wake routing, and real vendor MCP visibility for mention metadata.

## Result

PASS.

Hot report:

```bash
/tmp/fmark-mcp-phase15-hot-j7D14E/report.json
```

Command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase15-mentions-targeting-hot.mjs
```

Build sanity after the hot pass:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
git diff --check
```

## Covered Scenarios

The final hot run used one live F-Mark session:

```text
2026-05-25-phase15-mplsjuto-mentions
```

It spawned three managed tmux capture sessions using the vendor runtime ids:

```text
ag-p15-claude -> claude runtime id
ag-p15-codex  -> codex runtime id
ag-p15-gemini -> gemini runtime id
```

The production renderer was driven through headless Chrome against the live kernel.

Passing checks:

- No-mention main composer message woke all three live managed agents.
- Main composer `@Ben Codex` mention woke only `ag-p15-codex` and persisted mention metadata by participant id.
- Paused `ag-p15-codex` was disabled in the mention picker with a Resume affordance, and backend targeted wake skipped it as `paused`.
- Detached `ag-p15-gemini` was shown with a Reconnect affordance and reconnected from the mention picker.
- Line-comment composer woke the mentioned agent plus the commented-content author agent.
- Right-panel comment reply woke the mentioned agent plus the commented-content author agent.
- Todo creation assigned to `ag-p15-claude` woke only that assignee.
- Real Claude model session consumed mention metadata through MCP and wrote an ACK.
- Real Codex model session consumed mention metadata through MCP and wrote an ACK.
- Real Gemini model session consumed mention metadata through MCP and wrote an ACK.

## Issues Found And Fixed

- The hot harness originally created a session without activating the multipath project, so the production renderer correctly showed `no path / no session`. The runner now activates `/paths/active` and waits for the actual session slug before interacting.
- The mention picker kept stale status when it remained mounted and was reopened after a tmux pane died. `AgentMentionPicker` now refreshes whenever it is re-anchored/opened.
- The real-vendor hot agent ids initially exceeded the participant id contract. The runner now uses valid ids: `ag-rclaude`, `ag-rcodex`, and `ag-rgemini`.

## What This Proves

Phase 15 is complete for live behavior:

- Mention routing is participant-id based and rename-safe.
- Paused agents are not silently woken from mention targeting.
- Detached agents expose a reconnect path from the targeting UI.
- Comments target both explicit mentions and the commented-content author.
- Todos target assigned agents.
- Mention metadata is visible to Claude, Codex, and Gemini through MCP in real sessions.

This is hot-test evidence only. Unit tests were not used as proof for this gate.
