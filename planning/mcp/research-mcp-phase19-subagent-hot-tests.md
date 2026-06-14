# Phase 19 Sub-Agent Capture Hot Tests

Date: 2026-05-26

Scope: sub-agent event contracts, backend capture/projection, search indexing, renderer display, and real Claude/Codex/Gemini final-result capture. Evidence below is from live kernel hot runners and real vendor model sessions, not unit tests.

## Commands

Build sanity checks:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
git diff --check
```

Backend/projection hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase19-subagent-backend-hot.mjs
```

Backend report:

```text
/tmp/fmark-mcp-phase19-hot-P2Duv8/report.json
```

Backend run id: `phase19-mplxiig6`

Real vendor sub-agent hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase19-subagent-vendors-hot.mjs
```

Vendor report:

```text
/tmp/fmark-mcp-phase19-vendors-hot-N7oWG5/report.json
```

Vendor run id: `phase19v-mplx00mq`

Runtime versions:

| Runtime | Version |
|---|---|
| Claude Code | `2.1.128` |
| Codex CLI | `0.133.0` |
| Gemini CLI | `0.43.0` |

## Result Matrix

| Scenario | Evidence |
|---|---|
| Claude transcript projection | PASS. `Agent` transcript blocks produced `subagent-run` and `subagent-output` with medium transcript confidence. |
| Claude real hook | PASS. Real Claude Code used the `Agent` tool; `PostToolUse` produced high-confidence sub-agent run/output. |
| Gemini transcript projection | PASS. `invoke_agent` transcript blocks produced attributed sub-agent run/output. |
| Gemini real hook | PASS. Real Gemini CLI `@generalist` invoked `invoke_agent`; `AfterTool` produced high-confidence run/output with clean final result text. |
| Codex persisted transcript | PASS. Codex `multi_agent_v1.spawn_agent`/`wait_agent` rollout JSONL projected to final run/output. |
| Codex exec stream | PASS. Real-shaped `codex exec --json` `collab_tool_call` spawn/wait events projected to final run/output. |
| Codex real session | PASS. Real Codex spawned a child agent and returned the marker. Native sub-agent hook events were not observed in `codex exec`; F-Mark captured the real exec JSON stream through transcript projection with medium confidence. |
| Structured Codex hook payloads | PASS. Synthetic-but-live-kernel `SubagentStart`/`SubagentStop` hook payloads produced high-confidence start/completed/output events. |
| Unattributable tools | PASS. A generic `Read` tool result stayed as `tool-use` and was not promoted to sub-agent events. |
| Search | PASS. All-session search indexed sub-agent output with session and path tags. |

## Issues Found And Fixed

- Codex real sessions did spawn child agents, but `codex exec` did not emit native `SubagentStart`/`SubagentStop` hooks. Added Codex transcript projection for both persisted rollout JSONL and live `codex exec --json` `collab_tool_call` streams, and the vendor runner records `nativeHookObserved:false` honestly.
- The first Codex projector only understood persisted `response_item/function_call` JSONL. The real exec stream used top-level `item.completed` records. Added the second parser shape and a backend hot case using that exact stream form.
- The Gemini isolated home was pointed at `.gemini` instead of the home root. Gemini appends `.gemini` itself when `GEMINI_CLI_HOME` is set, so the runner now uses the temp home root and picks up OAuth/settings correctly.
- Gemini `AfterTool` returned a wrapped sub-agent status string with embedded JSON. The extractor now stores the final `response` text when Gemini provides one through `returnDisplay.result` or a `Result: { ... }` wrapper.

## Notes

- Phase 19 captures final sub-agent results only. Progressive sub-agent streaming remains disabled.
- Real Codex native sub-agent hook support remains unverified for `codex exec` in `0.133.0`; the verified Codex path is transcript projection from real multi-agent output.
- The final vendor run wrote exactly three `subagent-run` and three `subagent-output` events in one live F-Mark session, one runtime each for Claude, Codex, and Gemini.
