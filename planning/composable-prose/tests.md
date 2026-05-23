# Composable Prose — test plan

Combined unit + integration + visual + manual-browser tests. Each phase
in `phases.md` lists which of these become active after that phase lands.

## Conventions

- Renderer unit tests under `packages/renderer/tests/`. New files mirror
  the source layout (e.g. `tests/cards/inlineFlow.test.tsx`).
- Kernel unit + route tests under `packages/kernel/tests/`.
- Shared serialization tests under `packages/kernel/tests/events/`.
- Manual browser tests are documented in this file as a checklist; the
  runner is the global `/browse` skill driving Playwright MCP against a
  live kernel.

## Layer 1 — shared / kernel

### Schema round-trip

| File | Test | Asserts |
|---|---|---|
| `kernel/tests/events/prose.test.ts` | `pickFrontmatter` includes `append_to`, `mode`, `lines` when set | new fields persist |
| `kernel/tests/events/prose.test.ts` | `parseProse` reads back the new shape | symmetric |
| `kernel/tests/events/prose.test.ts` | `parseProse` maps legacy `target` → `append_to + mode=comment + lines` on read | back-compat |
| `kernel/tests/events/prose.test.ts` | Serializer never emits `target` for a freshly-built payload | new writes use the new shape only |
| `kernel/tests/events/prose.test.ts` | Empty content + `name` only emits the frontmatter block + no markdown body | anchor-as-header serialization |

### Route validation

| Route | Test | Asserts |
|---|---|---|
| `POST /sessions/:id/events/prose` | `append_to` accepted | 200 |
| `POST /sessions/:id/events/prose` | `name` + `append_to` accepted | 200, named sub-block |
| `POST /sessions/:id/events/prose` | `mode: "comment"` + `append_to` + `lines` accepted | 200 |
| `POST /sessions/:id/events/prose` | `mode: "comment"` + `name` rejected | 400 (comments can't have names) |
| `POST /sessions/:id/events/prose` | `mode: "content"` + `lines` rejected | 400 (lines is comment-only) |
| `POST /sessions/:id/events/prose` | `mode` without `append_to` rejected | 400 |
| `POST /sessions/:id/events/prose` | `lines` outside `mode: "comment"` rejected | 400 |
| `POST /sessions/:id/events/flow` | `append_to` accepted | 200 |
| `POST /sessions/:id/events/flow` | `mode` field on flow rejected | 400 (mode is prose-only) |
| `POST /sessions/:id/events/file` | `append_to` accepted | 200 |
| `POST /sessions/:id/events/html` | `append_to` accepted | 200 |
| `POST /sessions/:id/events/choices` | `append_to` accepted | 200 |
| `POST /sessions/:id/events/todo` | `append_to` accepted | 200 |
| `POST /sessions/:id/events/tool-use` | `append_to` accepted | 200 |
| Any kind | empty-string `append_to` rejected | 400 (treat as absent) |
| Any kind | `append_to: "../../../etc/passwd"` rejected | 400 (filename validation) |

### `/guide` and `/best-practices`

| Route | Test | Asserts |
|---|---|---|
| `GET /guide` | response contains "append_to" mention and a link to `/best-practices` | guide surfaces the feature |
| `GET /guide` | response body ≤ a sane limit (no bloat from new section) | recipe stays minimal |
| `GET /best-practices` | returns 200 with markdown | new endpoint exists |
| `GET /best-practices` | references all supported block kinds | completeness |
| `GET /best-practices` | includes the 4-event canonical example | usable starter |
| `GET /best-practices?token=…` | auth rules match `/guide` | consistent auth |

## Layer 2 — renderer aggregate

`renderer/tests/state/aggregate.test.ts` (new or extended):

| Test | Asserts |
|---|---|
| `blocksByAnchor` groups events by their `append_to` | core grouping |
| Block events are absent from `feed`, `feedDocument`, `feedConversation` | top-level filter |
| Comments stay in `commentsByTarget`, not `blocksByAnchor` | mode-aware routing |
| Block whose anchor was superseded re-binds to the supersedor | chain walk |
| Supersession chain longer than 32 is bounded (no infinite loop) | depth guard |
| Cyclic supersession (A→B→A, malformed) breaks out without hanging | cycle guard |
| Two blocks with identical timestamp tiebreak by filename, deterministically | ordering |
| Orphan block (anchor not in events) appears in `feed` with a hint flag (e.g. `_orphan: true`) | orphan visibility |
| Nested block (block → block) is grouped under the nearest live anchor in its chain | nesting |
| Superseded block hidden from its parent's block list | supersession |
| Named sub-block does NOT appear in the global `named` view | rail scoping |

## Layer 3 — dispatch + composition

`renderer/tests/cards/eventCard.test.tsx`:

| Test | Asserts |
|---|---|
| Event with `append_to` returns null at top level | dispatcher consumes blocks |
| Comment (prose + `mode: "comment"`) still renders via existing path | comment path preserved |
| Legacy comment (prose + `target` only) still renders | back-compat |
| Anchor prose (name + no append_to) renders `ProseCard` | unchanged path |
| Standalone flow (no append_to) renders `FlowCard` | unchanged path |

`renderer/tests/cards/prose.test.tsx`:

| Test | Asserts |
|---|---|
| ProseCard renders blocks in timestamp order | composition order |
| Renders `ProseEmptyState` when there are no blocks | empty doc UX |
| Renders the prose name in the title row with accent | unchanged |
| Sticky head stays put while scrolling past 1500px of blocks | sticky survives |
| Each block has its own `LineCommentRail` instance | per-block comments |
| Inline flow block has no `.flow-head` chrome | embedded variant strips chrome |
| Inline file block has no `.file-head` chrome | same |
| Word count = sum of words across prose blocks | scope correct |
| Comments-by-block: targeting a block filename routes to that block's rail | comment routing |

`renderer/tests/cards/proseInlineBlock.test.tsx` (new):

| Test | Asserts |
|---|---|
| Renders the prose-kind block via `InlineProseBlock` | registry dispatch |
| Renders the flow-kind block via `InlineFlowBlock` | registry dispatch |
| Unsupported kind (e.g. `turn-end`) renders a tiny fallback | safe default |
| Future kind registered dynamically picks up | registry extensibility |

## Layer 4 — accordion mode rewrite

`renderer/tests/render/accordionBlocks.test.tsx` (new):

| Test | Asserts |
|---|---|
| Each block becomes a fold | block-as-fold |
| Named block uses its name as fold title | naming respect |
| Unnamed prose block uses a default label ("Section N") | sensible default |
| Unnamed flow block uses "Flow chart N" | kind-aware default |
| Nested block renders as sub-fold inside its parent fold | nesting |
| Initial state: all folds open | default v1 |
| Click chevron collapses + expands | basic interaction |
| Multiple blocks of same kind get incremental sequence numbers in default labels | "Section 1", "Section 2" |

## Layer 5 — embedded variants

Each card-component test asserts both standalone and embedded variants:

| File | Test |
|---|---|
| `tests/cards/flow.test.tsx` | `variant="embedded"` renders no `.flow-head`, no `.flow-title`, no menu; only `.flow-canvas` |
| `tests/cards/embed.test.tsx` | `variant="embedded"` strips `.embed-head` |
| `tests/cards/file.test.tsx` | `variant="embedded"` strips `.file-head` |
| `tests/cards/choices.test.tsx` | `variant="embedded"` strips `.choices-head` |
| `tests/cards/todo.test.tsx` | `variant="embedded"` strips `.todo-head` |
| `tests/cards/tool-use.test.tsx` | `variant="embedded"` strips `.tool-use-head` |

## Layer 6 — visual / theme verification (browse skill)

Manual checklist run with `/browse` against the live kernel. For each
theme (warm, ide-dark, terminal, solarized, brutalist, cyber):

| Check | Pass criteria |
|---|---|
| Anchor doc with 1 prose block + 1 flow block + 1 prose block | Sticky head pinned; blocks composed in correct order; theme tokens applied to embeds |
| Same in accordion mode | Three folds, named "Section 1", "Flow chart 1", "Section 2"; chevrons rotate on click |
| Long document (10+ blocks) | Smooth scroll; no layout jank when sticky head re-pins |
| Empty anchor (no blocks yet) | Empty-state UI shown; no broken layout |
| Orphan block (manually delete anchor file) | Top-level card with "orphaned embed" badge; doesn't break the feed |
| Comment on a block | Line marker appears on the block's rail, not on the anchor or sibling blocks |
| Block sub-section with a name | Sub-section header visible in rendered mode; fold title in accordion mode |

## Layer 7 — author-flow integration (manual)

A sonnet-driven agent runs through `/best-practices` and produces a doc.
Verification:

| Check | Pass criteria |
|---|---|
| Agent successfully creates the 4-event canonical doc | All four POSTs return 200 |
| Renderer shows it as one ProseCard with three composed blocks | UI matches the doc as written |
| Author can supersede a block | New version replaces in place; old hidden |
| Author can comment on a block | Comment marker appears on the right block |
| Agent does NOT erroneously create one giant anchor with all the content embedded | The /best-practices guidance steers the agent away from this anti-pattern |

## Performance budgets

| Budget | Limit |
|---|---|
| Aggregate grouping pass | ≤ 5ms for 1000 events on a typical laptop |
| Supersession-chain walk per block | O(chain length), bounded at depth 32 |
| Block count in one anchor | No hard cap; document a soft suggestion of ≤ 50 blocks in `/best-practices` |
| Sticky head re-pin during scroll | No measurable jank in a 60Hz visual check |

## Regression coverage

Before/after each phase lands, re-run:

- `pnpm -F @f-mark/renderer test` — full renderer suite.
- `pnpm -F f-mark test` — full kernel suite.
- `/browse` smoke against the existing prose-card flows: comments still
  click through, source mode toggles, accordion expands.
