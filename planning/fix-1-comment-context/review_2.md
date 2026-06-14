# Review 2 - Fix #1 Comment Context

Scope: re-reviewed the current Fix #1 files called out in the prompt, with emphasis on the three `review_1.md` findings and the new `isValidLines` guard.

## Findings

No new blocking findings. The work is in good shape.

## Review 1 Disposition

1. **Guide correctness for reading parent prose: fixed.**
   The guide now makes `fmark_read_events` the primary path for parsed records and correctly describes `fmark_read_event` as returning raw `.prose.md` markdown with frontmatter (`packages/kernel/src/routes/guide.ts:119-120`). The guide test now checks `fmark_read_events` and 1-indexed line semantics (`packages/kernel/tests/routes/guide.test.ts:72-91`).

2. **Malformed payloads / invalid `lines`: fixed.**
   `isCommentProse` now handles `payload: null`, requires a non-empty `append_to`, and only treats `mode: "comment"` prose as comments (`packages/kernel/src/compass/packet.ts:35-45`). `isValidLines` rejects non-arrays, wrong tuple length, non-numbers, `NaN`/`Infinity`, fractional, non-positive, and reversed ranges (`packages/kernel/src/compass/packet.ts:19-33`), and it is used by both `commentSummary` and `packetEvent` (`packages/kernel/src/compass/packet.ts:55-57`, `packages/kernel/src/compass/packet.ts:112-114`). The new packet tests cover malformed lines, `payload: null`, and empty `append_to` (`packages/kernel/tests/compass/packet.test.ts:209-275`).

3. **Reply guidance preserving `lines`: fixed.**
   Step 3 now tells agents to reply with the same `append_to`, the same `lines` when present, and `in_reply_to: <comment filename>` (`packages/kernel/src/routes/guide.ts:122`). The guide test asserts the `same \`lines\`` wording (`packages/kernel/tests/routes/guide.test.ts:88-91`).

## New Notes

- I did not find a regression from `isValidLines`. It intentionally drops malformed line ranges from both the summary and packet fields rather than emitting misleading values or JSON-stringifying `NaN`/`Infinity` to `null`.
- The guard still does not check whether a valid-looking range is within the parent prose's actual line count. That was already called out as a known/non-goal gap, and this fix does not make it worse.

## Verification

`pnpm -F f-mark exec vitest run tests/compass/packet.test.ts tests/routes/guide.test.ts` passed: 2 files, 30 tests.
