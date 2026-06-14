# Review 1 - Fix #1 Comment Context

Scope note: reviewed only the requested Fix #1 surface: `packages/shared/src/compass.ts`, `packages/kernel/src/compass/packet.ts`, the new MCP guide section in `packages/kernel/src/routes/guide.ts`, `packages/kernel/tests/compass/packet.test.ts`, and the new guide test in `packages/kernel/tests/routes/guide.test.ts`. I also traced the wake-packet call sites/consumers and the MCP `fmark_read_event` implementation to check the guide's advice.

## Findings

1. **Guide correctness: `fmark_read_event` does not return an object with `payload.content`.**
   The new guide tells agents to "Read the parent prose with `fmark_read_event` ... and find the anchored lines in its `payload.content`" (`packages/kernel/src/routes/guide.ts:119-121`). But `fmark_read_event` calls `/sessions/:id/raw/:filename` (`packages/kernel/src/mcp/tools.ts:253-277`), and that route serves the raw file stream (`packages/kernel/src/routes/raw.ts:101-117`). `fmarkFetch` only JSON-parses when the body is JSON, otherwise it returns the raw string (`packages/kernel/src/mcp/context.ts:174-190`). For a `.prose.md` parent, the agent receives markdown/frontmatter text, not `{ payload: { content } }`. Suggest either saying "read the raw parent prose and use the markdown body after frontmatter" or changing the instruction to use `fmark_read_events` when the agent needs parsed `payload.content`. Add a guide test that guards the exact wording, not just token presence.

2. **Malformed prose payloads can still leak invalid line values, and one malformed shape can crash packet construction.**
   `packetEvent` only checks `typeof ... === "number"` before copying `lines` (`packages/kernel/src/compass/packet.ts:86-92`), and `commentSummary` uses the same unvalidated values in the human-readable summary (`packages/kernel/src/compass/packet.ts:33-39`). That means a hand-edited or otherwise malformed prose payload can emit `@NaN-Infinity`, fractional/negative ranges, and JSON `lines: [null, null]` after `JSON.stringify` turns `NaN`/`Infinity` into `null`. The write path rejects those values (`packages/kernel/src/events/proseValidate.ts:126-137`), but `parseProse` only type-checks numbers on read (`packages/kernel/src/events/prose.ts:46-52`), so hand-edited files can bypass the stricter write validator. Also, `isCommentProse` reads `payload.mode` after only checking `payload !== undefined` (`packages/kernel/src/compass/packet.ts:23-28`); a direct/malformed prose event with `payload: null` throws before the generic summary fallback can handle it. Suggest a small runtime guard for packet prose payloads: require a non-null object, require non-empty `append_to`, and require `Number.isInteger`, `Number.isFinite`, `> 0`, and `start <= end` before propagating or formatting `lines`.

3. **Guide wording omits preserving `lines` when replying to a line-anchored comment.**
   Step 3 says to reply with `mode: "comment"`, the same `append_to`, and `in_reply_to` (`packages/kernel/src/routes/guide.ts:121-122`), but it does not say to include the same `lines` when the original comment has them. The renderer reply path preserves `lines` when posting a threaded reply (`packages/renderer/src/overlays/CommentThreadOverlay.tsx:287-294`), so the agent guide should match that model. Suggest changing the step to "the same `append_to` and, when present, the same `lines`, plus `in_reply_to: <comment filename>`."

## Checks

- **Propagation:** on well-formed events, `packetEvent` propagates only the fields actually present in the prose payload: `append_to` only when it is a string, `mode` only for `"content"`/`"comment"`, and `lines` only when it is a 2-element numeric array (`packages/kernel/src/compass/packet.ts:77-95`). It does not synthesize default `mode: "content"` for plain content blocks.
- **Non-prose events:** `packetEvent` wraps all field propagation in `event.kind === "prose"` (`packages/kernel/src/compass/packet.ts:77-95`), so non-prose events are not given the new packet fields. The current test covers a todo without `append_to` (`packages/kernel/tests/compass/packet.test.ts:106-126`); add one with a non-prose payload that does include `append_to` to lock the intended drop behavior.
- **Summary truncation:** `truncate` normalizes whitespace, returns strings of length `<= 240` unchanged, and for longer strings returns `237` chars plus `...` (`packages/kernel/src/compass/packet.ts:13-17`). I checked the boundary with a long comment body: summary length exactly 240 is not ellipsized; one character over becomes length 240 and ends with `...`. The behavior is correct, but untested.
- **Schema/backward compatibility:** `CompassPacketEvent` adds only optional fields (`packages/shared/src/compass.ts:16-31`). I searched downstream uses of `CompassPacketEvent`, `CompassPacket`, `buildCompassPacket`, and `buildWakePrompt`; kernel consumers either JSON-stringify the whole packet (`packages/kernel/src/compass/packet.ts:136-138`) or read only top-level delivery metadata (`packages/kernel/src/routes/managedAgents.ts:1278-1296`). I did not find a local consumer that assumes an exact event shape.

## Edge Cases

- **`lines: [n, n]`:** accepted and summarized as `@n-n`. That is mechanically correct for the tuple model, though `@n` would be nicer for humans/agents. At minimum add a test so single-line anchors remain intentional.
- **Comment with no `content`:** `commentSummary` handles missing/non-string/empty content by emitting `comment on <anchor> @a-b` without the trailing colon (`packages/kernel/src/compass/packet.ts:38-39`). Good behavior, but currently untested.
- **`append_to` but no `mode`:** current behavior treats this as a content block, not a comment, which matches the prose role rules (`packages/shared/src/events.ts:41-44`, `packages/shared/src/proseRoles.ts:58-71`). The packet forwards `append_to`, leaves `mode` unset, and summarizes the content normally. That is fine, but a test would document that it is not a comment wake.
- **Malformed `mode: "comment"` without valid `append_to`:** write validation rejects this (`packages/kernel/src/events/proseValidate.ts:105-110`), but hand-edited files can exist. Today `isCommentProse` will not use comment summary unless `append_to` is a string (`packages/kernel/src/compass/packet.ts:24-28`), which is reasonable; the malformed guard above would make this explicit.

## Test Gaps

- Add packet tests for 240-char boundary behavior: exactly 240 chars no ellipsis, 241+ chars length 240 with `...`.
- Add packet tests for malformed prose payloads: `payload: null`, `lines: [NaN, Infinity]`, fractional/negative/reversed ranges, and empty `append_to`.
- Add packet tests for edge cases: `lines: [n, n]`, comment with empty/missing content, prose with `append_to` but no `mode`, and non-prose with `append_to`.
- Strengthen the guide test (`packages/kernel/tests/routes/guide.test.ts:72-87`) to assert the actionable details: `fmark_read_event` returns raw prose or the guide uses `fmark_read_events` for parsed payloads, replies preserve `lines` when present, and `in_reply_to` is used on the comment filename.

## Verification

- `pnpm -F f-mark exec vitest run tests/compass/packet.test.ts tests/routes/guide.test.ts` passed: 23 tests.
- Boundary probe for comment summaries: 187-char body produced summary length 240 with no ellipsis; 188-char body produced summary length 240 with ellipsis; huge body produced summary length 240 ending in `...`.
