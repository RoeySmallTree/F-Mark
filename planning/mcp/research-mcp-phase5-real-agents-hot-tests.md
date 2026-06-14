# MCP Phase 5 Real-Agent Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 5 `f-mark mcp` stdio server with minimal tools and real vendor agent verification.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Live kernel + SDK MCP protocol | PASS | `fmark_post_prose`, `fmark_end_turn`, `fmark_read_events`, and `fmark://guide` worked against a real temp session |
| WebSocket broadcast from MCP writes | PASS | `event_added` observed for prose and turn-end written through MCP |
| Negative: no active session | PASS | MCP returned a clear no-active-session error |
| Negative: unknown participant | PASS | MCP returned `unknown participant` from the kernel write path |
| Negative: stale token | PASS | MCP returned an HTTP 401 failure from the kernel proxy path |
| Claude real agent | PASS | Claude called `fmark_post_prose` and `fmark_end_turn`; event files landed in its session |
| Codex real agent | PASS | Codex called `fmark_post_prose` and `fmark_end_turn`; event files landed in its session |
| Gemini real agent | PASS | Gemini called `fmark_post_prose` and `fmark_end_turn`; event files landed in its session |

Hot report:

```text
/tmp/fmark-mcp-phase5-hot-KWa8gZ/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase5-mcp-real-agents-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase5-hot-KWa8gZ/report.json
{
  "run": "phase5-mplp58br",
  "artifactRoot": "/tmp/fmark-mcp-phase5-hot-KWa8gZ",
  "project": "/tmp/fmark-mcp-phase5-hot-KWa8gZ/project",
  "passes": 8,
  "vendors": [
    "claude",
    "codex",
    "gemini"
  ]
}
```

## Event Evidence

Sessions and files from the passing report:

| Actor | Session | Files |
| --- | --- | --- |
| SDK harness | `2026-05-25-phase5-mplp58br-sdk` | `20260525T210633.415Z_ag-p5sdk.prose.md`, `20260525T210633.422Z_ag-p5sdk.turn-end.json` |
| Claude | `2026-05-25-phase5-mplp58br-claude` | `20260525T210642.639Z_ag-p5cld.prose.md`, `20260525T210642.656Z_ag-p5cld.turn-end.json` |
| Codex | `2026-05-25-phase5-mplp58br-codex` | `20260525T210653.771Z_ag-p5cxd.prose.md`, `20260525T210654.990Z_ag-p5cxd.turn-end.json` |
| Gemini | `2026-05-25-phase5-mplp58br-gemini` | `20260525T210707.970Z_ag-p5gem.prose.md`, `20260525T210707.982Z_ag-p5gem.turn-end.json` |

Markers verified in event payloads:

- `FMARK_phase5-mplp58br_SDK_POST_PROSE`
- `FMARK_phase5-mplp58br_CLAUDE_AGENT_MCP`
- `FMARK_phase5-mplp58br_CODEX_AGENT_MCP`
- `FMARK_phase5-mplp58br_GEMINI_AGENT_MCP`

## Issues Found And Fixed

### `f-mark mcp` exited immediately

First hot run failed with:

```text
MCP error -32000: Connection closed
```

Cause: the CLI dispatcher called `process.exit()` after `server.connect()` resolved. The stdio server needed to stay alive until stdin closed.

Fix: `runFmarkMcpStdio()` now waits for stdin close/end or process signal, then closes the MCP server.

### Codex hid `fmark_post_prose`

Codex exposed `fmark_read_events` and `fmark_end_turn`, but not `fmark_post_prose`.

Cause: the `lines` input used a tuple schema, which emitted JSON Schema array-form `items`. Codex's MCP/tool converter rejected or hid the tool.

Fix: `lines` now uses a fixed-length homogeneous integer array schema (`minItems: 2`, `maxItems: 2`, `items: integer`).

### Codex hot runner stdin stayed open

Codex CLI repeatedly printed:

```text
Reading additional input from stdin...
```

and produced no model/tool output in the scripted runner.

Cause: the runner used `execFile` without closing child stdin. Manual terminal runs had closed stdin and worked.

Fix: the hot runner now calls `child.stdin?.end()` immediately after spawning CLI commands.

## Gate Decision

Phase 5 is complete for minimal stdio MCP:

- `f-mark mcp` is a real CLI subcommand.
- Minimal tools exist: `fmark_read_events`, `fmark_post_prose`, `fmark_end_turn`.
- `fmark://guide` exists.
- Context resolution works from tool args, active agent state, legacy bridge, and env fallback.
- Mutating tools proxy through the running kernel HTTP API and preserve websocket/event behavior.
- Claude, Codex, and Gemini can each write real F-Mark events through MCP into real sessions.

Phase 6 can depend on `/guide` becoming MCP-first.

## 2026-05-26 Re-Gate

Re-ran the Phase 5 hot gate against the current working tree:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase5-mcp-real-agents-hot.mjs
```

Result:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase5-hot-1YJPVQ/report.json
passes: 8
vendors: claude, codex, gemini
```

The rerun passed live kernel startup, SDK MCP protocol/resource/write/websocket checks, negative no-active-session, unknown-participant and stale-token cases, and real Claude/Codex/Gemini `fmark_post_prose` plus `fmark_end_turn` writes.

Fresh event evidence:

| Actor | Session | Files |
| --- | --- | --- |
| SDK harness | `2026-05-26-phase5-mpmbhpbt-sdk` | `20260526T073207.345Z_ag-p5sdk.prose.md`, `20260526T073207.353Z_ag-p5sdk.turn-end.json` |
| Claude | `2026-05-26-phase5-mpmbhpbt-claude` | `20260526T073216.286Z_ag-p5cld.prose.md`, `20260526T073216.307Z_ag-p5cld.turn-end.json` |
| Codex | `2026-05-26-phase5-mpmbhpbt-codex` | `20260526T073226.928Z_ag-p5cxd.prose.md`, `20260526T073228.445Z_ag-p5cxd.turn-end.json` |
| Gemini | `2026-05-26-phase5-mpmbhpbt-gemini` | `20260526T073241.838Z_ag-p5gem.prose.md`, `20260526T073241.852Z_ag-p5gem.turn-end.json` |

Verification sanity:

```bash
pnpm -F f-mark exec vitest run tests/mcp/context.test.ts tests/mcp/tools.test.ts
pnpm -F f-mark build
git diff --check
```

The re-gate also closed the Phase 5 non-hot checklist item by adding focused tests for MCP context fallback order and the minimal tool schemas.
