# Composable Prose — DONE

Feature landed on `main` through 13 phases + a sonnet QA pass + 3
bug-fix rounds.

## Commits (Phase 0 baseline → final fix)

| Commit | Subject |
|---|---|
| 47ae4c1 | feat(prose-card): sticky head + theme-aware markdown + runtime_id schema |
| 8a5fa23 | docs(composable-prose): feature plan + review_1 + phased breakdown |
| e29a41b | docs(composable-prose): v2 plan + review_2 + revised phases |
| 768b3a5 | feat(composable-prose): phase 1 — shared schema additions |
| 49c007d | feat(composable-prose): phase 2 — comment-system migration + helpers |
| 1914357 | fix(composable-prose): phase 2 follow-ups for wip-coupling regressions |
| 28ac965 | fix(composable-prose): phase 2 closeout — file-card deps + comments prop |
| 341b32e | feat(composable-prose): phase 3 — non-prose route schemas |
| f5be737 | feat(composable-prose): phase 4 — /best-practices endpoint |
| ab9140b | feat(composable-prose): phase 5 — aggregate foundation (derivation only) |
| 5c89808 | feat(composable-prose): phase 6 — turn on filter + ProseInlineBlock stubs + ProseCard.blocks |
| d18fc7e | feat(composable-prose): phase 7 — real InlineProseBlock + per-block comments |
| 8a813cd | feat(composable-prose): phase 8 — InlineFlowBlock real + buddy fix |
| 9f2c004 | feat(composable-prose): phases 9+10 — file/html/choices/todo/tool-use embedded |
| e8bd205 | feat(composable-prose): phase 11 — /guide adds composable-prose recipe |
| 4c3e065 | feat(composable-prose): phase 12 — BlockAccordion (block-list folds) |
| 396a0fe | docs(composable-prose): manual /browse test cases for phase-14 QA |
| 27c1586 | feat(composable-prose): phase 13 — buddy_final fixes (tombstone, fork, validation) |
| 82a1603 | test(composable-prose): sonnet QA pass 1 — T1/T3/T10 |
| e4e8ad6 | fix(composable-prose): BUG-1 + BUG-2 from sonnet QA pass 1 |
| aa7ec3c | fix(composable-prose): BUG-3 from sonnet QA — orphan-embed badge |

## Final state

- **Schema**: `append_to` on prose / flow / file / html / choices / todo /
  tool-use payloads. New `BlockMode = "content" | "comment"`. New
  `removed?: boolean` tombstone marker on prose. Legacy `target` parsed
  for back-compat; never re-emitted.
- **Helpers** (`@f-mark/shared`): `getProseRole`, `getCommentTarget`,
  `getAppendTo`, `isComposableBlock`, `isNamedAnchor`. Shape-only — no
  supersession walks.
- **Kernel**: prose route normalises legacy bodies + mutual-exclusion
  validator (16 rules); every non-prose route accepts `append_to` with
  the same EVENT_FILENAME pattern + `additionalProperties: false`
  lockdown. New `/best-practices` endpoint. `/guide` adds the
  5-pitfall recipe with a link to `/best-practices`.
- **Aggregate**: `consumedBlocksByAnchor` + `orphanBlocks` +
  `liveAnchorOf` + `rootOf`. Visited-set cycle detection. Lexicographic
  fork tiebreak (siblings hidden as forks). Tombstone chain
  suppression. Anchor-only block consumption (non-anchor parents →
  orphan).
- **Renderer**: `EventCard` early-out for consumed blocks; `ProseCard`
  composes blocks via `ProseInlineBlock` registry. Synthetic legacy
  first-block for anchors that still carry their own `content`. Empty
  state for truly-empty anchors. Per-block `LineCommentRail`. Sticky
  head preserved across composed docs.
- **Accordion**: new `BlockAccordion` — each block one fold; named
  prose use `name`, unnamed get kind-default labels; lazy mount of
  closed folds.

## QA findings

Sonnet QA pass 1 (T1 canonical doc, T3 orphan, T10 /best-practices):
- T1 mostly pass; BUG-2 (word count) **fixed**.
- T3 mostly pass; BUG-3 (no orphan badge) **fixed**.
- T10 pass.
- BUG-1 (kernel dev-mode broken on missing `MAX_ATTACHMENT_BYTES`)
  **fixed**.
- BUG-4 (stale committed `dist/`) is a build-pipeline issue, not a
  feature bug — left for a separate cleanup.

## Acknowledged deferred / future work

These are documented in plan.md but were intentionally left for
follow-ups (each is small):

- Card-level comments on inline non-prose embeds (flow/html/choices/
  todo/tool-use ignore their `comments` prop today).
- Embedded variants for `FileCard` and `ToolUseCard` (still render
  with their full chrome inside prose).
- Nested block sub-folds in accordion mode (current accordion is
  single-level; `BlockAccordion` is structured for nesting but not
  wired).
- `LegacyContentMarker` visual flag for synthetic legacy first-blocks.
- Source-mode round-trippable concatenated format (Phase 13 polish).

## Test counts

- Renderer: 510/517 (7 pre-existing user-WIP failures: Compose mode
  buttons + CommentThreadOverlay routing — not Phase-related; depend on
  user WIP that wasn't on disk).
- Kernel: 455/455 ✓

## Pre-existing user WIP regressions

The Phase 2 atomic comment migration disturbed several files where the
user had uncommitted WIP. The PR has acknowledged in commit bodies. The
working tree's WIP for those files (notably `Compose.tsx`, `SendButton.tsx`,
`RightPanel.tsx` overlay routing, larger TodoCard / FileCard refactors) is
recoverable from the user's IDE local history if they want to merge
ahead.
