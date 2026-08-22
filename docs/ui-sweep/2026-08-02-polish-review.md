# Polish review — four independent reviewers

**Date:** 2026-08-02
**Scope:** the 13 Aurora design labs + `DESIGN.md`
**Reviewers:** Hallmark (craft) · frontend-mentor (UX) · web-design-guidelines (a11y) · react-mentor (feasibility)

Each ran in isolation with no knowledge of the others. ~52 raw findings, deduped to 31 below.
Claims marked **[verified]** were checked against source by hand afterwards.

---

## Tier 0 — Broken, not polish

These ship wrong. Four are violations of rules recorded in `DESIGN.md` itself.

| # | Finding | Where | Cost |
|---|---|---|---|
| 0.1 | **Tooltip never sets `aria-describedby`** — zero occurrences in file **[verified]**. The system `DESIGN.md` calls "the definition mechanism for F-Mark's private vocabulary" delivers nothing to a screen reader. | tooltip | trivial |
| 0.2 | **Destructive dialog has no focus trap, no focus restore**, and tier-1/2 open with no focus at all. Replaces 7 `window.confirm()` sites — which get this right for free. | destructive | small |
| 0.3 | **`overflow-x: hidden` on `.pbody`** (panels-lab:434) **[verified]** — `DESIGN.md` says "never `hidden`", and line 54 of the same file uses `clip` correctly. | panels | trivial |
| 0.4 | **Nested interactive**: pin is `<span role="button">` inside `<button class="pane">` **[verified]**. Invalid HTML5; focus/AT behaviour varies by browser. In the rail variant that was chosen. | rail | small–medium |
| 0.5 | **`:active` / `:disabled` missing across 4 of 7 labs.** `DESIGN.md` lists both as non-negotiable. | several | trivial each |
| 0.6 | **Diff-tree footer says "2 selected"** but no row has a selected state — the count is unverifiable. | panels | trivial |
| 0.7 | **`j`/`k` input-guard is too narrow.** The app has other keydown consumers (`useComposeKeyboard`, comment textareas, todo editors, rename editors, cmdk). Guarding only the composer lets `j`/`k` hijack typing elsewhere. | feed | trivial |

## Tier 1 — Already built; the work is wiring, not invention

The single most useful finding of the review. **[all verified]**

| # | Finding | Evidence | Cost |
|---|---|---|---|
| 1.1 | **New-events pill already ships.** `FeedComposeDock.tsx` renders `unread-floater` off `unreadCount`. Only placement differs from the prototype. | `unread-floater`, `unreadCount` | ~0 (CSS) |
| 1.2 | **`j`/`k` navigation is 90% built.** `useFeedStepNavigation` already exports `onPrev`/`onNext`/`canGoPrev`/`canGoNext`, wired only to `FeedNavCluster` buttons. | `useFeedScrollController.ts:36-109` | trivial |
| 1.3 | **New-event edge has its substrate.** `useFreshFeedKeys`/`calculateFreshKeys` already computes fresh keys *and deliberately excludes the initial load*; `FeedRows` already applies `.is-fresh` + a `--i` stagger. | `useFeedProjection.ts:21-132` | trivial (1 CSS rule) |
| 1.4 | **Copy-on-click is an unfinished rollout, not a new pattern.** `copyToClipboard` is already used at 8 call sites; the tool chip's `arg` is the obvious gap. | `render/copy.ts` | trivial |
| 1.5 | **Transient-highlight pattern already exists** — `ANCHOR_FLASH_CLASS`/`ANCHOR_FLASH_MS` in `FeedRows`. Reuse it for the tool sweep *and* the j/k selection rather than writing two more. | `FeedRows.tsx` | — |
| 1.6 | **Thinking pulse** should reuse the existing `launching` presence animation, driven by `activeAgentIds` (already computed in `useFeedAgentTails`). | — | small |

## Tier 2 — Cheap and genuinely worth it

| # | Finding | Where | Cost |
|---|---|---|---|
| 2.1 | **Wait timer is frozen.** "Waiting 3m 41s" renders once from static data on all three surfaces. The one number whose job is "still stuck, and getting worse". | dashboard · agent · feed | trivial |
| 2.2 | **Approval buttons give no confirmation.** `.approval.resolved` ("✓ allowed once") exists in the gallery and is **never wired to a click**. | 3 surfaces | small |
| 2.3 | **Sparkline lies.** A pane-dead session's activity graph draws in the same healthy teal as a live one. Tint by outcome (`--hot` is already the meaning for blocked/dead). | dashboard | trivial |
| 2.4 | **Menu animates in, vanishes instantly.** `closeMenus()` calls `.remove()`, ignoring the `pop` keyframe used on open. Asymmetric motion is the classic "assembled, not made" tell. | panels | small |
| 2.5 | **No busy state on Spawn / Send / Create.** Clicking twice looks identical to clicking once, on hard-to-undo actions. | start · agent | small |
| 2.6 | **Rename pencil is hover-only** — invisible to keyboard. *Found independently by two reviewers.* | agent | trivial |
| 2.7 | **Tool disclosure has no height transition** — chevron rotates, content pops. Use `grid-template-rows: 0fr → 1fr`. | feed | small |
| 2.8 | **Context meter has no transition** — would jump after Compact rather than visibly dropping. | agent | trivial |
| 2.9 | **Sliding indicator on segmented controls** (feed view mode, conversation/terminal). | feed · agent | small |
| 2.10 | **Copy-on-click missing in Files and Search** — the two panels most full of paths. | panels | trivial |
| 2.11 | **No `aria-live` on the blocked count** — the one thing the dashboard exists to surface, unannounced. | dashboard | trivial–small |
| 2.12 | **Icon-only `⌘K` / `⚙` lack `aria-label`.** | several | trivial |
| 2.13 | **Tool row is a `div` with `aria-expanded` but no `role="button"`** — operable, but not announced as actionable. | feed | trivial |
| 2.14 | **Toasts vanish with no countdown.** A thin shrinking bar turns "what did that say" into "I have a second". | attention | trivial |
| 2.15 | **"Doing now" step has no elapsed time** — directly answers "is it stuck?", one of the sidebar's three stated questions. | agent | trivial |
| 2.16 | **"Allow always" is labelled "Always" on one surface** — inconsistent label on a permission-widening action. | agent | trivial |
| 2.17 | **Agent-screen "Recent" rows aren't clickable** back into the conversation, though the anchor-highlight pattern already exists. | agent | small |
| 2.18 | **`.empty` CSS defined but never rendered** in any panel — untested empty states are where layout breaks at implementation time. | panels | small |
| 2.19 | **"Last ping" vs "pane activity"** read as a discrepancy rather than two different signals. Tier-B tooltip. | agent | trivial |
| 2.20 | **Live "last event Xs ago"** in the top bar — reuses the `frozen at 14:05` framing already designed for the blind state. | global | trivial |
| 2.21 | **Dashboard state toggle is a hard cut** — the "something changed while you were gone" moment deserves a crossfade. | dashboard | trivial |
| 2.22 | Single-shot pulse on `stale`/`dead` presence dots on mount; same for `FlowCard`'s diagnosed node. | dashboard · feed | trivial |
| 2.23 | Sparkline draw-in on mount (`stroke-dashoffset`). | dashboard | trivial |
| 2.24 | Model/effort chevrons don't rotate on open, breaking a convention the app already teaches. | agent | trivial |

## Tier 3 — Real cost, decide deliberately

| # | Finding | Verdict |
|---|---|---|
| 3.1 | **Optimistic send** — medium, and the naive path is worse. Injecting a fake event into `store.events` runs it through the aggregator's supersedes/dedup and risks duplicating the real echoed event. **Cheaper path:** render it *after* `FeedRows` from a compose-only slice (the pattern `FeedAgentTailItems` already establishes), never in `store.events`; clear unconditionally on reconnect rather than resurrecting. |
| 3.2 | **Last-read marker** — possibly **redundant**. The codebase already has per-row unread dots driven by the same `savedAnchor`. Running both gives two independently-computed "where did I stop" signals that can drift. Either derive the line from the existing `firstUnreadItemKey`, or don't build it. |
| 3.3 | **Sticky turn header** — the DOM doesn't support the prototype's version. A "turn" isn't one contiguous region; `projectFeed` emits interleaved top-level items. **Descope** to a group card's own header pinning within its own tool list. |
| 3.4 | **Participant focus** — a literal React port would re-render every card twice per hover movement. `FeedRows` has **no `React.memo`** **[verified]**. Must be built imperatively, as the prototype did: a delegated native listener toggling classes off `data-participant-id`. |

## Rejected

| Finding | Why |
|---|---|
| **Context meter changes colour near the compact threshold** | Every candidate colour is taken. `--warn` means *stale*, `--hot` means *destruction/blocked*. Giving amber a second meaning is exactly what the one-meaning rule prevents. Use a threshold tick or the fill's shape instead. |
| **`j`/`k` selection ring using `--ac-dim`** (already in the prototype) | Same violation, shipped by me. Teal means *agent working*; selection is not that. Move to ink-level or glass. |

---

## The meta-finding

Two independent patterns emerged that matter more than any single item:

**1. Styles that exist but were never wired.** Found three times, by two reviewers, in three files:
`.empty` (never rendered), `.approval.resolved` (never clicked), "2 selected" (no selected state).
The labs designed every component's *default* state and skipped its *resulting* state. Those are
precisely the states that turn up broken at implementation time.

**2. The quality floor cannot be enforced by memory.** Four Tier-0 items are violations of rules
written in `DESIGN.md` — by the same person, within days. `overflow-x: hidden`, missing
`:active`/`:disabled`, teal used for selection. The contrast rule is enforced by
`token-contrast.test.ts` and has not drifted once. **The rest of the floor needs the same
treatment**: a lint rule or test asserting no `overflow-x: hidden`, `:active`/`:disabled` present
on interactive classes, and no accent token in a non-accent role.
