# Fix #5 PostToolUse Review

## Findings

1. **High: skipped `PostToolUse` payloads fall through into Stop-time transcript projection.**
   `extractPostToolUseEvent` intentionally returns `null` for F-Mark MCP tools, missing ids, and non-generic subagent tools (`packages/kernel/src/hooks/autoStream.ts:710-718`). The subagent case is safe because `runAutoStream` handles it earlier and returns (`packages/kernel/src/hooks/autoStream.ts:1016-1033`), but the F-Mark MCP and malformed/unsupported `PostToolUse` cases continue past the live tool branch (`packages/kernel/src/hooks/autoStream.ts:1040-1056`) into the Stop transcript path (`packages/kernel/src/hooks/autoStream.ts:1058-1083`). With no `transcript_path`, this produces only a noisy stderr warning; with a real `transcript_path`, it can post prose/tool-use/turn-end during a `PostToolUse` hook. That violates the stated "PostToolUse handler returns 0 without emitting a turn-end" contract and can create early or duplicate Stop projections.

   Suggestion: after the subagent branch, dispatch explicitly on `hook_event_name === "PostToolUse"` and always return `0`; only call `postProjectedEvents` when `extractPostToolUseEvent` returns a real event. Add a regression test where `mcp__fmark__fmark_post_prose` includes a valid transcript path and assert no prose/tool-use/turn-end posts happen.

2. **High: the phase16 hot fixture is marked v2 but does not install the v2 Claude hook set.**
   `phase16-access-requests-hot.mjs` now writes `--fmark-hook-version managed-only-v2` (`packages/kernel/tests/hot/phase16-access-requests-hot.mjs:216-226`), but its Claude settings still contain only `Stop` and `PermissionRequest` (`packages/kernel/tests/hot/phase16-access-requests-hot.mjs:230-247`). `detectClaudeHooks` now requires `PostToolUse` as well (`packages/kernel/src/hooksInstall/claude.ts:92-113`), and the hot test asserts `status.installed === true` (`packages/kernel/tests/hot/phase16-access-requests-hot.mjs:966-1006`). As written, that hot test should report Claude as stale/missing rather than installed.

   Suggestion: add a `PostToolUse` block using `genericHookCommand` to the phase16 Claude fixture. The version bump is the right call only together with the new hook entry. If the intent is to simulate a v1/stale install, keep the old version string and change the assertion accordingly, but that does not match this hot test's installed-status check.

3. **Medium: there is still no end-to-end test for the actual live-then-Stop dedupe contract.**
   The new tests cover live `PostToolUse` posting (`packages/kernel/tests/hooks/autoStream.test.ts:105-134`), F-Mark MCP suppression (`packages/kernel/tests/hooks/autoStream.test.ts:136-164`), and extractor shapes (`packages/kernel/tests/hooks/autoStream.test.ts:555-655`). They do not cover the key sequence: `PostToolUse` posts `tool_use_id=X`, then `Stop` projects the same transcript tool call, and `dedupeHookFinalProse` drops only the duplicate tool-use while still allowing final prose/turn-end (`packages/kernel/src/hooks/autoStream.ts:837-881`).

   Suggestion: add an integration-style test against a real temp session/kernel, or prewrite a `.tool-use.json` event for the participant, then run the Stop hook with a transcript containing the same id. Assert exactly one tool-use event remains and the final prose/turn-end behavior is unchanged. This also catches the interleaving assumptions around `existingToolUseIds`.

4. **Low/medium: `success` inference is shallow for nested or status-shaped responses.**
   `toolUseIsSuccessful` only checks top-level `error`/`is_error` and the same two fields on the first response object (`packages/kernel/src/hooks/autoStream.ts:681-690`). A payload like `tool_response: { status: "failed", content: ... }`, `tool_response: { isError: true }`, or an array item with `is_error: true` will be marked successful. Conversely, `error: null` is treated as failure because the check is `!== undefined`. This matters because Stop-time projection uses Claude's transcript `is_error`, while the live event becomes the retained event once Stop dedupe drops the transcript duplicate.

   Suggestion: check common status spellings (`failed`, `error`, `cancelled`), camel-case `isError`, and only treat `error` as failure when it is non-null/non-empty. Add extractor tests for `tool_response.status: "failed"` and `error: null`.

## Requested Areas

### Correctness

`extractPostToolUseEvent` generally returns the right `tool-use` shape for the expected Claude payload:

- Requires `hook_event_name === "PostToolUse"` (`packages/kernel/src/hooks/autoStream.ts:709-710`).
- Requires a non-empty `tool_name` and `tool_use_id`/`tool_call_id` (`packages/kernel/src/hooks/autoStream.ts:711-718`).
- Uses `tool_input` first, then `input`, defaulting missing input to `{}` (`packages/kernel/src/hooks/autoStream.ts:719-727`).
- Uses `tool_response`, `tool_result`, `response`, then `result`, defaulting missing result to `null` (`packages/kernel/src/hooks/autoStream.ts:720-727`).

Missing `tool_input` is handled cleanly as `input: {}`. Nested response bodies are preserved raw, which is consistent with existing `tool-use` payloads, but success inference needs the deeper/status checks above. One small consistency note: subagent extraction flattens `input.parameters` (`packages/kernel/src/hooks/autoStream.ts:462-468`), while generic PostToolUse does not. That is acceptable if Claude generic tool inputs are always direct, but a shared helper would keep the two hook paths aligned.

### Dedup Correctness

The lazy `hasToolUse` gate is sound: `existingToolUseIds` is only called when the Stop-projected batch contains tool-use events (`packages/kernel/src/hooks/autoStream.ts:844-856`), so pure prose Stop paths avoid unnecessary feed scans and missing-session failures. The catch-all (`packages/kernel/src/hooks/autoStream.ts:857-861`) also matches the intended fail-open behavior: a duplicate is better than dropping the whole Stop batch.

The contract is still "best effort", not race-free. If the Stop hook reads existing ids before a live `PostToolUse` write lands on disk, Stop can post a duplicate. Claude should normally fire PostToolUse before Stop, so this is probably rare, but the durable fix is idempotence at the event-write boundary keyed by `(session, participant_id, tool_use_id)` or a final re-read immediately before posting Stop tool-use events. Also, the loop does not add kept Stop ids back into `seenToolUseIds` (`packages/kernel/src/hooks/autoStream.ts:863-879`), so duplicate ids within the same transcript batch are not collapsed. That is likely outside this fix, but easy to harden.

### Skip Semantics

For current Claude MCP naming, `mcp__fmark__*` is the right suppression prefix. It matches the allow-list shape generated from the F-Mark MCP tool list (`packages/kernel/src/mcp/tools.ts:41-43`), and other MCP tools such as Playwright should not be skipped because they do not write F-Mark events themselves.

The prefix is fragile if the server alias changes. If Claude starts emitting a different server segment, the live hook will silently produce generic tool-use events for F-Mark MCP calls. If Claude adds a sub-namespace after the `mcp__fmark__` segment, the current prefix still works. A more robust follow-up would use MCP metadata from the hook payload if available, or import/derive from the central F-Mark Claude allow-list instead of embedding the string in `autoStream.ts`.

The more urgent skip bug is the fall-through in finding 1: suppressed F-Mark MCP `PostToolUse` must still terminate the hook path.

### Subagent Overlap

The dispatch order is correct for the current Claude names. In `runAutoStream`, `extractSubagentHookEvents` runs before `extractPostToolUseEvent` (`packages/kernel/src/hooks/autoStream.ts:1016-1044`). For non-`SubagentStart`/`SubagentStop` hooks, it delegates to `extractSubagentToolHookEvents` (`packages/kernel/src/hooks/autoStream.ts:568-580`), which recognizes Claude `PostToolUse`/`AfterTool` for `agent` or `task` after lowercasing (`packages/kernel/src/hooks/autoStream.ts:451-460`). If it finds events, the run loop posts them with `emitTurnEnd: false` and returns (`packages/kernel/src/hooks/autoStream.ts:1022-1033`).

`extractPostToolUseEvent` also skips `agent`/`task` itself (`packages/kernel/src/hooks/autoStream.ts:676-714`), so there is a second guard against generic tool-use duplication. If Claude introduces a new subagent tool name, it will become a generic live tool-use until both recognizers are updated. The existing phase19 hot coverage for `Agent` PostToolUse is good evidence for the current path.

### Tests

Good coverage:

- Claude install detection now requires the three entries and reports missing PostToolUse as stale (`packages/kernel/tests/hooksInstall/claude.test.ts:13-44`).
- Apply/prune idempotence expects three F-Mark hook commands (`packages/kernel/tests/hooksInstall/claude.test.ts:154-215`).
- Extractor tests cover happy path, F-Mark MCP skip, Claude subagent skip, non-PostToolUse, missing required ids, and a direct `is_error` response (`packages/kernel/tests/hooks/autoStream.test.ts:555-655`).
- Run-loop tests cover generic live PostToolUse and F-Mark MCP suppression at a shallow level (`packages/kernel/tests/hooks/autoStream.test.ts:105-164`).

Missing coverage to add:

- `PostToolUse -> Stop` dedupe integration, as described in finding 3.
- Suppressed `PostToolUse` with `transcript_path` does not fall through to Stop projection, as described in finding 1.
- `tool_call_id` fallback, `input` fallback, missing `tool_input -> {}`, `tool_result`/`response`/`result` fallbacks, and `tool_response.status: "failed"` success inference.
- Subagent run-loop integration for `PostToolUse` `Agent`/`Task` that asserts subagent events are posted and no generic `/events/tool-use` post happens. The phase19 hot test covers the behavior, but a normal test would keep it from regressing.

### Hot Test

`managed-only-v1 -> managed-only-v2` is the right version bump for `phase16-access-requests-hot.mjs`, but the fixture needs the `PostToolUse` hook too. A v2 command with only v1 events is intentionally stale under the new detector.

### Style And Consistency

The new code mostly matches the surrounding style: small local helpers, fail-open hook behavior, and clear comments. The `transcript.ts` rename-only comment is clearer and accurately documents the ignored block behavior (`packages/kernel/src/hooks/transcript.ts:417-420`).

The one style consistency issue is control flow in the assistant hook branch: `PostToolUse` is modeled as a nullable extractor result, but `null` means both "not a PostToolUse" and "a PostToolUse that should be ignored". The run loop needs to distinguish those cases with an explicit event-name branch so ignored PostToolUse payloads do not inherit Stop semantics.
