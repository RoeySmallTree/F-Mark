## End-to-end correctness

The canonical `/best-practices` recipe is viable. Step 1 posts a header-only named prose anchor; the prose route accepts `name` + empty `content` (`packages/kernel/src/routes/events.ts:101-143`) and the validator permits named anchors (`packages/kernel/src/events/proseValidate.ts:85-143`). Steps 2 and 4 post prose blocks with `append_to`; Step 3 posts a flow block, and the flow route accepts `append_to` (`packages/kernel/src/routes/flow.ts:87-97`). On read, the aggregate consumes only blocks whose resolved parent is a visible named anchor (`packages/renderer/src/state/aggregate.ts:133-151`), `Feed` passes those blocks into the anchor card (`packages/renderer/src/shell/Feed.tsx:83-91`), and `ProseCard` maps them into one composed document (`packages/renderer/src/cards/ProseCard.tsx:163-170`). Accordion mode folds the same block list (`packages/renderer/src/render/BlockAccordion.tsx:137-155`).

The main write-to-render plumbing gap is not the happy path; it is metadata around unhappy paths. Orphan blocks remain visible, but `EventCard` explicitly does not thread an orphan badge yet (`packages/renderer/src/cards/EventCard.tsx:74-78`).

## Schema + helper boundary

The helper boundary is clean. `getProseRole`, `getCommentTarget`, and `isNamedAnchor` normalize the legacy shape without walking supersession (`packages/shared/src/proseRoles.ts:42-77`, `packages/shared/src/blocks.ts:38-52`). A source grep found no direct `payload.target` consumers outside the intended compatibility layer: parser, validator, prose route normalizer, and helper/type definitions. Parser back-compat works for old sessions: `parseProse` maps legacy `target` to `append_to + mode: "comment" + lines`, prefers new fields when both exist, and drops `target` from the returned payload (`packages/kernel/src/events/prose.ts:55-88`).

One boundary mismatch remains: the kernel accepts non-prose `append_to`, but renderer client types still omit it for todo/html/flow/file writes (`packages/renderer/src/api/client.ts:55-90`). Agents following raw REST guidance are fine; typed renderer callers cannot author those embeds without casting.

## Aggregate

The Phase 6 visible-non-anchor bug is fixed: a block appended to a non-anchor becomes an orphan, not a silently consumed invisible event (`packages/renderer/src/state/aggregate.ts:143-148`). Supersession walks have visited/depth bounds (`packages/renderer/src/state/aggregate.ts:67-80`), and root-filename ordering is a sane deterministic slot-preservation choice (`packages/renderer/src/state/aggregate.ts:154-160`).

Two planned edge semantics are still missing. First, tombstones do not suppress a block chain. A prose tombstone superseding a flow hides the flow through the generic `superseded` filter, but the tombstone itself is a visible `append_to` event and is pushed into the anchor block list (`packages/renderer/src/state/aggregate.ts:115-117`, `packages/renderer/src/state/aggregate.ts:133-151`), then rendered like an empty prose block (`packages/renderer/src/cards/ProseInlineBlock.tsx:46-68`). Second, fork siblings are not surfaced as forks/orphans: the resolver picks the lexicographically smallest supersedor, but `visible` only removes the superseded root, so the losing sibling can still render as its own normal card (`packages/renderer/src/state/aggregate.ts:46-62`, `packages/renderer/src/state/aggregate.ts:115-117`).

## Comment system

Phase 2’s atomic migration holds for prose comments. Incoming legacy `target` bodies are normalized before validation and serialization (`packages/kernel/src/routes/events.ts:25-46`, `packages/kernel/src/routes/events.ts:148-173`), and new rail writes use `append_to + mode: "comment" + lines` (`packages/renderer/src/cards/LineCommentRail.tsx:221-228`). A new line comment on a prose block should land on that block’s rail: aggregate keys it by target filename (`packages/renderer/src/state/aggregate.ts:197-212`), and `ProseCard` passes `commentsByFilename.get(b.filename)` into each inline block (`packages/renderer/src/cards/ProseCard.tsx:163-169`).

Card-level comments on non-prose embeds are less complete: inline flow/html/choices/todo/tool-use renderers ignore their `comments` prop (`packages/renderer/src/cards/ProseInlineBlock.tsx:71-97`); file at least receives comments and shows a count.

## Renderer composition

The inline registry is stub-free for all registered supported kinds (`packages/renderer/src/cards/ProseInlineBlock.tsx:100-108`). Flow/html/choices/todo have explicit embedded variants; file and tool-use are real renderers but not true embedded variants. `FileCard` has no `variant` prop and still renders standalone card chrome inside prose (`packages/renderer/src/cards/FileCard.tsx:316-384`); `ToolUseCard` always renders its toggle header (`packages/renderer/src/cards/ToolUseCard.tsx:84-107`).

Sticky head plumbing remains intact: the card avoids creating its own scroll context and `.prose-head` is still `position: sticky` (`packages/renderer/src/cards/cards.css:122-151`). Browser verification with 20+ blocks is still warranted.

## Accordion

Each block becomes one fold. Named prose blocks use their `name`; unnamed blocks get kind-default incremental labels (`packages/renderer/src/render/BlockAccordion.tsx:49-59`). Closed folds lazy-mount their bodies (`packages/renderer/src/render/BlockAccordion.tsx:98-109`), but all folds are initially open (`packages/renderer/src/render/BlockAccordion.tsx:155`), so initial accordion render still mounts everything. Nested block sub-folds are explicitly left for later (`packages/renderer/src/render/BlockAccordion.tsx:7-10`), despite the plan/test matrix listing nested blocks as supported.

## What's missing

Beyond acknowledged Phase 13 polish, the missing implementation items are tombstone suppression, fork-sibling disposition, nested block rendering, typed client `append_to` support for non-prose writes, and filename-pattern validation for non-prose `append_to`. Non-prose routes currently require only non-empty strings (`packages/kernel/src/routes/flow.ts:90-96`, `packages/kernel/src/routes/files.ts:63-70`, `packages/kernel/src/routes/html.ts:118-130`, `packages/kernel/src/routes/todos.ts:388-401`, `packages/kernel/src/routes/events.ts:224-233`), while prose uses the stricter event-filename regex (`packages/kernel/src/events/proseValidate.ts:73-82`).

## Recommended Phase 14 priorities

1. In browser, run the four-event recipe, then add a line comment to each prose block and a card-level comment to each non-prose embed.
2. Manually create a prose tombstone for a flow block and an anchor supersession fork; confirm neither produces ghost cards.
3. Load a 20+ block doc with several flows, toggle accordion, and verify sticky head, first-render cost, and closed-fold remount behavior.
