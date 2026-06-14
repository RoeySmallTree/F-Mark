# Fix #1 — Comment context via structured packet fields

## Intent

When a user comments on lines of a prose (via `LineCommentRail` → `wakeSession({reason: "comment", ...})`), the wake packet currently surfaces only a 240-char `summary` of the comment text. The agent has no way to tell from the packet that it's a comment, which parent prose it's anchored to, or which lines it refers to. The agent must call `fmark_get_inbox` and then read the parent prose separately — and the guide doesn't say to.

Fix the packet to carry the anchoring metadata directly, and tell the agent in the guide how to dereference it.

## Strategy

Three minimal additions, all data-shape-aware:

1. **Schema** (`packages/shared/src/compass.ts`): extend `CompassPacketEvent` with three optional fields — `append_to?: string`, `mode?: "content" | "comment"`, `lines?: [number, number]`. Only populated for prose events.
2. **Kernel** (`packages/kernel/src/compass/packet.ts`):
   - `packetEvent` propagates `append_to / mode / lines` from prose payloads onto the packet event.
   - `payloadSummary` produces a richer comment summary: `comment on <append_to> @<a>-<b>: <body>` (truncated to 240 chars). Falls back to `comment on <append_to>: <body>` when `lines` is absent.
3. **Guide** (`packages/kernel/src/routes/guide.ts`): add a "Responding to Comments" section explaining how to dereference `append_to` + `lines` via `fmark_read_event`, treat the comment as a question about the anchored slice, and thread the reply via `in_reply_to`.

## Files changed

- `packages/shared/src/compass.ts` — extended `CompassPacketEvent` with optional anchor fields.
- `packages/kernel/src/compass/packet.ts` — `isCommentProse` helper, `commentSummary` formatter, `packetEvent` propagates anchor fields.
- `packages/kernel/src/routes/guide.ts` — new "Responding to Comments" section under "Reading Context".
- `packages/kernel/tests/compass/packet.test.ts` — **new file**, 6 tests: anchor prose has no comment fields, comment prose propagates them, summary format `@a-b`, summary without lines, non-prose events unaffected, wake-prompt JSON includes the new fields.
- `packages/kernel/tests/routes/guide.test.ts` — 1 new test that the guide contains the comment-handling section, references `append_to`, `lines`, `fmark_read_event`, and `in_reply_to`.

## Intentional non-goals

- Not embedding the parent prose content in the packet. The packet stays small; the agent fetches the parent via `fmark_read_event` when needed. The metadata fields let the agent recognize a comment and target the parent without re-discovering it.
- Not changing `WakeReason` — `"comment"` already exists.
- Not changing the renderer side. The renderer already calls `wakeSession({reason: "comment"})` when a comment posts; the kernel-side enrichment is enough.
- Not adding a `comment` discriminated event kind to the packet. The existing prose kind + `mode: "comment"` discriminator is sufficient.

## Open risks / known gaps

- The `lines` field is forwarded verbatim. If a comment's `lines` are out-of-range vs. the parent prose's actual line count, the agent might point at a non-existent slice. That's a renderer-side validation concern, not a kernel-side one.
- Shared package rebuild (`pnpm -F @f-mark/shared build`) required before kernel/renderer tests pick up the new optional fields. Done.
- Existing wake packets in flight at deploy time will not carry the new fields — agents that see them just get the old summary format. Backward-compatible.

## Tests

`pnpm -F f-mark exec vitest run tests/compass/packet.test.ts tests/routes/guide.test.ts` → 23 passed (17 existing guide + 6 new packet).

## What I want reviewed

1. **Schema additions.** Is `[number, number]` the right tuple shape for `lines`, or should it be `{ start: number; end: number }`? The existing `ProsePayload` already uses the tuple form, so I matched that for consistency.
2. **Summary format.** `comment on <filename> @a-b: <body>` — readable enough for an agent reading raw packet JSON, or would `[comment on <filename>:<a>-<b>] <body>` parse better?
3. **Guide wording.** Does the new "Responding to Comments" section read well to an agent who just received the wake packet? Anything ambiguous?
4. **No structural break.** All `CompassPacketEvent` consumers should keep working — fields are all optional. Sanity-check downstream.

## Disposition of review_1.md findings

1. **Guide said `fmark_read_event` returns `payload.content` (wrong) → FIXED.** Switched the primary recommendation to `fmark_read_events` which returns parsed records. Kept `fmark_read_event` as an alternative with the caveat that it returns raw `.prose.md` markdown (frontmatter must be stripped). Guide test now asserts both `fmark_read_events` and the `1-indexed` semantics.
2. **Malformed payloads / `payload: null` could crash or emit `@NaN-Infinity` → FIXED.** Added `isValidLines` guard that requires `Number.isInteger`, `Number.isFinite`, `> 0`, and `start <= end`. Used in both `commentSummary` and `packetEvent`. `isCommentProse` now explicitly handles `payload === null`. Empty `append_to` is rejected (falls back to generic summary). 9 new tests cover malformed lines, `payload: null`, empty `append_to`, single-line `[n,n]`, empty content, prose with `append_to` but no `mode`, and the 240-char truncation boundary.
3. **Reply guidance omitted `lines` → FIXED.** Step 3 now says "the same `lines` (when the original comment had them)". Test asserts the `same \`lines\`` phrasing.

`pnpm -F f-mark exec vitest run tests/compass/packet.test.ts tests/routes/guide.test.ts` → 30 passed (17 existing guide + 13 packet — 6 from round one + 7 from round two).
