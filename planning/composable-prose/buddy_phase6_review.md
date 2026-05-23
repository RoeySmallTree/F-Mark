# Phase 6 Review

Reviewed `5c89808` (`git diff ab9140b..5c89808`). Line refs are anchored to the committed file content at that SHA, not later workspace state.

## Findings

1. **Medium: blocks can disappear when `append_to` names a visible non-anchor.** `aggregate.ts` treats any visible live filename as a consumable parent (`packages/renderer/src/state/aggregate.ts:129`-`145`) and then removes every consumed filename from `feed` / `feedDocument` / `feedConversation` (`packages/renderer/src/state/aggregate.ts:166`-`188`). But `Feed.tsx` only threads `blocks` when the parent is `isNamedAnchor(item.event)` (`packages/renderer/src/shell/Feed.tsx:83`-`86`). A flow/file/prose block appended to an unnamed message, standalone flow, file, etc. is filtered out and never rendered. For Phase 6, either only consume blocks whose resolved parent is a named anchor, or render/pass blocks through every supported parent.

2. **Low: orphan badge plumbing is missing from the Phase 6 scope.** Missing-anchor orphans do stay in the feed: unresolved parents go to `orphanBlocks` (`packages/renderer/src/state/aggregate.ts:139`-`141`) and are not added to `consumedFilenames` (`packages/renderer/src/state/aggregate.ts:161`-`164`). However, the Phase 6 docs say `EventCard` passes `orphanedAppendTo`; the commit only leaves a TODO-style comment and passes no prop (`packages/renderer/src/cards/EventCard.tsx:70`-`74`). The top-level card remains visible but has no orphan hint.

3. **Low: synthetic legacy content creates duplicate `data-event-filename` nodes.** `Feed.tsx` wraps each top-level card with `data-event-filename` (`packages/renderer/src/shell/Feed.tsx:71`-`73`), and the synthetic legacy block reuses the anchor filename (`packages/renderer/src/cards/ProseCard.tsx:136`-`143`, `:173`-`183`) inside a `ProseInlineBlock` wrapper that also sets `data-event-filename` (`packages/renderer/src/cards/ProseInlineBlock.tsx:76`-`80`). Comment/log focus still resolves because `querySelector` will find the outer feed wrapper first, but it will not target the synthetic block precisely. If precise inline focus matters, avoid the duplicate attribute or give the synthetic block a virtual id.

## Checks

Consumed-block filtering is correct for the intended anchor case: the same set is built from `consumedBlocksByAnchor` in both aggregate (`packages/renderer/src/state/aggregate.ts:161`-`164`) and `Feed.tsx` (`packages/renderer/src/shell/Feed.tsx:32`-`38`), and all three feed slices exclude it. `EventCard` early-outs before prose-role dispatch (`packages/renderer/src/cards/EventCard.tsx:63`-`68`), so it skips both prose blocks and non-prose embeds; call sites with `consumedFilenames` undefined still work (`ArbitraryGroupCard.tsx:90`-`96`).

`ProseInlineBlock` covers `prose`, `flow`, `file`, `html`, `choices`, `todo`, and `tool-use` (`packages/renderer/src/cards/ProseInlineBlock.tsx:55`-`63`), sets `data-event-filename`, and has a safe unsupported fallback. `Feed.tsx` still preserves view-mode slicing and projection while passing anchor blocks. Tests are meaningful for feed filtering, missing-parent orphan visibility, superseded-anchor rebind, early-out, and registry coverage, but they do not cover cycle/fork handling or the visible-non-anchor parent disappearance case.
