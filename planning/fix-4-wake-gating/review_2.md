# Review 2 - Fix #4 Wake Gating

## Disposition Check

1. **Empty End-Turn button click did not wake: yes, fixed.**  
   `SendButton.onEndTurn` now calls `endTurnAndWake()` (`Compose.tsx:480`), and the empty message button path still calls `onEndTurn()` from `SendButton.handleClick()`. The new test clicks the actual `End turn` button and asserts one turn-end plus one wake.

2. **Empty-branch wake could fire without a posted turn-end: yes, fixed.**  
   `endTurn()` now returns `false` before posting when `sessionId` or `userId` is missing, returns `true` only after `postTurnEnd()` resolves, and `endTurnAndWake()` gates the wake on that boolean.

3. **Wake assertions were too loose: yes, fixed.**  
   The new wake-gating tests use exact `toHaveLength(1)` / `toHaveLength(0)` checks.

## New Review Notes

No blocking findings. The boolean return and `endTurnAndWake` deps look correct: `endTurnAndWake` captures `endTurn`, `sessionId`, and `token`, while `endTurn` captures the current `sessionId`, `userId`, and `token`.

The `SendButton` wiring also looks correct for the reviewed paths: empty message mode routes through `onEndTurn`, while content-bearing send routes through `onSubmit`.

One small cleanup: the comment above `submitAndMaybeEndTurn()` says the mention-plus-end-turn case intentionally produces two wakes, but the implementation produces only the targeted mention wake and then posts turn-end with no broad `user-message` wake. That behavior seems consistent with the tests and the original "mentions always wake; otherwise wake on end-turn" rule, so I would update the comment rather than change code unless a broad second wake is desired.

## Verification

`pnpm -F @f-mark/renderer exec vitest run tests/compose.test.tsx` passed: 32 tests.
