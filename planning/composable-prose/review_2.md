# Design Review 2 - Composable Prose

## A. Review 1 findings

1. PASS - Orphans now stay distinct from consumed blocks and remain in feed slices (`planning/composable-prose/plan.md:220`, `planning/composable-prose/plan.md:312`); sequencing caveat below.
2. PARTIAL - Helpers and listed migrations address read compatibility (`planning/composable-prose/plan.md:158`, `planning/composable-prose/plan.md:463`), but write-time `target` compatibility is still under-specified and misses `Compose`/client types (`packages/renderer/src/compose/Compose.tsx:273`, `packages/renderer/src/api/client.ts:31`).
3. PARTIAL - Slot preservation and tombstones are specified (`planning/composable-prose/plan.md:500`), but "kernel shape-only" conflicts with rejecting mismatched `append_to` by inspecting the superseded block (`planning/composable-prose/plan.md:209`, `planning/composable-prose/plan.md:502`).
4. PARTIAL - Aggregate cycle/fork handling is much better (`planning/composable-prose/plan.md:237`), but "sort everywhere" is only phased for renderer aggregate; the kernel reader is still timestamp-only today (`planning/composable-prose/phases.md:117`, `packages/kernel/src/events/reader.ts:69`).
5. PASS - The line-comment contract is now coherent: prose-text targets only, shape-only kernel validation, renderer degradation (`planning/composable-prose/plan.md:478`).
6. PASS - Non-prose stray fields get explicit schema lockdown (`planning/composable-prose/plan.md:183`, `planning/composable-prose/phases.md:73`), which addresses the current `...rest` persistence risk (`packages/kernel/src/routes/flow.ts:161`, `packages/kernel/src/routes/events.ts:241`).
7. PASS - `AccordionMarkdown` stays intact and composed docs get a new `BlockAccordion` (`planning/composable-prose/plan.md:513`, `planning/composable-prose/phases.md:211`).
8. PARTIAL - `isNamedAnchor()` is the right direction (`planning/composable-prose/plan.md:330`), but the named-only log filter still directly checks `payload.name` and is not explicitly in phase/tests scope (`packages/renderer/src/popovers/log-filter-types.ts:141`).
9. PASS - Legacy named prose content becomes a synthetic first block, including line-comment routing (`planning/composable-prose/plan.md:403`, `planning/composable-prose/phases.md:155`).

## B. Sequencing

The phase order is not safe as written. Phase 7 filters consumed blocks before Phase 9 gives anchors anything real to render, so an `append_to` event disappears from the top-level feed while `ProseCard` still ignores it (`planning/composable-prose/phases.md:132`, `planning/composable-prose/phases.md:140`; current top-level rendering is `Feed` plus `EventCard` at `packages/renderer/src/shell/Feed.tsx:18` and `packages/renderer/src/cards/EventCard.tsx:48`). Merge Phase 7 into Phase 9, or better into the first non-stub visible renderer phase.

Phase 2 is close, but it is not genuinely atomic yet. If `serializeProse` "never emits `target`" (`planning/composable-prose/phases.md:48`) before the prose POST route normalizes legacy target-only bodies, an old comment write can silently become a plain prose message because the route passes the request body straight to serialization today (`packages/kernel/src/routes/events.ts:107`, `packages/kernel/src/events/prose.ts:4`). Phase 2 must include a write-body normalizer, `Compose`, and `api/client.ts`; the prose route validator/schema can either come along there or must be proven not to drop/strip new fields.

The Phase 6/7 split is useful only for derivation versus behavior. Keep Phase 6 as no-visible-change aggregate work; do not ship Phase 7 alone. Also fix the test assignment: Phase 6 says no feed filtering (`planning/composable-prose/phases.md:124`), but Layer 2 already expects blocks absent from feed (`planning/composable-prose/tests.md:66`).

Something is missing between Phase 9 and Phase 11: flow blocks are hidden from the feed and rendered as TODO stubs (`planning/composable-prose/phases.md:155`, `planning/composable-prose/phases.md:184`). That is not shippable if `/guide` has already taught agents to create flow embeds (`planning/composable-prose/phases.md:106`). Either delay guidance, gate the feature, or land registry + feed filter + real prose/flow renderers as one visible slice.

## C. New issues / helper boundary

The helper boundary mostly passes the smell test. `getProseRole()` and `getCommentTarget()` are justified because the current role logic is scattered across aggregate, dispatch, rails, and panels (`packages/renderer/src/state/aggregate.ts:18`, `packages/renderer/src/cards/EventCard.tsx:48`, `packages/renderer/src/cards/LineCommentRail.tsx:115`, `packages/renderer/src/panels/right/RightComments.tsx:112`). `isNamedAnchor()` is also fine if it is just `getProseRole(e).kind === "anchor"` and every named-only surface uses it.

Do not let those helpers grow aggregate knowledge. `getCommentTarget()` should normalize shape, not live-rebind through supersession; aggregate owns live-parent resolution. Likewise `isComposableBlock()` should not duplicate prose-role logic in a second place.

Inline blocks need a real DOM anchor. The proposed wrapper only records `data-block-kind` (`planning/composable-prose/plan.md:441`), but existing comment focus scrolls to `[data-event-filename]` (`packages/renderer/src/panels/right/RightComments.tsx:190`) and top-level feed currently provides that wrapper (`packages/renderer/src/shell/Feed.tsx:56`). Add `data-event-filename={block.filename}` on `ProseInlineBlock` or right-panel comment focus breaks for embedded blocks.

The tombstone story is still leaky for non-prose blocks. `removed` is prose-only (`planning/composable-prose/plan.md:127`), while flow/file payloads only have `supersedes` today (`packages/shared/src/events.ts:86`, `packages/shared/src/events.ts:191`). Say explicitly that a prose tombstone may supersede any block kind, or flow/file removal remains undefined.

## D. Verdict

Another iteration needed. The single most important remaining issue is Phase 2 write-time comment compatibility: normalize legacy `target` on POST before serialization, include every internal writer (`Compose`, rails, right panel, overlay, file comments, client types), and land that atomically with the serializer/helper change. After that, the plan is close.
