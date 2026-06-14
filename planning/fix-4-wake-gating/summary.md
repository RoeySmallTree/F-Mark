# Fix #4 — Wake only on turn-end or @mention

## Intent

`Compose.submit()` currently calls `wakeSession(...)` unconditionally whenever the user is in `"message"` mode, no matter whether the user is ending their turn or still drafting. This wakes the agent on every Send in multi-step compositions and produces premature, half-context responses. Gate the wake so:

- Mentions always wake (a mention is a deliberate page).
- Otherwise, wake only when the same Send also ends the turn (`messageEndsTurn`).
- Clicking the End-Turn button on an empty draft also wakes — that's the "I'm done, agent go" intent.

## Strategy

Renderer-only. No kernel changes, no schema changes.

- `packages/renderer/src/compose/Compose.tsx` (`submit`): split the wake into two branches — mentions vs `messageEndsTurn`. Drop the unconditional wake.
- `Compose.tsx` (`sendOrEndTurn`): when the empty-content branch fires `endTurn()`, also call `wakeSession({ reason: "user-message" })`. The wake here mirrors the wake submit fires when `messageEndsTurn` is on — same intent, different entry point.

## Files changed

- `packages/renderer/src/compose/Compose.tsx` — wake gating in `submit` + wake-on-empty-End-Turn in `sendOrEndTurn`. Adds `messageEndsTurn` to `submit`'s dep array.
- `packages/renderer/tests/compose.test.tsx` — new `describe("Compose — wake-on-send gating")` block with four tests covering: (1) Send with no mentions + `messageEndsTurn=false` does NOT wake, (2) Send with a mention wakes the mentioned agent even with `messageEndsTurn=false`, (3) Send with `messageEndsTurn=true` (default) wakes with reason `user-message`, (4) End Turn click with empty draft wakes with reason `user-message`. Includes `localStorage.removeItem` hygiene around the `fmark:settings:message-ends-turn` key.

## Intentional non-goals

- Not changing wake behavior in `LineCommentRail.tsx` or `CommentThreadOverlay.tsx` — those wakes are anchored to a specific comment/anchor and the "agent go" semantics are different. They already gate on `participants[event.participant_id]?.kind === "agent"`.
- Not changing the `WakeReason` schema — the existing `mention` and `user-message` enum values cover both cases.
- Not adding a UI affordance for "Send without waking" — the `messageEndsTurn` toggle in the Compose settings popover already exposes the user's intent.

## Open risks / known gaps

- The mention test stubs `/managed-agents/status` to populate the picker. If the picker's API call shape changes, the stub will need to match. The test searches for the choice button by `aria-label` substring containing the participant id (`ag-c92e`) to stay robust to display-name changes.
- A user who toggles `messageEndsTurn=false` mid-session and immediately hits ⌘↵ on a message still depending on the `messageEndsTurn` value captured at render — React rerender semantics mean this resolves naturally on the next paint. Not a regression vs. the prior behavior.

## Tests

`pnpm -F @f-mark/renderer exec vitest run tests/compose.test.tsx` → 31 passed (27 existing + 4 new).

## What I want reviewed

1. **Wake-reason taxonomy.** Should the empty-draft End-Turn wake use `"user-message"` (current choice — matches the regular Send-and-end-turn path) or a more specific reason like `"end-turn"`? Trade-offs?
2. **Mention semantics with `messageEndsTurn`.** Currently a Send with a mention always wakes regardless of `messageEndsTurn`. Is that the right intent, or should `messageEndsTurn=false` *also* suppress mention wakes (treating mentions as "schedule a wake but don't fire it until end-turn")? I think the current behavior is right (mention = deliberate page = immediate), but I want a second opinion.
3. **Dep-array change for `submit`.** Adding `messageEndsTurn` to the deps closes the obvious staleness, but `submit` already captures `selectedMentions`. Confirm I haven't introduced an unnecessary re-render storm.
4. **The empty-End-Turn wake in `sendOrEndTurn`.** Reasonable to fire wake here, or should it live inside `endTurn` itself so other callers (e.g., a future Send button branch) benefit automatically?

## Disposition of review_1.md findings

1. **Empty End-Turn button click didn't wake → FIXED.** Extracted `endTurnAndWake` callback in `Compose.tsx`. It calls `endTurn()` (which now returns `boolean`) and only fires the wake when the turn-end was actually posted. Wired both `sendOrEndTurn`'s empty-draft hotkey branch AND `SendButton.onEndTurn` (the visible button click) through `endTurnAndWake`. Added a new test that clicks the End-Turn button directly to lock the parity.
2. **Wake fires even when no turn-end was posted → FIXED.** `endTurn()` now returns `Promise<boolean>`: `false` when `sessionId === null || userId === null`, `true` after a successful post. `endTurnAndWake` checks the boolean before waking, so an empty-draft End-Turn intent with no userId no longer fakes a wake.
3. **Tests use `toBeGreaterThan(0)` → TIGHTENED.** All wake assertions in the new describe block now use `toHaveLength(1)` for exact wake counts. This catches duplicate wakes that previously could have slipped past.

## Additional tests added

- End-Turn button click with empty draft calls wake (button-click parity test).

`pnpm -F @f-mark/renderer exec vitest run tests/compose.test.tsx` → 32 passed (27 existing + 5 new).
