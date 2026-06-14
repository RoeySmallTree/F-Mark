# Phase 21 Stream/MCP Dedupe Hot Tests

Date: 2026-05-26

Scope: hybrid MCP plus hook behavior when a model writes a deliberate final answer through MCP and the hook later sees the same final transcript text. Evidence is from a live kernel, real MCP stdio SDK tool calls, and the actual `f-mark hook auto-stream` CLI.

## Commands

Build sanity checks:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer build
```

Hybrid dedupe hot run:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase21-hybrid-dedupe-hot.mjs
```

Report:

```text
/tmp/fmark-mcp-phase21-hot-P3VZdQ/report.json
```

Run id: `phase21-mplxhfir`

## Result Matrix

| Scenario | Evidence |
|---|---|
| MCP source markers | PASS. `fmark_post_prose` writes `source: "mcp"` and `fmark_end_turn` writes `source: "mcp"`. |
| Matching hook final | PASS. Hook transcript final prose identical to the latest MCP final prose is skipped. |
| Turn-end dedupe | PASS. Because the duplicate hook final is skipped, the hook does not add a second turn-end. |
| Tool-use preservation | PASS. The same hook transcript still captured the `Read` tool-use result. |
| Different hook final | PASS. A hook final answer with different content is still captured with `source: "hook"`. |

## Issues Found And Fixed

- Prose and turn-end events did not carry a durable source marker. Added `source: "mcp" | "hook" | "manual"` to prose frontmatter and turn-end JSON.
- MCP tools now mark deliberate prose and turn-end writes as `source: "mcp"`.
- Hook projection now marks captured prose and hook-emitted turn-end as `source: "hook"`.
- Hook dedupe is intentionally narrow: it only suppresses a non-arbitrary final prose event when the latest meaningful event for that same participant is an MCP prose event with identical normalized text, optionally followed by turn-end.

## Notes

- Arbitrary prose, tool-use, sub-agent events, and different final prose are not deduped.
- This phase did not introduce HTTP MCP; it only hardens stdio MCP plus hook coexistence.
