# Phase 24 Final Manual Verification Closure

Date: 2026-05-26

Purpose: map the final manual checklist to current-artifact evidence after the v3 repairs. Every item below is backed by a focused test, hot report, aggregate matrix entry, or an explicit accepted vendor limitation.

## Current Artifact Gates

- Build: `pnpm build` PASS.
- Kernel tests: `pnpm -F f-mark test` PASS, 89 files / 604 tests.
- Renderer tests: `pnpm -F @f-mark/renderer test` PASS, 53 files / 550 tests.
- Full all-feature hot matrix: `/tmp/fmark-full-hot-AavpWQ/matrix.json`, 23/23 gates PASS.
- v3 regression hot flow: `/tmp/fmark-manual-v3-hot-UUujP2/report.json`, 8 checks PASS.
- Aggregate vendor matrix: `/tmp/fmark-mcp-phase23-hot-9X63bS/report.json`, all 8 legs PASS.

## Supplementary Phase 24 Hot Sweep

These hot gates were rerun after the aggregate matrix to cover checklist areas that the aggregate matrix only partially covers:

- Guide and REST variant: `/tmp/fmark-mcp-phase6-hot-WuVbsT/report.json`, 5 checks PASS.
- Integration setup UI: `/tmp/fmark-mcp-phase10-hot-xIDB7J/report.json`, 3 checks PASS.
- Full MCP tools: `/tmp/fmark-mcp-phase11-hot-sYUHuD/report.json`, 2 checks PASS.
- Agent controls backend: `/tmp/fmark-mcp-phase13-hot-otO3VI/report.json`, 4 checks PASS.
- Agents right-pane UI: `/tmp/fmark-mcp-phase14-hot-CvFP0u/report.json`, 1 check PASS.
- Mentions and targeted wakes UI: `/tmp/fmark-mcp-phase15-hot-PHLrWk/report.json`, 11 checks PASS.
- Fork UI: `/tmp/fmark-mcp-phase18-ui-hot-qVw6KV/report.json`, 2 checks PASS.
- Hybrid MCP/hook dedupe: `/tmp/fmark-mcp-phase21-hot-nJeM0H/report.json`, PASS.
- Streamable HTTP MCP: `/tmp/fmark-mcp-phase22-hot-uClvM9/report.json`, PASS.

## Issues Found And Resolved During This Phase

1. Phase 13/14/15 capture runtimes only read stdin, but current managed launches deliver launch prompts through native argv. The runners now record argv and assert the `<!-- fmark:launch-prompt:v1 -->` marker plus onboarding/session content.
2. Phase 15 reconnect restarted the same fake runtime participant and the argv capture truncated the existing file. The capture runners now append launch argv, preserving prior wake counts across reconnect.
3. Claude Code sometimes asks a plain-language pre-tool confirmation before issuing the Bash `PermissionRequest`. The Phase 16 hot runner now answers that pre-confirmation once, then still requires the real access-request card, hook response, and marker-file result before passing.

Resolved files:
- `packages/kernel/tests/hot/phase13-agent-controls-hot.mjs`
- `packages/kernel/tests/hot/phase14-agents-ui-hot.mjs`
- `packages/kernel/tests/hot/phase15-mentions-targeting-hot.mjs`
- `packages/kernel/tests/hot/phase16-access-requests-hot.mjs`

## Checklist Evidence Map

Setup:
- Kernel auth, renderer load, runtime versions, and MCP stdio availability: aggregate `/tmp/fmark-mcp-phase23-hot-9X63bS/report.json`; setup UI `/tmp/fmark-mcp-phase10-hot-xIDB7J/report.json`; stdio/tools `/tmp/fmark-mcp-phase11-hot-sYUHuD/report.json`.

Integration setup:
- Missing/stale/blocked detection, local/global paths, install/update behavior, invalid-config preservation, no bearer token in config, and Claude/Codex/Gemini setup coverage: phase8 `/tmp/fmark-mcp-phase8-hot-JgYv5A/report.json`; phase10 `/tmp/fmark-mcp-phase10-hot-xIDB7J/report.json`.

First launch:
- Randomized display/native naming, MCP-only guide in launch prompt, participant/session ids, MCP hello, end turn, and single event appearance: phase9 `/tmp/fmark-mcp-phase9-hot-kiIhVy/report.json`; phase5 `/tmp/fmark-mcp-phase5-hot-MgCG6K/report.json`; v3 launch marker suppression `/tmp/fmark-manual-v3-hot-UUujP2/report.json`; guide `/tmp/fmark-mcp-phase6-hot-WuVbsT/report.json`.

MCP tools:
- Read/write event surface, todos, choices, flow, html, file metadata, resources, and negative cases: phase11 `/tmp/fmark-mcp-phase11-hot-sYUHuD/report.json`. Real vendor MCP hello remains covered by phase5 `/tmp/fmark-mcp-phase5-hot-MgCG6K/report.json`.

Hook/hybrid behavior:
- Tool/access hook capture, permission/access cards, and live prompt responses: phase16 `/tmp/fmark-mcp-phase16-hot-vj3J5G/report.json`.
- MCP/hook final dedupe and distinct final preservation: phase21 `/tmp/fmark-mcp-phase21-hot-nJeM0H/report.json`.
- Non-managed hook gating and launch-packet suppression: v3 `/tmp/fmark-manual-v3-hot-UUujP2/report.json`.

Agents tab:
- Right-pane Agents tab, row state, pause/resume, rename, reconnect, terminal overlay, compact/clear, context/access unsupported state: phase14 `/tmp/fmark-mcp-phase14-hot-CvFP0u/report.json`; phase13 `/tmp/fmark-mcp-phase13-hot-otO3VI/report.json`.
- Context remains `Unknown` unless a runtime exposes a verified source; this is the accepted Phase 13 limitation.

Targeting:
- No-mention wake-all, `@Agent` targeting, paused Resume affordance, detached Reconnect affordance, comments waking mentioned agents plus author, todo assignee wakes, and participant-id mention durability: phase15 `/tmp/fmark-mcp-phase15-hot-PHLrWk/report.json`.

Access:
- Runtime permission cards, access-pending state, approve/deny response delivery, disconnected expiry: phase16 `/tmp/fmark-mcp-phase16-hot-vj3J5G/report.json`.

Session fork:
- Backend copy/rebind/post-fork MCP writes: phase17 `/tmp/fmark-mcp-phase17-hot-DXNL4S/report.json`.
- Session-row and composer fork UI, row selection guard, draft preservation: phase18 UI `/tmp/fmark-mcp-phase18-ui-hot-qVw6KV/report.json`.
- Real vendor post-fork writes and F-Mark-owned fork handoff: phase18 vendor `/tmp/fmark-mcp-phase18-vendors-hot-48P7cm/report.json`.
- Native Claude/Codex fork commands remain disabled unless a future managed-pane slash smoke verifies them. Gemini remains F-Mark-only.

Sub-agents:
- Real Claude/Codex/Gemini delegated-agent capture: phase19 `/tmp/fmark-mcp-phase19-vendors-hot-jYhwYb/report.json`.
- Nested UI boxes and final-result rendering: phase20 `/tmp/fmark-mcp-phase20-ui-hot-9mlopq/report.json`.
- Progressive output is shown only for runtimes with verified capability; unattributable output remains parent arbitrary output.

Existing behavior:
- REST routes and hook install/status/apply compatibility: full kernel tests plus phase6/8/16.
- Terminal overlay and command menu: full renderer tests plus phase14.
- Manual non-MCP flow: `/guide-rest-variant` verified by phase6.
- Streamable HTTP MCP: phase22 `/tmp/fmark-mcp-phase22-hot-uClvM9/report.json`.

## Remaining Accepted Limitations

- Runtime context usage remains `Unknown` unless a vendor exposes a verified source.
- Claude/Codex native fork slash commands are not enabled because managed-pane command smoke remains unverified; F-Mark-owned fork is verified.
- Gemini has no native fork command in the observed CLI and uses F-Mark-only handoff.

## Closure

No unresolved product bug remains from the v3 findings or the Phase 24 full all-feature hot sweep.
