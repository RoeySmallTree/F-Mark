# Composable Prose — phased implementation

Revision history:
- v0: initial decomposition
- v1: re-sequenced per review_1 (helpers before behaviour)
- **v2 (this): per review_2 — merged old Phase 7 into rendering phase;
  Phase 2 now atomic with `Compose`/`api/client.ts`/route normaliser;
  `/guide` deferred until real renderers are live.**

Each phase: atomic, reviewable in isolation, lands as a single commit on
`main`, keeps every test suite green, leaves the app shippable. The
feature only "lights up" with the prose+flow renderer in Phase 9; earlier
phases are additive plumbing.

## Phase 0 — clean baseline ✓ DONE (commit 47ae4c1)

ProseCard rework + runtime_id committed.

## Phase 1 — shared schema additions

**Scope:** types only in `packages/shared/src/events.ts`. No behaviour
change anywhere; existing code ignores the new optional fields.

**Adds:**
- `BlockMode` type.
- `ProseFrontmatter` gains `append_to`, `mode`, `lines`, `removed`.
- `FlowPayload`, `FileRefPayload`, `HtmlManifest`, `ChoicesPayload`,
  `TodoPayload`, `ToolUsePayload` gain `append_to`.

**Build:** `pnpm --filter @f-mark/shared build` (workspace memory).

**Exit:** `pnpm build` green across all packages.

## Phase 2 — normalization helpers + atomic comment-system migration (incl. write paths)

**Scope:** ONE atomic commit. Includes everything that reads or writes
the comment shape — review_2 finding 2 + verdict.

**Adds:**
- `packages/shared/src/proseRoles.ts` — `getProseRole(payload) → ProseRole`,
  enumerated role union.
- `packages/shared/src/blocks.ts` — `getAppendTo`, `isComposableBlock`,
  `isNamedAnchor`, `getCommentTarget`. **Helpers normalise shape only;
  they do NOT walk supersession** (review_2 finding C).
- `packages/kernel/src/events/prose.ts` — `parseProse` maps legacy `target`
  to new fields on read; warns + prefers new fields if both present.
  `serializeProse` writes the new shape only.
- `packages/kernel/src/events/proseValidate.ts` — mutual-exclusion
  validator.
- `packages/kernel/src/events/reader.ts:69` — deterministic
  `timestamp || filename` sort (review_2 finding 4).
- **`packages/kernel/src/routes/events.ts` prose handler — write-body
  normaliser.** Translates legacy `target` on incoming POST bodies to
  new fields BEFORE validation/serialization. Rejects 400 if both legacy
  `target` and any new field appear in the same request.

**Migrate every consumer (atomic with the above):**
- `packages/renderer/src/state/aggregate.ts`
- `packages/renderer/src/cards/EventCard.tsx`
- `packages/renderer/src/cards/LineCommentRail.tsx` (read + post)
- `packages/renderer/src/panels/right/RightComments.tsx`
- `packages/renderer/src/overlays/CommentThreadOverlay.tsx`
- `packages/renderer/src/compose/Compose.tsx`  ← NEW vs phases v1
- `packages/renderer/src/compose/TargetPill.tsx`
- `packages/renderer/src/api/client.ts` (postProse type + comment shape) ← NEW
- `packages/renderer/src/popovers/log-filter-types.ts:141` (named-only
  filter switches to `isNamedAnchor`) ← NEW
- `packages/kernel/src/routes/files.ts` (file-comment serialization)
- `packages/renderer/src/panels/right/RightNamed.tsx` and any search /
  command-palette named facet (all use `isNamedAnchor`).

**Tests:**
- `kernel/tests/events/prose.test.ts` round-trip + legacy-target read.
- `kernel/tests/events/proseValidate.test.ts` per validator rule.
- `kernel/tests/routes/events.test.ts` write-body normaliser:
  - Legacy-target body POST → server emits new-shape file.
  - Body with both legacy `target` and new `append_to` → 400.
- Renderer comment tests stay green under helper routing.

**Exit:** comments still work end-to-end with no UX change. New shape
flows through everywhere. **No new feature visible yet.**

## Phase 3 — kernel route schemas (every non-prose kind)

**Scope:** wire `append_to` into every non-prose route's JSON Schema.
Add `additionalProperties: false` to lock down strays everywhere
(review_2 finding 6 confirms this addresses the `...rest` persistence
risk).

**Touches:**
- `packages/kernel/src/routes/flow.ts` — `append_to`; lock down.
- `packages/kernel/src/routes/files.ts` (file route).
- `packages/kernel/src/routes/html.ts` (or wherever).
- `packages/kernel/src/routes/events.ts` — choices / todo / tool-use
  routes — `append_to`; lock down.
- `turn-end` and `choice` — lock with `additionalProperties: false`;
  no `append_to`.

**Tests:** Layer 1 route-validation rows from `tests.md` (every reject
row gets a 400 assertion).

**Exit:** every kind can be authored as a block at the kernel; rejects
malformed combinations. Renderer still ignores `append_to`.

## Phase 4 — `/best-practices` endpoint

**Scope:** new `packages/kernel/src/routes/bestPractices.ts` returning
long-form markdown. Register in `packages/kernel/src/server.ts`.

**Tests:** GET 200, content checks for canonical four-event example +
patterns; auth rules match `/guide`.

**Exit:** documentation surface ready — but `/guide` itself doesn't
mention it yet (deferred to Phase 11, see review_2 finding B).

## Phase 5 — aggregate foundation (derivation only, NO behaviour change)

**Scope:** `packages/renderer/src/state/aggregate.ts` — add
`consumedBlocksByAnchor`, `orphanBlocks`, `liveAnchorOf`, `rootOf`.
Deterministic `timestamp || filename` sort. Visited-set cycle detection.
Fork policy (lexicographic).

**Critical:** the new derivations are added BUT NOT YET CONSUMED.
`feed`/`feedDocument`/`feedConversation` keep their current filters —
consumed-block filtering ships in Phase 6 alongside the renderer.
(Review_2 finding B: Phase 7 alone is not shippable.)

**Tests:** Layer 2 derivation tests in `tests.md` — assert
`consumedBlocksByAnchor`/`orphanBlocks` content WITHOUT asserting feed
changes. (Feed-filter assertion moves to Phase 6 — also fixes review_2's
test mis-assignment note.)

**Exit:** state derivation correct; no UX change.

## Phase 6 — turn on filtering + ProseInlineBlock stubs + ProseCard plumbing

**Scope:** ONE atomic commit that lights up the feature in stub form.
(Merges the old Phases 7/8/9 — review_2 finding B.)

**Includes:**
- Feed-slice filter: `feed`/`feedDocument`/`feedConversation` exclude
  consumed-block filenames. Orphans stay.
- `EventCard.tsx`: returns null for consumed-block filenames; passes
  `orphanedAppendTo` to top-level cards for orphans.
- `ProseInlineBlock.tsx` (new): registry dispatcher. Each kind's inline
  renderer is a STUB for now ("TODO: <kind> inline").
- `Feed.tsx`: threads `consumedBlocksByAnchor[anchor.filename]` into
  `ProseCard.blocks`.
- `ProseCard`: renders `blocks` via `ProseInlineBlock` stubs in the body
  region. Legacy-content fallback synthesises a virtual prose-block when
  `payload.content` is non-empty.
- `ProseEmptyState` for the truly-empty anchor.
- **`ProseInlineBlock` wrapper sets `data-event-filename={block.filename}`**
  so right-panel comment focus still scrolls to the right node
  (review_2 finding C).

**Tests:** Layer 2 feed-filter assertions + Layer 3 dispatch tests minus
embedded-variant assertions (Phase 7+).

**Exit:** end-to-end visible — an `append_to` flow vanishes from the
top-level feed and shows as a stub inside its anchor. Feature wired.
Stubs are intentionally ugly; the kernel doesn't yet teach agents to
create embeds (see Phase 11).

## Phase 7 — InlineProseBlock (real)

**Scope:** `InlineProseBlock` replaces its stub with the real
`MarkdownRenderer` (rendered mode) + per-block `LineCommentRail`.
Theme-keyed `.prose-embed-frame` CSS.

**Tests:** prose block renders markdown via `.fm-prose`; comments on the
block appear on the block's own rail.

**Exit:** prose blocks render properly inline.

## Phase 8 — InlineFlowBlock (real)

**Scope:** `FlowCard` gains `variant?: "embedded"`. `InlineFlowBlock`
uses it. Stub replaced.

**Tests:** flow embedded-variant tests; `.flow-head` absent; canvas
present.

**Exit:** the headline embed kind (flow charts) renders properly.
**This is the first phase where the visible product matches the design.**

## Phase 9 — InlineFileBlock + InlineHtmlBlock

**Scope:** `FileCard` and `EmbedCard` gain `variant`. Stubs replaced.

**Tests:** Layer 5 file + html rows.

**Exit:** file + html embeds work inline.

## Phase 10 — InlineChoicesBlock + InlineTodoBlock + InlineToolUseBlock

**Scope:** the remaining cards. Stubs replaced.

**Tests:** Layer 5 rows for each.

**Exit:** all supported kinds work inline.

## Phase 11 — `/guide` recipe update (now safe)

**Scope:** update `packages/kernel/src/routes/guide.ts` to add the
"Composing documents" section with the 5 pitfalls. Update bundled skill
markdowns under `packages/kernel/assets/*-skill/f-mark/api.md`.

**Deferred to here** because review_2 noted: if `/guide` teaches the
feature before the renderer is real, agents will create embeds that
render as TODO stubs. Phases 6–10 finish the renderer first.

**Tests:** GET /guide body includes the new section + link to
`/best-practices`.

**Exit:** authors discover the feature; renderer is ready to receive it.

## Phase 12 — `BlockAccordion` (new component, keep AccordionMarkdown)

**Scope:** new `packages/renderer/src/render/BlockAccordion.tsx`
(review_1 finding 7). Each block = one fold; nested blocks = sub-folds.
**Lazy mounting** of closed folds is required (FlowCard mounts React
Flow + runs dagre on every mount — `FlowCard.tsx:31`).

`ProseCard` accordion mode switches to `BlockAccordion`.

**Tests:** Layer 4 from `tests.md` + perf test for 100+ blocks.

**Exit:** accordion mode works on composite docs; flat docs unaffected.

## Phase 13 — source mode + word count + polish

**Scope:**
- Source mode emits the round-trippable concatenated format
  (`<!-- f-mark:block … -->` markers + fenced JSON for non-prose).
- Word count = sum across prose blocks + synthetic legacy block.
- Orphan-embed badge styling pass.
- `LegacyContentMarker` styling for the synthetic legacy block.
- `.prose-embed-frame` final styling pass across themes.

**Tests:** Layer 6 visual checklist via `/browse`.

**Exit:** the doc looks deliberate.

## Phase 14 — final buddy + sonnet QA loop

Per the user's workflow steps 8-11. Triggered after Phase 13 ships.

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
| 2 | Comment migration — every call site touches it at once, incl. writes | Single atomic commit; write-body normaliser + Compose + client.ts in same PR; full comment regression suite in same commit |
| 6 | First visible feature change — stub rendering inside ProseCard | Stubs are obviously placeholder; manual sanity check in browser before merging |
| 12 | Accordion rewrite | Keep `AccordionMarkdown` alive; new `BlockAccordion` is additive |

## Commit policy

- Each phase: one commit on `main`, message
  `feat(composable-prose): phase N — <title>` (or `refactor` / `test`).
- If a phase commit goes red, fix forward — no amend, no force-push.
- After Phase 13 + the QA loop: tag complete in
  `planning/composable-prose/DONE.md`.

## Tombstone semantics for non-prose blocks (review_2 finding C)

`removed: true` lives on the prose schema only. A prose event with
`removed: true` and `supersedes: <X>` may target ANY kind X (flow, file,
html, etc.) — it acts as a generic "this block chain is dead" tombstone
regardless of the original kind. Aggregate honours this by suppressing
the entire revision chain when its live revision is a prose tombstone.

This means a "delete this flow chart" looks like:

```
POST /events/prose
{
  participant_id, content: "",
  append_to: "<anchor filename>",
  removed: true,
  supersedes: "<flow filename>"
}
```

The renderer sees the flow chain's live revision is a prose tombstone
and hides the chain.
