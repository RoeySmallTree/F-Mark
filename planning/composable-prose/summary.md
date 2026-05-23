# Composable Prose — intent & strategy

## Intent

Let an agent build a long-form prose document **block-by-block** by posting
one event per content unit (markdown section, flow chart, file embed, etc.)
and having the renderer compose them into a **single** visual document
(one `ProseCard`).

The author flow looks like:

1. POST a named prose event — the **anchor** (header-only; carries the
   document title; no markdown content of its own).
2. POST further events with `append_to: <anchor filename>`. Each is a
   **block** of the document:
   - prose block (with optional `name` for a sub-section header),
   - flow chart,
   - file embed,
   - html widget,
   - choices / tool-use / todo,
   - anything future, by dropping a renderer into the registry.
3. The renderer collapses all of these into one `ProseCard`. Accordion mode
   treats every block as its own fold.

## Strategy

### Unified schema

Replace the existing `target: { file, lines }` (comment-mode marker) with a
single, more general field on every kind:

```ts
append_to?: string;            // parent event filename
mode?: "content" | "comment";  // prose-only; default "content"
lines?: [number, number];      // only with mode === "comment"
```

Prose with `name` and no `append_to` = an anchor (document).
Prose with `name` and `append_to` = a named sub-block.
Prose with `mode: "comment"` and `append_to` = a line-targeted comment.
Any kind with `append_to` and no `mode` (or `mode: "content"`) = a content
block of the doc.

`target` stays parseable for back-compat with existing sessions but is no
longer emitted.

### Kind-agnostic dispatch

A single registry in the renderer maps `EventKind → InlineRenderer`.
Adding a new kind = registering its inline variant. The top-level dispatch
in `EventCard` ignores any event with `append_to` (it's consumed inside
its anchor), modulo comments which keep their existing rendering path.

### Anchor supersession

The aggregate walks the `supersedes` chain so a block whose `append_to`
points at a superseded anchor re-binds to the live one.

### Author guidance

- `/guide` carries a minimal recipe (under 200 words).
- A new `/best-practices` endpoint hosts the long-form examples and patterns.

### What we explicitly chose

- Block composition over inline reference syntax.
- Anchor is header-only (no own content); doc body = the block list.
- All non-divider kinds are embeddable from day one; registry is open for
  future kinds without central edits.
- Embed once: a flow with `append_to` is rendered inline only, never as a
  top-level card.
- Accordion mode = block-list of folds (named block uses its name; unnamed
  uses a kind-default label).
- Kernel validation is **permissive** about anchor existence (renderer
  handles orphans), **strict** about mutual exclusion (mode/lines/name
  combinations).

## What's at stake

- Cleanest moment to land this: prose card was just rewritten with a
  sticky head and a clean body region; no footer to fight.
- Touches every kind's payload (one optional field each) and the renderer's
  dispatch + composition layers. No data migration required.
- Existing comments keep working: the parser maps legacy `target` to the
  new `append_to + mode=comment + lines` shape on read.

## Files

See `plan.md` for the full file list, edge-case table, and rationale.
Phased breakdown lives in `phases.md` (the smallest-possible-step plan).
Test plan in `tests.md`.

## Triage of review_1.md (round 1)

All 9 findings + missing edge cases — every one **accepted and applied**
to `plan.md` and `phases.md`. Summary disposition table:

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | High | Orphan embeds would be hidden | Aggregate now distinguishes `consumedBlocksByAnchor` from `orphanBlocks`; orphans stay in feed slices with a badge |
| 2 | High | `target` compat too narrow | Introduced `getProseRole`/`getCommentTarget`/`isNamedAnchor`/`getAppendTo` helpers in `packages/shared/`; every call site migrates atomically in Phase 2 |
| 3 | High | Block supersession needs replacement semantics | Sort by `rootOf(block).timestamp`; added explicit `removed: true` tombstone; preserve `append_to` on supersession (kernel-enforced) |
| 4 | High | Supersession cycles + forks | Visited-set cycle detection; lexicographic fork policy; deterministic `timestamp || filename` sort throughout |
| 5 | Medium | Line-comment contract too vague | `lines` valid only for prose-rendered text targets; renderer degrades invalid line-comments to card-level; basic `start <= end` validation |
| 6 | Medium | Non-prose `mode` rejection | Every event schema gets `additionalProperties: false`; explicit list of allowed properties per kind |
| 7 | Medium | AccordionMarkdown rewrite would break contract | Keep `AccordionMarkdown` (still serves `MarkdownRenderer`); add new `BlockAccordion` component for composed docs |
| 8 | Medium | Named sub-blocks in `named` rail | `isNamedAnchor()` helper used by `aggregate.named`, `RightNamed`, command palette, search |
| 9 | Medium | Legacy named prose with content | Render content as implicit "legacy first block"; small marker; comments with lines route to the synthetic block |
| — | — | Missing edge cases (10 items) | Added to plan's edge-case table; covered in `tests.md` Layer 2 |
| — | — | `/guide` should surface pitfalls inline | Added 5-bullet pitfall list to the `/guide` recipe; `/best-practices` still hosts the long-form examples |
| — | — | Phase boundaries | Re-sequenced `phases.md` to match review_1's recommended 7-step ordering, with helpers landing before behaviour changes |

## Triage of review_2.md (round 2)

review_2 confirmed 5 findings PASS, 4 PARTIAL, raised 3 new issues, and
flagged sequencing problems. **All addressed in the v2 plan + phases.**

| Item | Disposition |
|---|---|
| (2) Write-time `target` compat missed `Compose` / `client.ts` | Phase 2 now explicitly migrates `Compose.tsx`, `TargetPill.tsx`, `api/client.ts`, `log-filter-types.ts:141`, and adds a write-body normaliser at the prose POST handler |
| (3) Kernel can't enforce `append_to` preservation without lookup | Plan now defers append_to-mismatch handling to the **renderer aggregate**: if supersedor.append_to doesn't match superseded's, the supersedor is treated as a new top-level event. Kernel stays shape-only |
| (4) Sort everywhere — kernel reader still timestamp-only | Phase 2 includes `packages/kernel/src/events/reader.ts:69` switch to `timestamp \|\| filename` |
| (8) `isNamedAnchor` adoption missing `log-filter-types.ts:141` | Added to the Phase 2 migration list |
| (B) Phase 7-before-Phase-9 hides blocks before renderer is real | Phases v2 merges old Phase 7 into Phase 6 (atomic "turn on feature with stubs"); Phase 5 (`/guide`) deferred to Phase 11 after renderers are real |
| (B) Phase 2 atomicity — needs `Compose`/`client.ts`/normaliser | Phases v2 lists every consumer + normaliser in Phase 2's single commit |
| (B) Phase 6/7 split test mis-assignment | Phases v2 keeps Phase 5 (was 6) test-scope "derivation only"; feed-filter assertions move to Phase 6 (was 9) |
| (C) Helpers must NOT walk supersession | Plan now says explicitly: helpers shape-normalise only; aggregate owns live-parent resolution |
| (C) Inline blocks need `data-event-filename` | `ProseInlineBlock` wrapper sets `data-event-filename={block.filename}` |
| (C) Tombstone story leaky for non-prose blocks | `phases.md` now has an explicit "Tombstone semantics for non-prose blocks" section: a prose tombstone with `supersedes: <X>` may target any kind X |

**Verdict-resolved:** the v2 plan addresses review_2's "single most
important remaining issue" (Phase 2 write-time comment compat) by making
Phase 2's scope explicit and atomic, including `Compose`, `client.ts`,
and the prose POST normaliser. Proceeding to execute the plan; further
review happens via `/buddy` at the final-pass step (Phase 14).
