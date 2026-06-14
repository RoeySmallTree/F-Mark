# Review 1 - Fix #4 Wake Gating

## Findings

1. **Empty End Turn button click still does not wake.**  
   `sendOrEndTurn()` now wakes after the empty-message branch posts turn-end (`packages/renderer/src/compose/Compose.tsx:206`-`216`), but the visible primary End Turn button does not call that path. `SendButton` receives `onEndTurn={() => void endTurn()}` at `packages/renderer/src/compose/Compose.tsx:464`-`472`, and `SendButton.handleClick()` calls `onEndTurn()` for empty message mode at `packages/renderer/src/compose/SendButton.tsx:86`-`90`. So keyboard `Cmd/Ctrl+Enter` wakes, but clicking the empty End Turn button only posts `/events/turn-end`. The new test named "End Turn click with empty draft calls wake" uses the keyboard at `packages/renderer/tests/compose.test.tsx:874`-`884`, so it misses the actual click path. Suggest sharing one `endTurnAndWake`/`sendOrEndTurn` path for both hotkey and button, and add a real `user.click(screen.getByRole("button", { name: /^End turn$/i }))` assertion.

2. **The empty-branch wake can fire even when no turn-end was posted.**  
   In `sendOrEndTurn()`, `!canSubmit` means more than "empty draft": it is also false when `sessionId === null` or `userId === null` (`packages/renderer/src/compose/Compose.tsx:128`-`135`). `endTurn()` silently returns when either is missing (`packages/renderer/src/compose/Compose.tsx:189`-`193`), but the wake guard only checks `sessionId !== null` (`packages/renderer/src/compose/Compose.tsx:213`-`216`). With a session but no `userId`, the hotkey can wake managed agents without writing a turn-end. Suggest gating the wake on the same preconditions as `endTurn()` or having `endTurn()` return whether it actually posted.

## Checks

- **Mention gating:** for semantic mentions selected through the picker, the branch does fire with `messageEndsTurn=false`: `submit()` captures `selectedMentions`, posts them, then wakes with `reason: "mention"` and `target_participant_ids` at `packages/renderer/src/compose/Compose.tsx:143`-`164`. Manual text like `@Claude` without picker selection will not wake because `selectedMentions` stays empty; that appears consistent with the current mention model, but it is worth keeping in mind.

- **Closure correctness:** `submit` now includes `messageEndsTurn` in its dependency array (`packages/renderer/src/compose/Compose.tsx:177`-`187`), and `submitAndMaybeEndTurn` also depends on it (`packages/renderer/src/compose/Compose.tsx:199`-`204`). I do not see a stale closure for the wake gate. `selectedMentions` is already in `submit` deps, so the mention branch captures the current selection.

- **Cross-impact:** the existing empty `Cmd/Ctrl+Enter` test around `packages/renderer/tests/compose.test.tsx:238` still passes because it only asserts one turn-end and zero prose posts; it does not assert that wake is absent. That means the new hotkey wake changes behavior under that test without failing it. `CreateTodoPopover` still only wakes the assigned agent for todo creation and then optionally posts turn-end via `onCreated`; this patch does not add an all-agent wake on create-todo turn-end.

- **Test quality:** the `/managed-agents/status` mock shape matches `AgentMentionPicker`'s real filter: it returns a managed row with `active_session === sessionId` and `connection_state: "connected"` (`packages/renderer/src/components/AgentMentionPicker.tsx:95`-`114`, `176`-`205`). The wake assertions should use exact counts where possible; `toBeGreaterThan(0)` at `packages/renderer/tests/compose.test.tsx:829`-`830` and `858`-`859` would not catch duplicate wakes.

- **Naming/consistency:** `sessionId !== null` inside `sendOrEndTurn` is necessary for the `wakeSession(sessionId, ...)` call, and `activeMode === "message"` does not imply an active session. The issue is not that the guard is redundant; it is that it is weaker than the `endTurn()` preconditions and lets wake diverge from a successful turn-end.

## Verification

- `pnpm -F @f-mark/renderer exec vitest run tests/compose.test.tsx` passed: 31 tests.
