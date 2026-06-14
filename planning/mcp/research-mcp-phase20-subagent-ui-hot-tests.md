# Phase 20 Sub-Agent UI Hot Tests

Date: 2026-05-26

Scope: production renderer grouping and presentation for `subagent-run` and `subagent-output` events. Evidence is from a live kernel plus headless Chrome running the built renderer. The real-runtime UI fixture reused the Phase 19 real vendor project containing actual Claude/Codex/Gemini sub-agent events.

## Commands

Build sanity checks:

```bash
pnpm -F @f-mark/renderer build
```

Browser UI hot run:

```bash
FMARK_HOT=1 \
FMARK_PHASE20_REAL_PROJECT=/tmp/fmark-mcp-phase19-vendors-hot-N7oWG5/project \
node packages/kernel/tests/hot/phase20-subagent-ui-hot.mjs
```

Report:

```text
/tmp/fmark-mcp-phase20-ui-hot-oalnZM/report.json
```

Run id: `phase20-mplxipsz`

## Result Matrix

| Scenario | Evidence |
|---|---|
| Fixture grouping | PASS. `subagent-run` and `subagent-output` are projected as mid-turn work in the parent participant's arbitrary group. |
| Completed collapse | PASS. Completed sub-agent boxes are collapsed once the parent turn is concluded. |
| Failed visibility | PASS. Failed sub-agent boxes keep the parent group open and the failed sub-agent box expanded. |
| Conversation view | PASS. Conversation view keeps sub-agent events and applies the same grouping path. |
| Real vendor UI fixture | PASS. Built renderer opened the real Phase 19 vendor project and rendered three nested sub-agent boxes from actual Claude, Codex, and Gemini records. |

## Issues Found And Fixed

- The conversation feed slice was dropping sub-agent events. It now includes `subagent-run` and `subagent-output`.
- Feed projection only ran in Everything view. It now runs for Everything and Conversation so sub-agent child work remains attached to parent turns.
- The arbitrary group model did not count sub-agents or keep failed child work visible. It now tracks sub-agent count and failed/cancelled child status.

## Notes

- Standalone `EventCard` fallback remains for orphaned or non-grouped sub-agent events.
- Phase 20 does not enable progressive streaming; it renders the final-result event model delivered by Phase 19.
