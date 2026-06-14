# Phase 18 Session Fork UI And Vendor Hot Tests

Date: 2026-05-25

Scope: production renderer fork UX, runtime fork capability flags, and real Claude/Codex/Gemini post-fork MCP behavior. This evidence is from live browser automation, live kernel routes, real tmux-managed panes, and real vendor model calls, not unit tests.

## Commands

Build sanity checks:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
git diff --check
```

Browser fork UI hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase18-session-fork-ui-hot.mjs
```

Browser report:

```text
/tmp/fmark-mcp-phase18-ui-hot-IazzdI/report.json
```

Browser run id: `phase18-mplvmuv1`

Vendor fork-context hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase18-session-fork-vendors-hot.mjs
```

Vendor report:

```text
/tmp/fmark-mcp-phase18-vendors-hot-SshQMl/report.json
```

Vendor run id: `phase18v-mplvjwfk`

Runtime versions:

| Runtime | Version |
|---|---|
| Claude Code | `2.1.128` |
| Codex CLI | `0.133.0` |
| Gemini CLI | `0.43.0` |

## Result Matrix

| Scenario | Evidence |
|---|---|
| Session row fork button | PASS. Production renderer opened fork popover from a non-active source row without selecting that row. |
| Row fork warnings | PASS. Row fork moved only the live agent; paused and detached agents stayed on source and warnings remained visible. |
| Row fork switch | PASS. UI switched to the fork, source prose copied into the fork, and the live agent chip appeared for the fork. |
| Composer fork button | PASS. Composer fork opened the same fork popover for the active session. |
| Composer draft preservation | PASS. Draft text remained in the compose textarea after switching to the composer-created fork. |
| Managed status refresh | PASS. Fork popover refreshed sessions, participants, and managed-agent status against the live route after fork. |
| Native capability smoke | PASS. Claude help exposes `--fork-session`; Codex help exposes `codex fork`; Gemini help exposes no `fork` command. |
| Native command gating | PASS. Runtime capability flags record native support for Claude/Codex but `verified:false`; Gemini remains unsupported. No native slash command path is enabled. |
| Real vendor pane rebind | PASS. Live tmux-managed Claude, Codex, and Gemini sessions were all rebound by `POST /sessions/:id/fork`. |
| Real Claude after fork | PASS. Claude model called MCP with stale source-session env; event landed in fork only. |
| Real Codex after fork | PASS. Codex model called MCP with stale source-session env; event landed in fork only. |
| Real Gemini after fork | PASS. Gemini model called MCP with stale source-session env; event landed in fork only. |

## Issues Found And Fixed

- The first browser hot run had a brittle CDP selector assertion for the agent chip. The fork had succeeded and the live API state was correct; the runner now uses a safer DOM predicate and richer CDP exception reporting.
- The store handled `managed-agent.updated` for the managed-agent list but did not update the participant `active_session`. Updated the store so top-bar chips move immediately after fork/spawn broadcasts.
- The first vendor hot run over-asserted `tmux capture-pane` echo for the submitted handoff text. Claude and Gemini TUIs can consume or redraw the submitted text without leaving it visible. The runner now records pane echo when visible, but gates on the stronger facts: route response, participant active-session state, and real model MCP writes landing in the fork only.

## Notes

- Native runtime fork commands are intentionally still disabled. The observed CLI support is not enough to enable `/branch` or `/fork` in managed panes without a dedicated slash-command smoke.
- Gemini has no native fork command in the observed CLI help; F-Mark-owned fork handoff remains the v1 path for Gemini.
- The vendor run deliberately passed stale `F_MARK_SESSION_ID=<source>` to MCP config. Claude, Codex, and Gemini all wrote to the fork because MCP context resolved the canonical active-session pointer first.
