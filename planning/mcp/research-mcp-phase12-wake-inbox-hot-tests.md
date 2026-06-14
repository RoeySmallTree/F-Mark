# MCP Phase 12 Wake And Inbox Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 12 cursor-backed inbox, wake packet delivery, targeted wake routing, dead-pane skip behavior, and real vendor MCP inbox use.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Real tmux wake packet and MCP inbox cursor flow | PASS | Two managed tmux panes received bounded wake packets; `fmark_get_inbox` advanced cursor; second inbox read was empty |
| Claude real model MCP inbox cursor | PASS | Claude called the MCP inbox flow, wrote the expected ACK, and left the marker consumed |
| Codex real model MCP inbox cursor | PASS | Codex called the MCP inbox flow, wrote the expected ACK, and left the marker consumed |
| Gemini real model MCP inbox cursor | PASS | Gemini called the MCP inbox flow, wrote the expected ACK, and left the marker consumed |

Hot report:

```text
/tmp/fmark-mcp-phase12-hot-7W7hPc/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase12-wake-inbox-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase12-hot-7W7hPc/report.json
{
  "run": "phase12-mplr5d80",
  "artifactRoot": "/tmp/fmark-mcp-phase12-hot-7W7hPc",
  "passes": 4
}
```

## Live Session Evidence

Session:

```text
2026-05-25-phase12-mplr5d80-wake
```

Managed pane agents:

- `ag-p12-a` in tmux session `fmark-project-fbe3eace-ag-ag-p12-a`
- `ag-p12-b` in tmux session `fmark-project-fbe3eace-ag-ag-p12-b`

The harness posted a user prose marker, called `POST /sessions/:id/wake`, and verified both capture panes contained:

- `# F-Mark wake packet`
- `fmark_get_inbox`
- the user prose marker
- the user prose event filename

The harness then called `fmark_get_inbox` through the MCP SDK for `ag-p12-a` and verified:

- first call returned the user event and advanced `cursor_after`,
- second call returned an empty `events` array,
- `fmark://inbox` resolved for the active participant/session.

It also called `fmark_mark_seen` through MCP for `ag-p12-b` and verified the following inbox read was empty.

## Routing Cases

The same live run verified targeted and skip behavior:

- Targeted wake with `target_participant_ids: ["ag-p12-a", "bad-target", "ag-p12-z"]` notified only `ag-p12-a`.
- Invalid target was reported as `invalid-target`.
- Valid but unmanaged target was reported as `not-managed`.
- `ag-p12-b` did not receive the targeted wake packet.
- After killing `ag-p12-b`'s tmux pane directly, a no-target wake still notified live `ag-p12-a` and reported `ag-p12-b` as `pane-dead`.

## Vendor Model Checks

For each vendor, the harness registered and linked a real participant in the same live session, posted a unique user prose marker, configured the local stdio MCP server, and prompted the vendor model to:

1. call `fmark_get_inbox`,
2. write a vendor-specific ACK with `fmark_post_prose` only if the inbox contained the marker,
3. call `fmark_end_turn`.

After the vendor run, the harness queried that participant's inbox through the live kernel and verified the original marker was no longer unread.

Participants:

- Claude: `ag-p12-claude`
- Codex: `ag-p12-codex`
- Gemini: `ag-p12-gemini`

## Build Sanity

Before the final hot run:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer exec tsc -b --pretty false
```

All passed. These are sanity checks only; the gate evidence is the hot run above.

## Gate Decision

Phase 12 is complete for cursor-backed inbox and wake delivery:

- Cursor state is stored through `AgentStateStore`.
- `fmark_get_inbox` marks returned items seen automatically.
- `fmark_mark_seen` advances a participant cursor explicitly.
- `POST /sessions/:id/wake` delivers bounded wake packets to active live managed panes.
- Explicit wake targets, invalid targets, unmanaged targets, and dead panes were hot-tested.
- Claude, Codex, and Gemini each consumed inbox state through the MCP tool in a real session.

Paused-agent filtering and mention metadata are not claimed here because durable paused state and mention schemas are later phases. Phase 12 provides the tested backend route shape that those phases will consume.
