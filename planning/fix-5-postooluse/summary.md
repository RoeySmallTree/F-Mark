# Fix #5 — Live tool-use via PostToolUse + dedup + version bump

## Intent

Live tool-use is invisible to F-Mark today: the autoStream hook only registers `Stop` and `PermissionRequest`, so tool calls (Read, Edit, Bash, etc.) only land in the session feed when the agent's turn ends. With Fix #3 silencing fmark MCP prompts, turns finish promptly — but the user still wants per-tool visibility *during* the turn so they can watch the agent work.

Add a `PostToolUse` Claude hook that streams a single `tool-use` event live for each tool call, and dedupe at Stop so the transcript-time projection doesn't replay the same calls.

## Strategy

Four coordinated changes:

1. **Version bump.** `FMARK_HOOK_INSTALL_VERSION` `managed-only-v1` → `managed-only-v2`. v1 installs show as "stale" in `detectClaudeHooks` until the user re-applies (idempotent).
2. **Install surface** (`packages/kernel/src/hooksInstall/claude.ts`):
   - `expectedClaudeEntries()` now returns three entries (Stop, PermissionRequest, PostToolUse).
   - `detectClaudeHooks` requires all three for `installed`.
   - `pruneLegacyClaudeHooks` accepts `PostToolUse` as a valid event.
   - `renderClaudeInstallSnippet` includes the PostToolUse block with no matcher (capture all tools; the auto-stream handler filters).
3. **Hook handler** (`packages/kernel/src/hooks/autoStream.ts`):
   - New exported `extractPostToolUseEvent(input)` returns one ProjectedEvent of kind `tool-use` per PostToolUse hook, or `null` when:
     - the hook isn't `PostToolUse`,
     - the tool is `agent`/`task` (handled by `extractSubagentHookEvents`),
     - the tool is `mcp__fmark__*` (the MCP server writes its own event, so live capture would duplicate),
     - `tool_name` or `tool_use_id` is missing.
   - `runAutoStream`'s assistant branch now routes PostToolUse events through this extractor before the Stop-time transcript path. The PostToolUse handler returns 0 without emitting a turn-end.
4. **Stop-time dedup**:
   - New `existingToolUseIds` reads the session feed once to gather already-recorded `tool_use_id`s.
   - `dedupeHookFinalProse` extended to drop tool-use events whose ids are already recorded. Lazy: only scans when the projected batch actually contains tool-use events; tolerates session-not-found errors (better to risk a single duplicate than drop everything).
5. **Doc-only cleanup** (`packages/kernel/src/hooks/transcript.ts`):
   - Replaced the cryptic `// Ignore other block types (thinking, etc.)` comment with an explicit rationale.

## Files changed

- `packages/kernel/src/hooksInstall/command.ts` — version bump.
- `packages/kernel/src/hooksInstall/claude.ts` — PostToolUse in expected, detect, prune, snippet.
- `packages/kernel/src/hooks/autoStream.ts` — `isFmarkMcpToolName`, `isClaudeSubagentToolName`, `toolUseIsSuccessful`, `extractPostToolUseEvent`, `existingToolUseIds`; dedup extension and run-loop wiring.
- `packages/kernel/src/hooks/transcript.ts` — rename comment.
- `packages/kernel/tests/hooksInstall/claude.test.ts` — fixtures updated; new "reports stale when PostToolUse missing" case.
- `packages/kernel/tests/hooks/autoStream.test.ts` — 6 unit tests for `extractPostToolUseEvent` + 2 integration tests through `runAutoStream` (PostToolUse posts a tool-use event; fmark MCP PostToolUse is suppressed).
- `packages/kernel/tests/hot/phase16-access-requests-hot.mjs` — bumped the embedded version string to `managed-only-v2`.

## Intentional non-goals

- Did NOT change `transcript.ts` to emit thinking blocks. Per the decision in the plan, thinking stays dropped; the comment was renamed for clarity.
- Did NOT add a `PreToolUse` hook. The Plan agent flagged it would duplicate the existing `PermissionRequest` UX without adding info; PostToolUse already gives the renderer the data it needs (success/failure + result).
- Did NOT change the Codex or Gemini hook install. Their hook registration is independent; PostToolUse adoption is Claude-specific.

## Open risks / known gaps

- The PostToolUse `matcher` is unset in the snippet → captures all tools. The handler filters fmark MCP tools by name; if Claude renames the prefix in the future, the filter would silently start producing duplicates. Worth a follow-up integration test that checks no duplicate `tool_use_id` ever lands in the feed end-to-end.
- The dedup fetches the session feed at every Stop. For very long turns with hundreds of tool calls, this is O(turn). Acceptable; the session feed is local files.
- The `success` heuristic in `toolUseIsSuccessful` is conservative: any `error` field or `is_error: true` on the response → false. If a tool's response shape doesn't match, we'd over-report success.

## Tests

`pnpm -F f-mark exec vitest run tests/hooks tests/hooksInstall tests/mcpInstall tests/mcp tests/compass tests/routes/guide.test.ts` → 138 passed (across 17 files).

## What I want reviewed

1. **Filter scope on PostToolUse.** Is `mcp__fmark__*` the right exclusion prefix? Any other tool families (e.g. `mcp__playwright__*` or other future fmark MCP servers) where we should similarly suppress live capture?
2. **Dedup correctness under interleaving.** If a PostToolUse hook posts a tool-use event AFTER the Stop hook fires but BEFORE the Stop hook's transcript read completes, the dedup might miss it. Realistic? Acceptable?
3. **`success` heuristic.** `toolUseIsSuccessful` checks `error`/`is_error` on both the top-level payload and the response object. Sufficient, or should we also inspect string responses for the well-known Claude error patterns?
4. **Version bump impact.** Will existing managed agents (running with v1 hooks) keep functioning? They should — Stop and PermissionRequest still work — they just don't get live tool-use streaming until the user re-applies.
5. **Test coverage for the dedup path itself.** I have unit tests for `extractPostToolUseEvent` and integration tests for the happy path, but no test that explicitly exercises the "PostToolUse already recorded → Stop dedups it" sequence. Worth adding.

## Disposition of review_1.md findings

1. **Suppressed PostToolUse falling through to Stop transcript (HIGH) → FIXED.** Wrapped the live-tool-use branch in an explicit `hook_event_name === "PostToolUse"` check. Any PostToolUse payload — whether captured, suppressed (fmark MCP), or malformed — now always `return 0` before the Stop transcript code runs. New test: suppressed PostToolUse with a `transcript_path` no longer fires prose/tool-use/turn-end.
2. **phase16 hot fixture missing PostToolUse (HIGH) → FIXED.** Added the `PostToolUse` block (using `genericHookCommand`) to the Claude settings fixture so the v2 version string and the hook entries are consistent. The `status.installed === true` assertion in the hot test now reflects a real v2 install.
3. **No live → Stop dedup integration test (MEDIUM) → FIXED.** New test pre-writes a `20260527T100000.000Z_ag-claude.tool-use.json` with `tool_use_id: "tu-dedup"`, then runs Stop with a transcript containing the same id. Asserts 0 `/events/tool-use` POSTs, 1 prose, 1 turn-end. Locks in the dedup contract end-to-end.
4. **Shallow `success` inference (LOW/MEDIUM) → FIXED.** `toolUseIsSuccessful` now checks `is_error`/`isError` (snake + camel), `nonEmptyError` for `error` (so `null`/`""` aren't false positives), `looksFailedStatus` for `status`/`outcome` matching `failed|error|cancelled|canceled`. 5 new tests: `status: "failed"`, `isError: true`, `error: null` (no failure), `tool_call_id` fallback, `input` fallback, missing input/result defaults.

`pnpm -F f-mark exec vitest run tests/hooks tests/hooksInstall tests/mcpInstall tests/mcp tests/compass tests/routes/guide.test.ts tests/reconcile.test.ts` → 152 passed (18 files).
