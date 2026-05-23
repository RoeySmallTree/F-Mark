# Design Review 1 - Composable Prose

## Verdict

The block-composition model is the right direction. I would not implement it
as written yet: the plan has several places where the schema intent,
aggregate filtering, and existing comment system contradict each other. The
highest-risk area is preserving comments while `target` becomes
`append_to + mode + lines`.

## Findings

### 1. Orphan embeds would be hidden, despite the stated orphan badge behavior

Severity: High

The plan says a block whose parent is missing should render as a top-level card
with an "orphaned embed" badge (`planning/composable-prose/plan.md:191` and
`planning/composable-prose/plan.md:425`). But the proposed aggregate filters
all non-comment `append_to` events out of the feed
(`planning/composable-prose/plan.md:289`), and the proposed `EventCard`
early-out returns `null` for any non-comment event with `append_to`
(`planning/composable-prose/plan.md:298`).

In the current renderer, top-level visibility comes from `Feed` choosing one
of the aggregate slices (`packages/renderer/src/shell/Feed.tsx:18`) and then
rendering each item through `EventCard`
(`packages/renderer/src/shell/Feed.tsx:60`). `EventCard` is the only top-level
dispatcher for flow/file/html/etc. (`packages/renderer/src/cards/EventCard.tsx:68`
through `packages/renderer/src/cards/EventCard.tsx:113`). If an orphan is
removed from the aggregate slices or nulled by `EventCard`, there is nowhere
left for the badge to render.

Counter-proposal: have the aggregate classify `append_to` events into
`consumedBlocksByAnchor` and `orphanBlocks`. Only events whose resolved parent
is a visible composable parent should be removed from top-level feed slices.
Orphan blocks should stay in feed slices with an explicit `orphanedAppendTo`
marker, and `EventCard` should not globally null every `append_to` event.

### 2. The `target` compatibility plan is too narrow for the existing comment system

Severity: High

Mapping legacy frontmatter `target` to `append_to + mode=comment + lines` in
`parseProse` is necessary, but it is not enough. Today `target` is read and
written across the renderer and kernel:

- `aggregate` identifies comments with `payload.target`
  (`packages/renderer/src/state/aggregate.ts:18`) and fills
  `commentsByTarget` from `payload.target.file`
  (`packages/renderer/src/state/aggregate.ts:63`).
- `EventCard` hides target prose before named/message dispatch
  (`packages/renderer/src/cards/EventCard.tsx:48`).
- `LineCommentRail` groups existing comments by `payload.target?.lines`
  (`packages/renderer/src/cards/LineCommentRail.tsx:115`) and still posts new
  comments with `target` (`packages/renderer/src/cards/LineCommentRail.tsx:219`).
- `RightComments` groups and replies/resolves via `payload.target`
  (`packages/renderer/src/panels/right/RightComments.tsx:112`,
  `packages/renderer/src/panels/right/RightComments.tsx:169`,
  `packages/renderer/src/panels/right/RightComments.tsx:178`).
- `CommentThreadOverlay` does the same for focused threads
  (`packages/renderer/src/overlays/CommentThreadOverlay.tsx:243`,
  `packages/renderer/src/overlays/CommentThreadOverlay.tsx:279`,
  `packages/renderer/src/overlays/CommentThreadOverlay.tsx:290`).
- File comments still serialize a prose event with `target`
  (`packages/kernel/src/routes/files.ts:567`).

Counter-proposal: introduce a single normalization helper before touching the
renderer, for example `getProseRole(payload)` and
`getCommentTarget(payload)`. For a transition phase, parse legacy `target`
into the new fields and either retain `target` on the in-memory payload or
migrate every consumer in the same atomic change. Also add an explicit
write-time rule for prose: `target` may be accepted as a legacy alias, but it
must be mutually exclusive with `append_to`, `mode`, and `lines` on input.

### 3. Block supersession needs replacement semantics, not just hiding the old event

Severity: High

The edge-case table says "Author wants to remove a block -> Supersede with
empty content. Aggregate hides superseded events"
(`planning/composable-prose/plan.md:433`). Current supersession only hides the
event named by another event's `supersedes`
(`packages/renderer/src/state/aggregate.ts:34`). The superseding event remains
visible. If the replacement has empty content, it will still be a visible empty
block. If the replacement preserves `append_to`, it will also sort at the
replacement timestamp, so an edit to block 2 can jump to the end of a long
document because the planned block list is built from visible events in sorted
order (`planning/composable-prose/plan.md:274`).

Counter-proposal: define block supersession as "replace in original slot."
The aggregate should resolve a block's live revision, inherit the original
block's append parent unless explicitly changed, and sort by the root block's
first insertion key. For deletion, add a real tombstone rule such as
`removed: true`, or explicitly say that deletion is out of scope for v1. Empty
content alone is not enough because empty prose can be legitimate.

### 4. Supersession chains need cycle and fork semantics

Severity: High

The planned `liveAnchor` loop has a numeric depth cap but no visited-set cycle
detection (`planning/composable-prose/plan.md:268`). A cycle such as A
supersedes B and B supersedes A will return whichever node happens to be the
32nd step, not a meaningful live anchor. The `supersedorOf` map also overwrites
if two participants supersede the same anchor
(`planning/composable-prose/plan.md:263`), so concurrent anchor edits become an
implicit last-writer-wins branch selection.

This is especially risky because the current aggregate only tracks the set of
superseded filenames (`packages/renderer/src/state/aggregate.ts:34`) and does
not model revision branches. Multi-participant appends to the same anchor also
need deterministic ordering. The plan says timestamp ties break by filename
(`planning/composable-prose/plan.md:428`), but current sorting compares only
timestamps in the reader and aggregate (`packages/kernel/src/events/reader.ts:69`,
`packages/renderer/src/state/aggregate.ts:31`). Filenames include participant
and kind (`packages/shared/src/filenames.ts:15`), and `writeEventFile` only
bump-seconds on exact filename collision (`packages/kernel/src/events/writer.ts:54`),
so two participants can produce the same timestamp without a deterministic
tie-break.

Counter-proposal: sort everywhere by `timestamp || filename`. Implement
`liveAnchor` with a visited set and an explicit failure mode that marks the
block orphaned on supersession-cycle detection. Define fork policy now:
either reject superseding an already-superseded live anchor at write time,
select the newest branch deterministically and mark siblings as forks, or
render branches separately.

### 5. Line comments need a clearer target contract

Severity: Medium

The schema says `lines` are "inside the parent's rendered content"
(`planning/composable-prose/plan.md:143`), and later says comments with lines
on an empty header-only anchor should be rejected at write time
(`planning/composable-prose/plan.md:411`). That conflicts with the earlier
decision that the kernel should be permissive about parent existence
(`planning/composable-prose/plan.md:189`). The kernel cannot both avoid parent
lookup races and reject based on the target's rendered body.

The current line rail also shows why this needs precision: line positions are
computed from markdown source line count and a fixed line height
(`packages/renderer/src/cards/LineCommentRail.tsx:109`,
`packages/renderer/src/cards/LineCommentRail.tsx:149`), while right-panel
quoting assumes the target has prose `content`
(`packages/renderer/src/panels/right/RightComments.tsx:67`). That does not
translate cleanly to header-only anchors, flow charts, html widgets, choices,
or most file embeds.

Counter-proposal: define `lines` as valid only for prose-like rendered text
targets in v1. For non-prose targets and header-only anchors, comments should
be card-level (`mode: "comment"` without `lines`). Keep the kernel validation
shape-only unless a route has already resolved the target, and let the
renderer degrade invalid legacy line comments to card-level badges. Also add
basic line validation: positive integers and `start <= end`.

### 6. The non-prose `mode` rejection will not happen automatically

Severity: Medium

The design says `mode` is prose-only and non-prose events with `mode` should
400 (`planning/composable-prose/plan.md:203`). I agree that `mode` belongs
only on prose payloads. But the current JSON schemas do not set
`additionalProperties: false`, and some routes persist `...rest`.
`flow` destructures `{ participant_id, supersedes, ...rest }` and writes
`rest` into the payload (`packages/kernel/src/routes/flow.ts:161`).
`choices` does the same (`packages/kernel/src/routes/events.ts:241`).
Without explicit validation, a stray `mode` or `lines` can be persisted rather
than rejected.

Counter-proposal: add a small shared validation helper per route family:
reject `mode`, `lines`, and `target` on non-prose bodies; reject `append_to`
on `turn-end` and probably on `choice`; reject `lines` unless the event is
prose comment mode. If using JSON Schema for this, add
`additionalProperties: false` carefully and update each schema's allowed
properties at the same time.

### 7. Rewriting `AccordionMarkdown` directly would break its current contract

Severity: Medium

`MarkdownRenderer` currently dispatches `mode === "accordion"` to
`AccordionMarkdown` with a plain markdown `content` string
(`packages/renderer/src/render/MarkdownRenderer.tsx:25`). `AccordionMarkdown`
parses that string into H1/H2 sections (`packages/renderer/src/render/AccordionMarkdown.tsx:21`)
and its props are only `{ content, className }`
(`packages/renderer/src/render/AccordionMarkdown.tsx:109`). The proposed
composed-doc accordion is a block-list renderer, not a markdown-string
renderer.

Counter-proposal: keep `AccordionMarkdown` for markdown content and add a new
`BlockAccordion` or `ComposedProseAccordion` that takes `blocks` plus the
inline renderer registry. `ProseCard` can choose between rendered block list
and block accordion. Inline prose blocks should render their markdown content
inside the fold body; they should not ask `MarkdownRenderer` to accordionize
the block again unless nested heading accordions are explicitly desired.

### 8. Named sub-blocks should stay out of the global named rail, but this is not "unaffected"

Severity: Medium

The design decision is right: named sub-blocks belong to their parent
document, not the global named rail. But the current aggregate includes every
named prose event (`packages/renderer/src/state/aggregate.ts:62`), and the
right named rail jumps to an element with the named event's filename
(`packages/renderer/src/panels/right/RightNamed.tsx:18`). Once embedded
blocks are removed from top-level feed rendering, a named sub-block in that
rail would point to no top-level `data-event-filename`.

Counter-proposal: create and reuse an `isNamedAnchor(e)` helper:
`kind === "prose"`, non-empty `name`, no comment target, and no content
`append_to`. Use it for `aggregate.named`, document feed anchor filtering,
right rail, command palette named entries, and any search facet that means
"named contribution."

### 9. Legacy named prose content needs read-compat even without data migration

Severity: Medium

The plan says anchor markdown is not rendered and an empty state appears when
there are no blocks (`planning/composable-prose/plan.md:315`). Current
`ProseCard` renders `payload.content` through `LineCommentRail`
(`packages/renderer/src/cards/ProseCard.tsx:127`) and computes the card word
count from that content (`packages/renderer/src/cards/ProseCard.tsx:36`).
Existing sessions can contain named prose with real content, not header-only
anchors.

This does not require data migration, but it does require read compatibility.
Counter-proposal: if a named prose anchor has non-empty `content` and no
composed blocks, render that content as an implicit legacy first block. If it
has both legacy content and new blocks, either render the legacy content first
with a small legacy marker or document a one-time author supersession path.

## Missing Edge Cases To Add

- Comments targeting a block that later gets superseded: decide whether they
  stay attached to the hidden historical block, rebind to the live block, or
  appear on the replacement as "from previous version." Line ranges may be
  stale after replacement.
- A block supersedes another block but omits `append_to`: decide whether the
  replacement inherits the old parent or becomes a top-level event.
- A block supersedes another block and preserves `append_to`: keep its original
  document position instead of moving it to the replacement timestamp.
- Supersession loops: A supersedes B, B supersedes A, and longer cycles.
- Append loops: a block appends to itself, or A appends to B while B appends to
  A. The renderer depth cap should also have visited-set cycle detection.
- Concurrent anchor supersession by two participants.
- Same-second appends by different participants to one anchor. Use
  `timestamp || filename` ordering.
- Large composed docs with many embedded flows: grouping by anchor is fine as
  O(n), but rendering every `FlowCard` mounts React Flow and runs layout
  (`packages/renderer/src/cards/FlowCard.tsx:31`). Consider lazy mounting
  closed folds or at least testing 100+ blocks.
- `append_to` points at a non-composable event such as `choice` or `turn-end`.
- `lines` on non-prose targets, header-only anchors, empty prose blocks, and
  prose blocks rendered only inside a collapsed fold.
- Legacy `target` plus new `append_to` in the same prose file. New fields
  should win only if that is explicit; otherwise reject new writes and warn on
  reads.

## Suggested Phase Boundaries

The user request called out the phase decomposition as missing; a
`planning/composable-prose/phases.md` file appeared in the workspace during
this review. Its broad sequence is close, but I would revise the boundaries
below before implementation because the current phase draft still allows
comments/orphans to disappear temporarily and still rewrites
`AccordionMarkdown` directly.

Natural atomic steps:

1. Schema helpers only: add shared types plus normalized helpers for
   `append_to`, comment target, named anchor detection, and supersession
   ancestry. Keep rendering behavior unchanged.
2. Prose parser/serializer and kernel validation: accept legacy `target`,
   emit new comment shape, add mutual-exclusion validation, and migrate all
   comment-writing routes/client calls together. This is the highest regression
   risk for the existing comment system.
3. Aggregate foundation: add deterministic sort, revision-chain resolution,
   `blocksByAnchor`, `orphanBlocks`, and anchor-only `named`. Do not yet hide
   embedded events until orphan handling is proven in tests.
4. Renderer prose-only composition: support anchors plus prose blocks, with
   legacy named prose fallback and comments still passing through all existing
   rails and right-panel flows.
5. Non-prose inline registry one kind at a time: flow first, then file/html,
   then choices/todo/tool-use. Each kind gets embedded variant tests before
   the next kind lands.
6. Accordion/source/copy/word-count pass: add block accordion as a new
   component, update copy/source semantics, and test large docs.
7. Agent guidance: update `/guide`, add `/best-practices`, and include examples
   that use the final schema.

The steps most likely to regress existing comments are step 2 and step 3,
because current comments depend on `target` in aggregation, pins, right-panel
thread grouping, reply/resolve POSTs, and file-comment routes.

## Author And Agent Guidance

The pull-only `/best-practices` endpoint is useful, but it is not sufficient by
itself. The existing `/guide` is the live onboarding surface and already
includes the full protocol payload after the initial setup text
(`packages/kernel/src/routes/guide.ts:101`). Agents often follow the first
recipe that looks adequate and will not necessarily fetch another endpoint.

Recommendation: keep `/guide` short, but include the most common pitfalls in
the minimal recipe:

- Start with a named prose anchor and keep new anchors header-only.
- Append every document part with `append_to: <anchor filename>`.
- Use prose `mode: "comment"` for comments; do not put `name` on comments.
- Use `lines` only for prose-text targets.
- Preserve `append_to` when superseding a block.
- Named sub-blocks do not appear in the global named rail.

Then link to `/best-practices` for full JSON examples and uncommon patterns.
