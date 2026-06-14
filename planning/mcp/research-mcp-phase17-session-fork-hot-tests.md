# Phase 17 Session Fork Backend Hot Tests

Date: 2026-05-25

Scope: F-Mark-owned session fork backend, copied session files, active-agent handoff, WebSocket updates, and MCP context after handoff. This evidence is from a live kernel, real session folders, real tmux-managed panes, and the MCP SDK client, not unit tests.

## Commands

Build sanity checks before the hot run:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
```

Live hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase17-session-fork-hot.mjs
```

Report:

```text
/tmp/fmark-mcp-phase17-hot-9RvA92/report.json
```

Run id: `phase17-mplur1zr`

## Result Matrix

| Scenario | Evidence |
|---|---|
| Managed-agent matrix | PASS. Spawned three real tmux capture panes attached to source session: live, paused, and killed/detached. |
| Source data coverage | PASS. MCP SDK wrote prose, todo, html bundle, flow, and file-reference events into the source session before fork. |
| Backend fork route | PASS. `POST /sessions/:id/fork` created a distinct fork id, copied 9 source tree entries, and returned rebound/skipped-paused/skipped-detached agent statuses. |
| WebSocket state | PASS. Live `/ws` received `session.forked` and `managed-agent.updated` for the rebound agent. |
| Copy integrity | PASS. Fork tree, excluding `.fork.json`, matched the source tree byte-for-byte; source tree stayed unchanged after fork. |
| Fork metadata | PASS. `.fork.json` had schema `fmark.session-fork.v1`, source session id, source path, fork time, requested name, copied head, and requested agent ids. |
| Agent handoff | PASS. Only the connected active agent moved to the fork; paused and detached agents remained on the source session. |
| Tmux prompt delivery | PASS. The live pane received the F-Mark fork handoff prompt with source and fork ids; the paused pane did not. |
| MCP context after handoff | PASS. `fmark_post_prose` without `session_id` used the rebound active-session pointer and wrote to the fork only, not the source. |
| All-session discovery | PASS. `GET /sessions?scope=all` returned both source and fork with path/path_id tags. |
| MCP fork tool | PASS. `fmark_fork_session` created a second no-relaunch fork and wrote fork metadata. |

## Issues Found And Fixed

- The backend fork route published `session.forked` but did not publish `managed-agent.updated` after rebinding an agent. Added a fork-specific managed-agent update broadcast and verified it over the live WebSocket.
- Added a guarded hot runner for Phase 17 so future fork backend changes can be checked against real session folders, real tmux state, and MCP SDK calls.

## Notes

- Phase 17 deliberately keeps F-Mark's folder-copy fork as the source of truth. Native Claude/Codex/Gemini branch or fork commands remain Phase 18 capability smoke work and are not enabled by this gate.
- The hot check proves stale `F_MARK_SESSION_ID` is not required after fork: MCP resolves the canonical active-session pointer for the agent before falling back to environment session ids.
