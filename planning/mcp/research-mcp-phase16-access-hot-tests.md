# Phase 16 Access Request Hot Tests

Date: 2026-05-25

Scope: end-to-end access request capture, UI response, live prompt delivery, and honest expiry for real Claude, Codex, and Gemini sessions. This evidence is from live CLIs and live F-Mark sessions, not unit tests.

## Commands

Build checks before the hot run:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
git diff --check
```

Live hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase16-access-requests-hot.mjs
```

Report:

```text
/tmp/fmark-mcp-phase16-hot-vj3J5G/report.json
```

Run id: `phase16-mpn1vnld`

Runtime versions:

| Runtime | Version |
|---|---|
| Claude Code | `2.1.128` |
| Codex CLI | `0.133.0` |
| Gemini CLI | `0.43.0` |

## Result Matrix

| Scenario | Runtime | Evidence |
|---|---|---|
| Hook install detects access hook | Claude | PASS, project `.claude/settings.json` detected `Stop` and `PermissionRequest`. |
| Hook install detects access hook | Codex | PASS, isolated `CODEX_HOME/hooks.json` detected `Stop`, `UserPromptSubmit`, and `PermissionRequest`. |
| Hook install detects access hook | Gemini | PASS, project `.gemini/settings.json` detected `Notification`. |
| Browser UI loaded real hot session | F-Mark renderer | PASS, production renderer loaded `2026-05-26-phase16-mpn1vnld-access`. |
| Approve from UI answers live prompt | Claude | PASS, `access-request` then `access-response`, delivery `hook`, pane showed allowed by `PermissionRequest` hook, marker file created. |
| Deny from UI answers live prompt | Claude | PASS, delivery `hook`, pane showed `Denied by F-Mark`, marker file not created. |
| Approve from UI answers live prompt | Codex | PASS, delivery `hook`, real Codex ran the `touch` command, marker file created. |
| Deny from UI answers live prompt | Codex | PASS, delivery `hook`, real Codex reported `Rejected("Denied by F-Mark")`, marker file not created. |
| Approve from UI answers live prompt | Gemini | PASS, delivery `terminal`, F-Mark sent Enter to the managed pane, Gemini ran the shell command, marker file created. |
| Deny from UI answers live prompt | Gemini | PASS, delivery `terminal`, F-Mark sent option `3` then Enter, Gemini cancelled the request, marker file not created. |
| Expiry without answer | Claude | PASS, short hook timeout wrote expired `access-response`; live Claude prompt remained answerable but card no longer claimed delivery. |
| Expiry without answer | Codex | PASS, short hook timeout wrote expired `access-response`; live Codex approval prompt remained visible and marker file was not created. |
| Expiry when terminal no longer answerable | Gemini | PASS, killed managed Gemini pane before approve; response was `expired`, `delivered:false`, `delivery:"none"`, marker file not created. |

## Issues Found And Fixed

- Gemini was still documented as manual-stream-only for hooks. Fixed hook install detection/instructions to use project `.gemini/settings.json` `Notification` hooks for `ToolPermission` cards.
- Codex `PermissionRequest` detection never counted the permission hook entry. Fixed detection and updated install instructions to the observed `hooks.json` path plus `[features] hooks = true`.
- Renderer event-kind maps did not know about `access-request` and `access-response`. Added labels/icons so right-log and accordion code compile with the new event kinds.
- Fresh Claude workspaces can show a trust prompt before the permission prompt. The hot runner now answers that real prompt before sending the access-triggering command.
- Claude Code can also ask a plain-language "do you want me to proceed" pre-tool confirmation before it emits the Bash `PermissionRequest`. The hot runner answers that pre-confirmation once, then still requires the real access-request card, hook response, and marker-file outcome.
- First-run Codex hook trust text says `Trust all and continue`; the runner now recognizes that wording.

## Notes

- Claude and Codex delivery used hook stdout responses from `PermissionRequest`.
- Gemini `Notification` hooks are observability-only, so live approve/deny delivery uses the managed tmux pane.
- The hot runner writes versioned local hook commands with `--fmark-hook-version managed-only-v1`, matching the production hook-update detector instead of using legacy `npx -y f-mark` commands.
