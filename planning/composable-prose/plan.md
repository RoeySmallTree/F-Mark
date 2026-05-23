# Composable Prose — embedding flows (and other event kinds) inside a named prose document

> Revised after review_1. See `summary.md` "Triage" section for the
> disposition of every review finding.

## Goal

Let an agent author a long prose document that contains **typed embeds** —
flow charts, prose sub-sections, files, html widgets, choices, tool-use
panels — by **writing the document in blocks**, one POST per block, and
having the renderer compose them back into a single visual document.

Author flow:

```
[anchor prose: name = "Architecture overview"]
  (header-only; no markdown body)

[prose block, append_to = anchor.filename]
  (intro paragraph + first section)

[flow event, append_to = anchor.filename]
  (a flow chart slots in here)

[prose block, append_to = anchor.filename, name = "Data flow"]
  (a named sub-section)

[flow event, append_to = anchor.filename]
  (a second flow chart)
```

The renderer collapses these into **one ProseCard**: anchor head pinned on
top, each block rendered inline beneath in event-arrival order. Accordion
view treats every block as its own fold.

## Why now

Flow events landed in v0.4. Standalone-only rendering breaks the flow of
long documents. The prose card was just rewritten (sticky head, clean body,
no footer); embeds slot in naturally.

## Decided answers to open questions (user input)

1. **Scope** — include all non-divider kinds (prose, flow, file, html,
   choices, tool-use, todo); the renderer's inline dispatcher is **kind-
   agnostic** (registry pattern) so future kinds work automatically.
2. **Anchor as header or with content** — **header-only.** All content
   lives in blocks. Legacy named prose with content gets a read-compat
   fallback (rendered as an implicit legacy first block; see Finding #9
   in `review_1.md`).
3. **Unify `target` with `append_to` + `mode`** — yes; see schema below.
   Back-compat handled by a normalization helper used by every consumer,
   not by parser-only translation (per Finding #2 in `review_1.md`).
4. **Anchor supersession** — walk the supersedes chain in the aggregate,
   with cycle detection, deterministic fork policy, and slot preservation
   on block supersession (per Findings #3 and #4 in `review_1.md`).
5. **Guide** — minimal recipe in `/guide` **including the 5 most common
   pitfalls inline** (per Finding's author-guidance section); detailed
   examples at `/best-practices`.
6. **Standalone-or-embedded toggle** — no dup; **and** accordion mode
   treats every block as its own fold.

## Current state — what we're building on

### Event model

- Append-only log under `.f-mark/sessions/<sid>/`. Files named
  `<ts>_<participant>.<kind>.<ext>`. Filenames = stable IDs.
- Prose carry markdown + YAML frontmatter (`ProseFrontmatter`,
  `packages/shared/src/events.ts:17`) with `name`, `target`, `in_reply_to`,
  `supersedes`, `arbitrary`.
- Flow / file / html / choices / todo / tool-use have their own payloads.

### Comment system today — every call site `target` is read

The Phase-2 (parse-layer) back-compat is **not enough**: many consumers
read `target` directly. They all need to migrate together with the schema
change.

| File | What it reads from `target` |
|---|---|
| `packages/renderer/src/state/aggregate.ts:18, :63` | identifies comments + builds `commentsByTarget` |
| `packages/renderer/src/cards/EventCard.tsx:48` | hides comment prose from top-level dispatch |
| `packages/renderer/src/cards/LineCommentRail.tsx:115, :219` | reads existing comments + posts new ones |
| `packages/renderer/src/panels/right/RightComments.tsx:67, :112, :169, :178` | groups, quotes, replies, resolves |
| `packages/renderer/src/overlays/CommentThreadOverlay.tsx:243, :279, :290` | thread overlay equivalents |
| `packages/kernel/src/routes/files.ts:567` | file-comment route still emits `target` |

### Renderer dispatch

`EventCard.tsx` routes per kind+shape; only top-level dispatcher for flow /
file / html / etc. (`packages/renderer/src/cards/EventCard.tsx:68-113`).

### Aggregate

`packages/renderer/src/state/aggregate.ts` hides superseded events and
exposes `feed`, `feedDocument`, `feedConversation`, `named`,
`commentsByTarget`. The `Feed` shell picks one of those slices
(`packages/renderer/src/shell/Feed.tsx:18-60`).

## Unified schema

### `packages/shared/src/events.ts`

```ts
/** Role inside a parent event. Only meaningful when `append_to` is set
    on a prose event. Other kinds are always "content". */
export type BlockMode = "content" | "comment";

export interface ProseFrontmatter {
  /** Anchor-document name OR named sub-section name. */
  name?: string;
  /** Filename of the parent event (anchor prose, or another block). */
  append_to?: string;
  /** "content" (default when append_to set) for a block; "comment" for an
      annotation that targets a line range. Ignored when append_to unset. */
  mode?: BlockMode;
  /** Inclusive 1-based line range inside the parent's rendered content.
      Valid ONLY when (a) `mode === "comment"` AND (b) the parent is a
      prose-like rendered-text target (prose anchor with non-empty body,
      or a prose block). For non-prose or header-only parents, a comment
      must be card-level (no `lines`). */
  lines?: [number, number];
  in_reply_to?: string;
  supersedes?: string;
  arbitrary?: boolean;
  /** Block is a logical tombstone — renderer should suppress its revision
      chain from the parent's block list (and clean up associated comments).
      Mutually exclusive with rendered content (and with `mode: "comment"`). */
  removed?: boolean;
  /** @deprecated Use `append_to` + `mode: "comment"` + `lines`. Read by
      the parser for back-compat; serializer never emits it. */
  target?: ProseTarget;
}

// Each of these gains `append_to?: string`:
// FlowPayload, FileRefPayload, HtmlManifest, ChoicesPayload, TodoPayload,
// ToolUsePayload. (NOT ChoicePayload, NOT TurnEndPayload.)
```

`mode` belongs **only** on prose payloads. Non-prose embeds are always
"content".

### Back-compat at the parse layer + helpers

`packages/kernel/src/events/prose.ts:parseProse` maps legacy `target`:

```ts
if (parsed.target && parsed.append_to === undefined) {
  out.append_to = parsed.target.file;
  out.mode = "comment";
  if (parsed.target.lines) out.lines = parsed.target.lines;
}
// Reject reads where BOTH legacy target and new append_to are present
// — log a warning and prefer the new fields.
```

**Plus** the dedicated normalization helpers used by every consumer:

```ts
// packages/shared/src/proseRoles.ts (new)
export type ProseRole =
  | { kind: "message" }
  | { kind: "anchor"; name: string }
  | { kind: "named-block"; name: string; anchor: string }
  | { kind: "unnamed-block"; anchor: string }
  | { kind: "comment"; anchor: string; lines?: [number, number] }
  | { kind: "tombstone"; anchor: string };

export function getProseRole(p: ProsePayload): ProseRole;

// packages/shared/src/blocks.ts (new)
export function isComposableBlock(e: AnyEventRecord): boolean;
export function getAppendTo(e: AnyEventRecord): string | undefined;
export function isNamedAnchor(e: AnyEventRecord): boolean;
// (etc.)
```

These centralise the logic so the renderer's dozen call sites stop reading
`target` directly. Migrating every call site to the helpers is part of
Phase 2 (atomic with the parser change) — see `phases.md`.

### Mutual-exclusion validation (kernel)

Implemented in a single helper used by every prose-write route:

| Rule | Result |
|---|---|
| `mode` set without `append_to` | 400 |
| `lines` set with `mode !== "comment"` | 400 |
| `lines` set without `mode === "comment"` (no append_to) | 400 |
| `lines` with start <= 0, end < start, non-integer | 400 |
| `mode === "comment"` + `name` set | 400 |
| `mode === "comment"` + `removed === true` | 400 |
| `removed === true` + `content` non-empty | 400 |
| Both legacy `target` and new `append_to` set in body | 400 |
| `append_to === ""` | 400 |
| `append_to` not matching event-filename pattern | 400 |
| `mode` field present on a non-prose event | 400 (Finding #6) |
| `lines` field present on a non-prose event | 400 |
| `target` field present on a non-prose event | 400 |
| `append_to` on `turn-end` or `choice` | 400 |

For non-prose routes (flow, file, html, choices, todo, tool-use), the
JSON Schema gets `additionalProperties: false` and explicitly lists every
allowed key, **stopping the `...rest` spread from persisting strays**
(Finding #6).

Kernel validation is **shape-only**: it does not look up the parent. The
renderer handles orphans (Finding #5).

## Aggregate redesign (Finding #1, #4, #8)

### `Aggregated` interface additions

```ts
export interface Aggregated {
  // …existing…

  /** Blocks whose resolved parent is a live composable parent. */
  consumedBlocksByAnchor: Map<string, AnyEventRecord[]>;

  /** Blocks whose append_to points at a missing OR superseded-without-
      successor parent. These STAY in feed slices and render as top-level
      cards with an "orphaned embed" badge. */
  orphanBlocks: Set<string>; // filenames

  /** Live anchor filename for any superseded anchor, walking the chain. */
  liveAnchorOf: Map<string, string>;

  /** Block revision chains. The renderer uses each block's *root* filename
      to determine slot order, so an edit-in-place doesn't jump to the end. */
  rootOf: Map<string, string>; // any-revision filename → root filename
}
```

### Construction outline

```ts
// 1) Deterministic sort everywhere: timestamp, then filename, then kind.
const sorted = [...events].sort(byTimestampThenFilename);

// 2) Supersedes map with FORK detection.
//    `supersedorOf: Map<old → list-of-new>`. If the list has length > 1,
//    that's a fork. Fork policy: deterministic — pick the lexicographically
//    smallest filename among siblings as the canonical successor; siblings
//    are exposed as `forks` but not auto-rendered. Document a warning.
const supersedorOf = new Map<string, string[]>();
for (const e of sorted) {
  const sup = (e.payload as { supersedes?: string }).supersedes;
  if (typeof sup !== "string") continue;
  const list = supersedorOf.get(sup) ?? [];
  list.push(e.filename);
  supersedorOf.set(sup, list);
}

// 3) liveAnchor with VISITED-SET cycle detection.
function liveAnchor(start: string): string | "cycle" {
  const seen = new Set<string>();
  let cur = start;
  while (supersedorOf.has(cur)) {
    if (seen.has(cur)) return "cycle";
    seen.add(cur);
    const siblings = supersedorOf.get(cur)!;
    siblings.sort();
    cur = siblings[0]!;
  }
  return cur;
}

// 4) rootOf: walk supersedes backward (each event's `supersedes` field).
//    Build the inverse-of-supersedorOf map, but since we just want the
//    root of each chain, follow `event.payload.supersedes` until none.
//    Cycle-guard the same way.

// 5) Group blocks by their LIVE anchor; track orphans separately.
const consumedBlocksByAnchor = new Map<string, AnyEventRecord[]>();
const orphanBlocks = new Set<string>();
const visibleFilenames = new Set(visible.map((e) => e.filename));

for (const e of visible) {
  const appendTo = getAppendTo(e);
  if (typeof appendTo !== "string" || appendTo.length === 0) continue;
  const role = e.kind === "prose" ? getProseRole(e.payload).kind : "content";
  if (role === "comment") continue; // comments stay on the comments path

  const live = liveAnchor(appendTo);
  if (live === "cycle" || !visibleFilenames.has(live)) {
    orphanBlocks.add(e.filename);
    continue;
  }
  const list = consumedBlocksByAnchor.get(live) ?? [];
  list.push(e);
  consumedBlocksByAnchor.set(live, list);
}

// 6) Sort each anchor's block list by:
//    rootOf(block.filename).timestamp || rootOf(block.filename)
//    so block edits keep their slot.
for (const [anchor, blocks] of consumedBlocksByAnchor) {
  blocks.sort((a, b) => sortByRootKey(a, b, rootOf, eventsByFilename));
}

// 7) commentsByTarget unchanged; built from getProseRole === "comment".
//    Comments that target a superseded parent re-bind to the live parent
//    via liveAnchor (Finding #5 edge case).

// 8) Block tombstones: if a block's live revision is a tombstone
//    (`removed === true`), the entire revision chain is suppressed from
//    the parent's block list AND its child comments are flagged.

// 9) feed/feedDocument/feedConversation EXCLUDE only consumed blocks,
//    not orphans. Orphans stay visible at top level.
```

### Feed-slice filter

```ts
function isConsumedBlock(e: AnyEventRecord, consumed: Set<string>): boolean {
  return consumed.has(e.filename);
}
const consumedSet = new Set(
  Array.from(consumedBlocksByAnchor.values()).flatMap((bs) => bs.map((b) => b.filename))
);
const feed = visible.filter((e) =>
  !proseIsComment(e) && e.kind !== "choice" && !isConsumedBlock(e, consumedSet),
);
```

### Named rail (Finding #8)

Add `isNamedAnchor(e)` to the shared helpers and use it in:
- `aggregate.named`
- `RightNamed.tsx`
- Command palette named entries
- Search facets where "named" appears

```ts
export function isNamedAnchor(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  const role = getProseRole(e.payload as ProsePayload);
  return role.kind === "anchor";
}
```

Named sub-blocks (role === "named-block") never appear in the named rail.

## Dispatch (Finding #1 + #2)

`EventCard.tsx`:

```ts
const role = event.kind === "prose"
  ? getProseRole(event.payload as ProsePayload)
  : null;

// Comment path (legacy + new) — unchanged behaviour.
if (role?.kind === "comment") return null;

// Consumed block — rendered inside its anchor.
if (consumedFilenames.has(event.filename)) return null;

// Orphan block — render as top-level card with badge (default kind handler
// + a visual "orphaned embed" badge that the embedded-variant card
// signals via a prop, e.g. `orphanedAppendTo={<missing anchor name>}`).
const orphanedAnchor = orphanBlocks.has(event.filename) ? appendTo : null;

// …existing kind-switch, with orphanedAnchor passed through…
```

The `consumedFilenames` set is derived from the aggregate and threaded
through `Feed` into `EventCard`.

## ProseCard composition

`ProseCard` accepts `blocks: AnyEventRecord[]` (already in the anchor's
slot in `consumedBlocksByAnchor`). The body becomes:

```tsx
<div className="prose-body">
  {frontmatterEntries.length > 0 && /* existing frontmatter row */}
  {legacyAnchorContent && (
    <ProseInlineBlock
      event={syntheticLegacyBlock(event)}
      participants={participants}
      comments={legacyContentComments}
      mode={mode}
    />
  )}
  {blocks.length === 0 && legacyAnchorContent === null && <ProseEmptyState />}
  {blocks.map((b) => (
    <ProseInlineBlock
      key={b.filename}
      event={b}
      participants={participants}
      comments={commentsForBlock(b.filename)}
      mode={mode}
    />
  ))}
</div>
```

### Legacy named prose with content (Finding #9)

If the anchor's `payload.content` is non-empty, treat it as an implicit
"legacy first block" by synthesising a virtual prose-block event from it.
This block uses the anchor's filename as its key (no real event). Comments
that target the anchor with `lines` still route to this synthetic block.

If both legacy content AND real blocks exist, the synthetic block renders
first followed by the real blocks. A small `LegacyContentMarker` ("from
legacy named prose") shows next to the synthetic block to nudge authors
toward migrating.

### Empty state

`ProseEmptyState` shows when there's neither legacy content nor blocks —
a "this document is empty; the author hasn't appended any blocks yet"
placeholder.

### `ProseInlineBlock` — registry dispatcher

```tsx
type InlineProps = {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  mode: MarkdownMode;
};

const INLINE_RENDERERS: Partial<Record<EventKind, FC<InlineProps>>> = {
  prose: InlineProseBlock,
  flow: InlineFlowBlock,
  file: InlineFileBlock,
  html: InlineHtmlBlock,
  choices: InlineChoicesBlock,
  todo: InlineTodoBlock,
  "tool-use": InlineToolUseBlock,
};

export function ProseInlineBlock(props: InlineProps): JSX.Element {
  const R = INLINE_RENDERERS[props.event.kind];
  if (!R) return <UnsupportedBlock event={props.event} />;
  // data-event-filename is REQUIRED — right-panel comment focus scrolls
  // to `[data-event-filename]` (RightComments.tsx:190). Without it,
  // comment-click-to-scroll breaks for embedded blocks (review_2 finding C).
  return (
    <div
      className="prose-embed-frame"
      data-block-kind={props.event.kind}
      data-event-filename={props.event.filename}
    >
      <R {...props} />
    </div>
  );
}
```

Adding a new kind = register a renderer. The dispatcher is open for
extension.

## Comment system (Finding #2, #5)

### Schema-level

- New writes use `append_to + mode=comment + lines?`.
- Read parser accepts legacy `target`; emits a warning if BOTH legacy and
  new fields appear in the same file.

### Helpers used everywhere

Every site that previously read `payload.target.file` switches to
`getCommentTarget(payload)`. Every site that filtered by "is comment"
switches to `getProseRole(payload).kind === "comment"`. Helpers are
**shape-normalisers only** — they do NOT walk supersession; live-parent
resolution remains aggregate-owned (review_2 finding C).

Migration targets in one atomic Phase (see `phases.md` Phase 2):

- `packages/renderer/src/state/aggregate.ts`
- `packages/renderer/src/cards/EventCard.tsx`
- `packages/renderer/src/cards/LineCommentRail.tsx` (read + write)
- `packages/renderer/src/panels/right/RightComments.tsx`
- `packages/renderer/src/overlays/CommentThreadOverlay.tsx`
- `packages/renderer/src/compose/Compose.tsx` (writes new comments)
- `packages/renderer/src/compose/TargetPill.tsx`
- `packages/renderer/src/api/client.ts` (postProse type + comment helper)
- `packages/renderer/src/popovers/log-filter-types.ts` (named-only check
  switches to `isNamedAnchor`)
- `packages/kernel/src/routes/files.ts` (file-comment serialization)

### Write-body normalization in the prose POST route

The prose POST handler maps legacy `target` on the **request body**
(before serialization) to the new shape — so an old client that still
sends `{ content, target: { file, lines } }` is translated to
`{ content, append_to, mode: "comment", lines }` before the validator and
`serializeProse` see it. Reject 400 if the body contains BOTH legacy
`target` and any of the new fields (`append_to`, `mode`, `lines`). This
covers external authors who haven't yet migrated, while internal callers
get migrated via the helpers above.

The kernel reader (`packages/kernel/src/events/reader.ts:69`) gets the
deterministic `timestamp || filename` sort (review_2 finding 4); this
matches the aggregate so both sides agree on order.

### Lines target contract (Finding #5)

- `lines` valid only when the parent is a **prose-like rendered-text
  target** — i.e. a prose anchor with non-empty content, a prose block, or
  the synthetic legacy block.
- For other parents (header-only anchors, flow charts, html widgets,
  choices, files, tool-use), comment-mode must be **card-level** (no
  `lines`).
- Kernel validation is shape-only — it doesn't look up the parent. The
  renderer degrades invalid line-comments to card-level badges and logs
  a console warning.
- Basic line sanity at the kernel: positive integers, start <= end.

### Comment supersession & block supersession interactions (Finding #5
### missing-edge-cases)

- Comment on a block whose live revision changed: re-bind to the live
  block. Show a small "from previous version" marker if the comment was
  authored against an older revision and its lines may be stale.
- Comment on a block that's been tombstoned: hide the comment, log a
  console-only warning.

## Block supersession (Finding #3)

- A block can supersede another block; the supersedor SHOULD preserve
  `append_to` (the renderer relies on it for slot determination via
  `rootOf`).
- **Kernel validation is shape-only** by default (no parent lookup).
  Mismatched `append_to` between a supersedor and its target is handled
  by the renderer's aggregate: if `supersedor.append_to !== superseded.append_to`,
  the supersedor is treated as a NEW top-level event (or new orphan if it
  has its own `append_to` pointing nowhere live). This matches review_2's
  "kernel-shape-only" constraint without losing the slot-preservation
  property (review_2 finding 3).
- The block list inside an anchor is sorted by `rootOf(block).timestamp`
  + `rootOf(block).filename`, so an edit-in-place keeps its original slot.
- Deletion uses an explicit `removed: true` tombstone on a prose event
  (Phase 2 schema addition). A prose tombstone may supersede ANY block
  kind — i.e. a tombstone is a generic "this block chain is dead"
  marker regardless of the original block's kind (review_2 finding C).
  Aggregate suppresses the tombstoned chain from the anchor's block list
  and hides any comments that target it.
- Empty content alone is **not** deletion — a deliberately-empty prose
  block stays visible.

## Accordion mode (Finding #7)

- KEEP `AccordionMarkdown` — it still serves `MarkdownRenderer` for any
  markdown-only accordion view.
- ADD `BlockAccordion` (new) under `packages/renderer/src/render/`:
  - Props: `blocks: AnyEventRecord[]`, `participants`, `commentsFor:
    (filename) => events`, etc.
  - Each block = one fold:
    - Title: block's `name` if present; kind-default otherwise
      ("Section N" / "Flow chart N" / etc.).
    - Body: rendered via the inline renderer for that kind.
    - Initial state: all open (v1).
  - Nested blocks render as sub-folds.
  - **Lazy mounting of folds is required for perf** (Finding's missing-
    edge case): each closed fold delays mounting its body until first open
    — particularly important because FlowCard mounts React Flow which runs
    dagre layout on every mount
    (`packages/renderer/src/cards/FlowCard.tsx:31`).
- `ProseCard` in `accordion` mode renders `BlockAccordion` instead of
  passing through `MarkdownRenderer`'s accordion path.

## Source mode

Concatenated source: serialise each block in order, prefixed by an
HTML-comment marker:

```
<!-- f-mark:block kind=prose file=20260523T122000Z_ag-claude.prose.md -->
…prose markdown…

<!-- f-mark:block kind=flow file=20260523T122005Z_ag-claude.flow.json -->
```json
{ … flow payload … }
```
```

Round-trippable: a user can paste this into a new session via paired POSTs
(out of scope for v1, but the format leaves the door open).

## Word count

Sum of words across prose blocks plus the synthetic legacy block.
Non-prose blocks don't contribute.

## Edge cases — comprehensive

| Case | Behaviour |
|---|---|
| Block references a non-existent anchor | `orphanBlocks` set; rendered as top-level card with "orphaned embed" badge. |
| Block references a superseded anchor | `liveAnchor` walks the chain; block re-binds to the live anchor. |
| Anchor supersession chain has a cycle (A→B→A) | `liveAnchor` returns "cycle"; all dependents become orphans. |
| Anchor supersession fork (A is superseded by both B and C) | Deterministic pick: lexicographically smallest filename among siblings is canonical; siblings exposed as `forks` (rendered as orphans for v1). |
| Block supersedes another block, omits `append_to` | 400 at kernel — supersedors must preserve append_to. |
| Block supersedes another block, preserves `append_to` | Renders in the original slot (sorted by `rootOf`). |
| Two blocks with identical timestamp from different participants | Tiebreak by filename (deterministic). |
| Comment targets a block that gets superseded | Re-bind to live block; show "from previous version" marker if lines now stale. |
| Comment targets a block that gets tombstoned (`removed: true`) | Hide the comment; log a console warning. |
| Block tombstoned (`removed: true`) | Entire revision chain suppressed from parent's block list. |
| Block nested under another block | Allowed. Block has its own block list (recursive). Accordion uses sub-folds. Depth-32 cycle guard. |
| Append loop (A's append_to → B; B's append_to → A) | Cycle-detected at aggregate; both become orphans. |
| Block arrives before its anchor in a stream | Aggregate re-derives on every events update; orphan briefly, then absorbs. |
| User-authored block on an agent's anchor | Allowed. Doc accent stays anchor's. |
| `mode: "content"` with `lines` | 400 at kernel. |
| `mode` set on a non-prose kind | 400 at kernel (schema additionalProperties: false). |
| `target` field on a non-prose kind | 400 at kernel. |
| Named sub-block in the global `named` rail | Excluded (only `isNamedAnchor()` events appear). |
| Legacy named prose anchor with content | Render as implicit legacy first block; comments with lines route to it. |
| Legacy `target` plus new `append_to` in same file | Reject on new writes; on reads, log warning and prefer the new fields. |
| `lines` on a non-prose target | Renderer degrades to card-level badge; logs console warning. |
| `lines` on header-only anchor (no content, no synthetic legacy block) | Same — card-level fallback. |
| `append_to` pointing at `choice` / `turn-end` | 400 at kernel — those kinds reject `append_to` in their schema. |
| Composed doc with 100+ blocks (many FlowCards) | Lazy-mount closed folds in accordion mode; render full list in rendered mode but pre-budgeted via the perf test in `tests.md`. |
| Concurrent anchor supersession by two participants | Fork policy: lexicographic pick (above); other branch exposed as fork. |

## API endpoints

### `POST /sessions/:id/events/prose`

Body adds `append_to`, `mode`, `lines`, `removed`. JSON Schema gets
`additionalProperties: false` and lists every allowed property explicitly.
Calls the mutual-exclusion validator (above) before write.

### `POST /sessions/:id/events/flow`

Adds `append_to`. `additionalProperties: false` to reject stray `mode` /
`lines` / `target` etc.

### `POST /sessions/:id/events/file`, `html`, `choices`, `todo`, `tool-use`

Same — add `append_to`, lock down `additionalProperties: false`.

### `POST /sessions/:id/events/turn-end` and `choice`

Untouched (no `append_to`). `additionalProperties: false` still added for
defence-in-depth.

### `GET /guide`

Section "Composing documents" (≤ 300 words) covers the 5 pitfalls inline:

1. Start with a named prose anchor and keep new anchors **header-only**.
2. Append every document part with `append_to: <anchor filename>`.
3. Use prose `mode: "comment"` for line/card comments; **do not** put `name`
   on comments.
4. Use `lines` only for prose-text targets; for non-prose embeds, use
   card-level comments (omit `lines`).
5. When superseding a block, **preserve its `append_to`**; that keeps the
   slot. Mark removed blocks with `removed: true`, not empty content.

Then link to `/best-practices` for the 4-event canonical example and
patterns.

### `GET /best-practices` (new, `packages/kernel/src/routes/bestPractices.ts`)

Returns long-form markdown with worked JSON examples per pattern:
- Author the canonical four-event doc.
- Named sub-section pattern.
- Card-level comment on a flow embed.
- Block supersession that preserves slot.
- Removing a block via tombstone.
- Image embed inside a doc.

## Files that will change

- `packages/shared/src/events.ts`
- `packages/shared/src/proseRoles.ts` (new)
- `packages/shared/src/blocks.ts` (new)
- `packages/kernel/src/events/prose.ts`
- `packages/kernel/src/events/proseValidate.ts` (new — mutual-exclusion)
- `packages/kernel/src/routes/flow.ts`
- `packages/kernel/src/routes/events.ts`
- `packages/kernel/src/routes/files.ts` (incl. file-comment serialization)
- `packages/kernel/src/routes/html.ts` (or wherever html POST lives)
- `packages/kernel/src/routes/guide.ts`
- `packages/kernel/src/routes/bestPractices.ts` (new)
- `packages/kernel/src/server.ts` (register bestPractices)
- `packages/renderer/src/state/aggregate.ts`
- `packages/renderer/src/cards/EventCard.tsx`
- `packages/renderer/src/cards/ProseCard.tsx`
- `packages/renderer/src/cards/ProseInlineBlock.tsx` (new — registry)
- `packages/renderer/src/cards/InlineProseBlock.tsx` (new)
- `packages/renderer/src/cards/InlineFlowBlock.tsx` (new)
- `packages/renderer/src/cards/InlineFileBlock.tsx` (new)
- `packages/renderer/src/cards/InlineHtmlBlock.tsx` (new)
- `packages/renderer/src/cards/InlineChoicesBlock.tsx` (new)
- `packages/renderer/src/cards/InlineTodoBlock.tsx` (new)
- `packages/renderer/src/cards/InlineToolUseBlock.tsx` (new)
- `packages/renderer/src/cards/FlowCard.tsx` (add `variant` prop)
- `packages/renderer/src/cards/EmbedCard.tsx` (add `variant` prop)
- `packages/renderer/src/cards/FileCard.tsx` (add `variant` prop)
- `packages/renderer/src/cards/ChoicesCard.tsx` (add `variant` prop)
- `packages/renderer/src/cards/TodoCard.tsx` (add `variant` prop)
- `packages/renderer/src/cards/ToolUseCard.tsx` (add `variant` prop)
- `packages/renderer/src/cards/LineCommentRail.tsx` (use helpers; emit new shape)
- `packages/renderer/src/panels/right/RightComments.tsx` (use helpers)
- `packages/renderer/src/overlays/CommentThreadOverlay.tsx` (use helpers)
- `packages/renderer/src/render/BlockAccordion.tsx` (new)
- `packages/renderer/src/cards/cards.css` (`.prose-embed-frame` + embed CSS)
- Tests across `packages/{shared,kernel,renderer}/tests/`.
