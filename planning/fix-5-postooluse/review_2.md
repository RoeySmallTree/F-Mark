# Fix #5 PostToolUse Review 2

## Review #1 Finding Status

1. **Suppressed `PostToolUse` fall-through: fixed.** `runAutoStream` now has an explicit `hook_event_name === "PostToolUse"` branch that returns after optionally posting the live tool-use event, so suppressed/malformed PostToolUse payloads cannot reach Stop-time transcript projection (`packages/kernel/src/hooks/autoStream.ts:1054-1078`). The new suppressed-PostToolUse-with-`transcript_path` test covers the regression (`packages/kernel/tests/hooks/autoStream.test.ts:162-190`).

2. **Phase16 hot fixture missing `PostToolUse`: fixed.** The v2 Claude settings fixture now includes `PostToolUse` alongside `Stop` and `PermissionRequest` (`packages/kernel/tests/hot/phase16-access-requests-hot.mjs:230-255`).

3. **No live-to-Stop dedup integration test: fixed.** The new test pre-writes an existing `tool-use` event, runs a Stop hook over a transcript with the same `tool_use_id`, and asserts the duplicate Stop-time tool-use is skipped while prose and turn-end still post (`packages/kernel/tests/hooks/autoStream.test.ts:193-270`). The implementation scans existing tool-use ids and drops matching Stop projections (`packages/kernel/src/hooks/autoStream.ts:836-884`).

4. **Shallow `success` inference: fixed.** `toolUseIsSuccessful` now handles non-empty errors, `is_error`, `isError`, and failed/error/cancelled status or outcome values on the response object (`packages/kernel/src/hooks/autoStream.ts:681-710`). The added extractor tests cover status failure, camel-case `isError`, `error: null`, `tool_call_id`, `input`, and missing input/result fallback (`packages/kernel/tests/hooks/autoStream.test.ts:748-853`).

## New Findings

No new correctness issues found in the inspected changes. The fix is in good shape. The remaining dedup race noted in review #1 is still best-effort by design, but the new code does not make it worse.
