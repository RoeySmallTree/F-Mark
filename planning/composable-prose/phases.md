# Composable Prose — phased implementation

Re-sequenced per `review_1.md`'s phase-boundary recommendations.

Each phase: atomic, reviewable in isolation, lands as a single commit on
`main`, keeps every test suite green, leaves the app shippable. The
feature only "lights up" at Phase 11; earlier phases are additive
plumbing.

## Phase 0 — clean baseline

**Scope:** commit the current ProseCard rework + runtime_id work that's
already in the working tree (only files I touched this session).

**Touches:** the small set from the previous session.

**Exit:** `pnpm -F @f-mark/renderer test` and `pnpm -F f-mark test` pass.
`git log` shows a focused commit.

## Phase 1 — shared schema additions

**Scope:** types only in `packages/shared/src/events.ts`. No behaviour
change anywhere; existing code ignores the new optional fields.

**Adds:**
- `BlockMode` type.
- `ProseFrontmatter` gains `append_to`, `mode`, `lines`, `removed`.
- `FlowPayload`, `FileRefPayload`, `HtmlManifest`, `ChoicesPayload`,
  `TodoPayload`, `ToolUsePayload` gain `append_to`.

**Build:** `pnpm --filter @f-mark/shared build` (per workspace memory).

**Exit:** `pnpm build` green across all packages.

## Phase 2 — normalization helpers + atomic comment-system migration

**Scope:** the highest-regression-risk phase (per review_1). Lands as ONE
commit so the in-memory shape and every consumer change together.

**Adds:**
- `packages/shared/src/proseRoles.ts` — `getProseRole(payload) → ProseRole`,
  enumerated `ProseRole` union (anchor / named-block / unnamed-block /
  comment / tombstone / message).
- `packages/shared/src/blocks.ts` — `getAppendTo`, `isComposableBlock`,
  `isNamedAnchor`, `getCommentTarget`.
- `packages/kernel/src/events/prose.ts` — `parseProse` maps legacy `target`
  to new fields on read; warns + prefers new fields if both present.
  `serializeProse` writes the new shape only; never emits `target`.
- `packages/kernel/src/events/proseValidate.ts` — mutual-exclusion
  validator (every rule from `plan.md`'s validation table).
- Migrate every renderer/kernel consumer to read via the helpers:
  - `packages/renderer/src/state/aggregate.ts`
  - `packages/renderer/src/cards/EventCard.tsx`
  - `packages/renderer/src/cards/LineCommentRail.tsx` (read + post)
  - `packages/renderer/src/panels/right/RightComments.tsx`
  - `packages/renderer/src/overlays/CommentThreadOverlay.tsx`
  - `packages/kernel/src/routes/files.ts` (file-comment serialization)
  - All `RightNamed` / command palette / search "named" facets switch to
    `isNamedAnchor()`.

**Tests:**
- `kernel/tests/events/prose.test.ts`: round-trip new fields; legacy
  `target` → new fields on read; both-present reads warn + prefer new;
  serializer never emits `target`.
- `kernel/tests/events/proseValidate.test.ts`: every rule from the
  mutual-exclusion table.
- Renderer existing comment tests stay green (LineCommentRail,
  RightComments, CommentThreadOverlay) under the helper-routed code paths.

**Exit:** comments still work end-to-end with no UX change. Tests for new
helpers + parser back-compat green. **No new feature is visible yet.**

## Phase 3 — kernel route schemas

**Scope:** wire the new fields into every route's JSON Schema. Add
`additionalProperties: false` to lock down strays (Finding #6).

**Touches:**
- `packages/kernel/src/routes/events.ts` — prose route: new fields,
  validator call.
- `packages/kernel/src/routes/flow.ts` — `append_to`; `additionalProperties:
  false`.
- `packages/kernel/src/routes/files.ts` — file route + file-comment helper.
- `packages/kernel/src/routes/html.ts` (or wherever) — same.
- `packages/kernel/src/routes/events.ts` — choices/todo/tool-use routes —
  same.
- `turn-end` and `choice` routes — lock with `additionalProperties: false`;
  no `append_to` allowed.

**Tests:** Layer 1 route-validation rows from `tests.md` (every reject row
gets a 400 assertion).

**Exit:** every kind can be authored as a block at the kernel; rejects
malformed combinations; renderer still ignores `append_to`.

## Phase 4 — `/best-practices` endpoint

**Scope:** new `packages/kernel/src/routes/bestPractices.ts` returning the
long-form markdown. Register in `packages/kernel/src/server.ts`.

**Tests:** GET 200, content checks for the canonical four-event example +
patterns; auth rules match `/guide`.

**Exit:** documentation surface ready before any renderer composition.

## Phase 5 — `/guide` recipe

**Scope:** update `packages/kernel/src/routes/guide.ts` to add the
"Composing documents" section with the 5 pitfalls. Update bundled skill
markdowns under `packages/kernel/assets/*-skill/f-mark/api.md`.

**Tests:** GET /guide body includes the new section + link to
`/best-practices`.

**Exit:** authors can discover the feature; guidance is correct.

## Phase 6 — aggregate foundation

**Scope:** `packages/renderer/src/state/aggregate.ts` — add
`consumedBlocksByAnchor`, `orphanBlocks`, `liveAnchorOf`, `rootOf`.
Deterministic `timestamp || filename` sort. Visited-set cycle detection.
Fork policy (lexicographic).

**Critical:** don't yet filter consumed blocks out of `feed` /
`feedDocument` / `feedConversation`. Just expose the new derivations.

**Tests:** Layer 2 from `tests.md`. Test the comment system on the new
helpers + aggregate output (regression coverage of every comment scenario).

**Exit:** state derivation correct; no behaviour change visible.

## Phase 7 — feed-slice filter for consumed blocks

**Scope:** apply the `isConsumedBlock` filter to `feed`, `feedDocument`,
`feedConversation`. Orphans stay (visible at top level).

**Tests:** assert consumed blocks vanish from top-level feed; orphans
remain.

**Exit:** an `append_to` flow disappears from the feed (and reappears as
an orphan card if its anchor is missing). Anchors render unchanged
(ProseCard still ignores its `blocks` prop, which Phase 11 wires in).

## Phase 8 — `ProseInlineBlock` registry with stubs

**Scope:** new `packages/renderer/src/cards/ProseInlineBlock.tsx` with the
registry. Each kind's inline renderer is a stub (renders a placeholder
saying "TODO: <kind> inline").

**Tests:** dispatch picks the registered renderer; unknown kind falls
back to `UnsupportedBlock`.

**Exit:** the dispatcher is alive but rendering placeholders.

## Phase 9 — `EventCard` early-out + `ProseCard.blocks` plumbing

**Scope:**
- `EventCard.tsx`: returns null for consumed blocks; passes
  `orphanedAppendTo` to top-level cards for orphans.
- `Feed.tsx`: threads `consumedBlocksByAnchor[anchor.filename]` into
  `ProseCard.blocks`.
- `ProseCard`: renders the `blocks` list via `ProseInlineBlock` (still
  stubs at this point). Handles the legacy-content fallback (Finding #9)
  by synthesising a virtual prose-block when `payload.content` is
  non-empty.
- `ProseEmptyState` component for the truly-empty anchor.

**Tests:** Layer 3 from `tests.md` minus the embedded-variant assertions.

**Exit:** end-to-end visible: an `append_to` flow vanishes from the feed
and shows as a stub inside its anchor doc. Feature wired, content quality
TBD.

## Phase 10 — embedded variant: prose block

**Scope:** `InlineProseBlock` uses `MarkdownRenderer` (rendered mode) + a
per-block `LineCommentRail`. Theme-keyed `.prose-embed-frame`.

**Tests:** prose block renders markdown via `fm-prose`; comments on the
block appear on the block's own rail.

**Exit:** prose blocks render properly inline.

## Phase 11 — embedded variant: flow

**Scope:** `FlowCard` gains `variant?: "embedded"`. `InlineFlowBlock`
replaces the Phase 8 stub.

**Tests:** Layer 5 flow row; `.flow-head` absent in embedded; canvas
present.

**Exit:** the most-wanted embed kind (flow charts) renders properly.

## Phase 12 — embedded variants: file / html

**Scope:** `FileCard` and `EmbedCard` (html) gain `variant`. Stubs
replaced.

**Tests:** Layer 5 file + html rows.

**Exit:** file + html embeds work inline.

## Phase 13 — embedded variants: choices / todo / tool-use

**Scope:** the remaining cards. Stubs replaced.

**Tests:** Layer 5 rows for each.

**Exit:** all supported kinds work inline.

## Phase 14 — `BlockAccordion` (new component, keep AccordionMarkdown)

**Scope:** new `packages/renderer/src/render/BlockAccordion.tsx` (Finding
#7). Each block = one fold; nested blocks = sub-folds. **Lazy mounting**
of closed folds is required (Finding's perf edge case: FlowCard mounts
React Flow + runs dagre on every mount).

`ProseCard` accordion mode switches to `BlockAccordion` (not
`MarkdownRenderer`'s accordion path).

**Tests:** Layer 4 from `tests.md` + perf test for 100+ blocks.

**Exit:** accordion mode works on composite docs; flat docs unaffected.

## Phase 15 — source mode + word count + polish

**Scope:**
- Source mode emits the round-trippable concatenated format
  (`<!-- f-mark:block … -->` markers + fenced JSON for non-prose).
- Word count = sum across prose blocks + synthetic legacy block.
- Orphan-embed badge styling pass.
- `LegacyContentMarker` styling for the synthetic legacy block.
- `.prose-embed-frame` final styling pass across themes.

**Tests:** Layer 6 visual checklist via `/browse`.

**Exit:** the doc looks deliberate.

## Phase 16 — final buddy + sonnet QA loop

Per the user's workflow steps 8-11. Triggered after Phase 15 ships.

- `/buddy` reads the whole feature (plan + every committed change) and
  writes `review_final.md`.
- Apply small fixes.
- For each Layer 7 manual test, launch a Sonnet agent to drive `/browse`
  and write `qa/<test-id>.md`.
- For each bug: `/buddy` proposes a fix; Sonnet re-checks; loop until
  green.

## Regression risk callouts

| Phase | Risk | Mitigation |
|---|---|---|
| 2 | Comment migration — every call site touches it at once | Single atomic commit; full comment regression suite in same PR |
| 6/7 | Feed slice filter — could double-hide events | Split into two phases; Phase 6 doesn't filter, Phase 7 turns it on |
| 14 | Accordion rewrite | Keep `AccordionMarkdown` alive; new component is additive |

## Commit policy

- Each phase: one commit on `main`, message
  `feat(composable-prose): phase N — <title>` (or `refactor` / `test` as
  fits).
- If a phase commit goes red, fix forward — no amend, no force-push.
- After Phase 15 + the QA loop: tag complete in
  `planning/composable-prose/DONE.md`.
