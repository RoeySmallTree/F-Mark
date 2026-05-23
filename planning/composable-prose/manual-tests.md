# Composable Prose — manual /browse test cases

These run against a live kernel via the `/browse` skill (Playwright MCP).
Each case is self-contained: pre-conditions, steps, expected outcome,
evidence to capture. A Sonnet agent picks one up, drives it, and writes
the report to `planning/composable-prose/qa/<test-id>.md`.

## Pre-flight (every test starts here)

1. Start kernel: `pnpm -F f-mark dev` (background, capture the
   `?token=...` from boot output).
2. Navigate to `http://localhost:7777?token=<TOKEN>` via `/browse`.
3. Ensure the existing session `seesion-try-1` is selected, OR create
   a new session if your test requires a clean slate.

If the kernel is already running with a different port, use that — the
boot output prints the URL.

---

## T1 — Canonical four-event document

**Goal:** prove the headline /best-practices recipe actually produces
one composable document.

**Setup:** create a fresh session via `POST /sessions`. Capture its id.

**Steps:**

1. POST `/sessions/<sid>/events/prose` with body:
   ```json
   {"participant_id":"<your-uid>","name":"T1 architecture","content":""}
   ```
   Capture the returned `filename` as `ANCHOR`.

2. POST `/sessions/<sid>/events/prose` with body:
   ```json
   {"participant_id":"<your-uid>","append_to":"<ANCHOR>","content":"## Intro\n\nA collaboration session is a folder of timestamped event files."}
   ```

3. POST `/sessions/<sid>/events/flow` with body:
   ```json
   {"participant_id":"<your-uid>","id":"fl_t1","title":"Event flow","append_to":"<ANCHOR>","nodes":[{"id":"a","label":"Author"},{"id":"b","label":"Kernel"},{"id":"c","label":"Renderer"}],"edges":[{"id":"e1","source":"a","target":"b"},{"id":"e2","source":"b","target":"c","style":"flowing"}]}
   ```

4. POST `/sessions/<sid>/events/prose` with body:
   ```json
   {"participant_id":"<your-uid>","name":"Data flow","append_to":"<ANCHOR>","content":"After the kernel writes the event, the renderer reads it back."}
   ```

5. Navigate to the session in the browser.

**Expected:**
- Exactly **one** `.prose-card` for "T1 architecture" in the feed.
- Inside it, three blocks in order: intro prose, flow chart embed, "Data flow" sub-section.
- The flow embed has NO `.flow-head` chrome (use a DOM evaluate to confirm).
- The "Data flow" sub-block has a visible `.prose-block-name` h3 with text "Data flow".
- The word-count badge in the title row updates as blocks land.
- No standalone `.flow-card` for the flow at top level (it's only inside the anchor).

**Evidence to capture:**
- Screenshot of the composed doc.
- DOM query: `document.querySelectorAll('[data-event-kind="prose-named"]').length` (should be 1 — just the anchor).
- DOM query: `document.querySelectorAll('.flow-card-embedded').length` (should be 1).
- DOM query: `document.querySelectorAll('[data-event-kind="flow"]:not(.flow-card-embedded)').length` (should be 0 — no standalone).

---

## T2 — Accordion mode (folds the blocks)

**Goal:** confirm accordion mode shows each block as a fold.

**Setup:** same as T1.

**Steps:**

1. Run T1 to set up the doc.
2. Click the accordion icon in the prose-head's view-toggle.

**Expected:**
- `.fm-block-accordion` is present.
- Exactly 3 `.fm-accordion-section` folds (intro / flow / data-flow).
- The "Data flow" fold has title text "Data flow".
- Unnamed blocks have generated titles: "Section 1" for the intro,
  "Flow chart 1" for the flow.
- Each fold's chevron toggles open/closed.
- Closed folds do NOT mount their content (DOM query inside a closed
  fold returns no `.flow-canvas` / `.fm-prose`).

**Evidence to capture:**
- Screenshot in accordion mode.
- Click the first fold's chevron closed; screenshot.
- DOM: `document.querySelectorAll('.fm-accordion-section').length === 3`.

---

## T3 — Orphan block

**Goal:** prove a block pointing at a non-existent anchor renders as a
top-level card with no anchor (not silently dropped).

**Setup:** fresh session.

**Steps:**

1. POST a flow with `append_to: "20990101T000000Z_ag-nobody.prose.md"`
   (deliberately fake filename).

**Expected:**
- The flow appears as a top-level `.flow-card` in the feed (standalone
  rendering, not silently consumed).
- No prose-card with this anchor exists.
- No console errors.

**Evidence to capture:**
- Screenshot showing the orphan flow at top level.
- Console log clean (capture via `mcp__playwright__browser_console_messages`).

---

## T4 — Comment on a block

**Goal:** confirm a line-comment on a specific block lands on that
block's rail, not the anchor's or another block's.

**Setup:** run T1 (so we have an anchor + 3 blocks). Capture the intro
prose-block's filename as `BLOCK_INTRO`.

**Steps:**

1. POST `/sessions/<sid>/events/prose` with body:
   ```json
   {"participant_id":"<your-uid>","append_to":"<BLOCK_INTRO>","mode":"comment","lines":[1,2],"content":"Tighten this paragraph."}
   ```

**Expected:**
- The comment marker appears on the intro block's rail (line 1-2).
- No marker on the anchor's rail or on the "Data flow" block.
- Clicking the marker focuses the right-panel thread with the correct
  parent.

**Evidence to capture:**
- Screenshot showing the marker on the intro block specifically.
- DOM: `document.querySelectorAll('.line-comment-marker').length === 1`
  (assuming this is the only comment).

---

## T5 — Block supersession preserves slot

**Goal:** confirm an edit-in-place keeps the block's position rather
than jumping to the end.

**Setup:** run T1. Capture the flow block's filename as `FLOW1`.

**Steps:**

1. POST a flow that supersedes the first one, with new nodes:
   ```json
   {"participant_id":"<your-uid>","id":"fl_t1","title":"Event flow v2","append_to":"<ANCHOR>","supersedes":"<FLOW1>","nodes":[{"id":"a","label":"Author v2"}],"edges":[]}
   ```

**Expected:**
- The anchor still has 3 visible blocks (intro / flow v2 / data-flow).
- The flow v2 sits in slot 2 (same slot as the original).
- Original flow filename is not in the DOM.
- The new flow's title reads "Event flow v2".

**Evidence to capture:**
- Screenshot post-supersession.
- DOM: block order via `Array.from(document.querySelectorAll('.prose-card .prose-embed-frame')).map(el => el.getAttribute('data-block-kind'))` should equal `["prose","flow","prose"]`.

---

## T6 — Block tombstone (removal)

**Goal:** confirm `removed: true` hides the chain.

**Setup:** run T1. Capture `FLOW1`.

**Steps:**

1. POST prose with body:
   ```json
   {"participant_id":"<your-uid>","append_to":"<ANCHOR>","supersedes":"<FLOW1>","removed":true,"content":""}
   ```

**Expected:**
- Anchor now has 2 visible blocks (intro / data-flow).
- No flow card anywhere.

---

## T7 — Sticky head under heavy doc

**Goal:** sticky-head behaviour under a long composed doc.

**Setup:** create an anchor + 20 prose blocks (each ~300 chars of
markdown). One flow block embedded among them.

**Steps:**

1. Scroll the feed (or the prose card) past 1500px.
2. Observe the title row.

**Expected:**
- Title row stays pinned at the top of the prose-card.
- No layout jitter when scrolling past the flow block.

**Evidence:**
- Screenshot at scroll position 0 + at scrollTop 1500.

---

## T8 — Theme matrix

**Goal:** every theme renders embeds correctly.

**Setup:** run T1 to get a composed doc.

**Steps:**

For each theme — warm-paper (default), terminal, ide-dark, solarized,
brutalist, cyber:

1. Switch theme via the body class (eval
   `document.body.className = "theme-<name>"`).
2. Screenshot the prose-card.

**Expected:**
- Title row, embed frame, flow canvas all readable.
- No hardcoded colors bleed through.

**Evidence:**
- 6 screenshots, one per theme.

---

## T9 — Legacy named prose with content (read-compat)

**Goal:** an anchor that was authored before composable-prose (has its
own `content`) still renders, with the content shown as an implicit
first block.

**Setup:** POST a named prose with non-empty content (no `append_to` on
the body — this simulates a legacy author):
```json
{"participant_id":"<your-uid>","name":"Legacy doc","content":"# Heading\n\nLegacy body."}
```

Then optionally append a block:
```json
{"participant_id":"<your-uid>","append_to":"<that filename>","content":"## A new block"}
```

**Expected:**
- The legacy content renders as a synthetic prose block at the top.
- The appended block renders below it.
- A small marker indicates "legacy content" (Phase 13 polish — may be
  absent in current state; note as future work if missing).

---

## T10 — `/best-practices` is reachable and accurate

**Goal:** confirm the docs endpoint serves what /guide promises.

**Steps:**

1. `GET /best-practices` with the auth header.
2. Verify the response is markdown.
3. Verify it contains the four-event recipe and all the common-mistake
   bullets.

**Evidence:**
- HTTP 200.
- Body length > 1000 chars.
- Contains literal strings: "Canonical four-event recipe",
  "Common mistakes", "tombstone".

---

## Bug-reporting template (use in qa/<test-id>.md)

```markdown
# T<n> — <test name>

## Setup verified
- Kernel running on port <X>.
- Session: <sid>.

## Steps run
1. ...

## Expected vs actual
| Check | Expected | Actual | Pass/Fail |
| ... | ... | ... | ... |

## Evidence
- ![](path/to/screenshot.png)
- DOM: `...`
- Console: `...`

## Bugs found
### BUG-<n> — <one-line>
- Severity: P0/P1/P2/P3
- Where: file:line or area
- Trigger: ...
- Expected: ...
- Actual: ...
- Suggested fix: ...
```
