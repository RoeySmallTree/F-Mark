# Composable-Prose QA — Sonnet Verification Pass 2

**Date:** 2026-05-23  
**Model:** Claude Sonnet 4.6  
**Branch:** main  
**Commits under test:** e4e8ad6 (BUG-1 + BUG-2), aa7ec3c (BUG-3)  
**Method:** `pnpm -F f-mark dev` (from source via tsx), renderer rebuilt from source and rebundled into kernel dist, Playwright MCP for browser verification.

---

## BUG-1 Verification — `pnpm dev` module-resolution error

**Fix:** `packages/kernel/src/routes/files.ts` — added `export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;` so `server.ts` import resolves cleanly.

**Verification method:** started kernel via `pnpm -F f-mark dev`, captured full boot output.

**Boot output:**

```
> f-mark@0.4.0 dev /home/roey/workspace/F-Mark/packages/kernel
> tsx src/index.ts

◆ F-Mark v0.0.1 running.

  URL:      http://localhost:7777
  Token:    497da4d6d566a45ee40d2713fd27559d

  Open:     http://localhost:7777?token=497da4d6d566a45ee40d2713fd27559d

  Press Ctrl+C to stop.
```

No `SyntaxError`, no `does not provide an export named 'MAX_ATTACHMENT_BYTES'`, clean boot in ~5 seconds.

**Result: PASS — BUG-1 fix verified.**

The kernel was restarted after a renderer rebuild (see BUG-2 note), booting again on port 7780 with the same clean-boot pattern and no module errors.

---

## BUG-2 Verification — Word count shows "0 words" for composed docs

**Fix:** `packages/renderer/src/cards/ProseCard.tsx` — word count now sums `wordCount(payload.content)` plus a `.reduce()` over all prose-kind blocks in the composed doc.

**Note:** The renderer bundle in `kernel/dist/renderer/` was built before the fixes (22:26) while the fix commit landed at 22:36. A renderer rebuild + kernel bundle update was required before the fix was observable in-browser. This is the same build-pipeline gap as BUG-4 (documented in pass-1 SUMMARY), not a new regression.

**Verification session:** `2026-05-23-qa-pass2-t1-2`

**Events posted (all HTTP 200):**

| Step | Event | Filename |
|------|--------|----------|
| 1 | Anchor: `{"participant_id":"ag-claude","name":"T1 architecture","content":""}` | `20260523T204209Z_ag-claude.prose.md` |
| 2 | Intro block: `append_to: ANCHOR, content: "## Intro\n\nA collaboration session is a folder of timestamped event files."` | `20260523T204217Z_ag-claude.prose.md` |
| 3 | Flow: `append_to: ANCHOR, title: "Event flow"`, 3 nodes, 2 edges | `20260523T204217Z_ag-claude.flow.json` |
| 4 | Data flow: `append_to: ANCHOR, name: "Data flow", content: "After the kernel writes the event, the renderer reads it back."` | `20260523T204218Z_ag-claude.prose.md` |

**DOM queries (run in browser on the live session):**

```js
document.querySelector('.prose-meta-words')?.textContent
// => "23 words"  ✓  (was "0 words" before fix)

document.querySelectorAll('[data-event-kind="prose-named"]').length
// => 1  ✓

document.querySelectorAll('.flow-card-embedded').length
// => 1  ✓

document.querySelectorAll('.prose-embed-frame').length
// => 3  ✓

Array.from(document.querySelectorAll('.prose-embed-frame')).map(el => el.getAttribute('data-block-kind'))
// => ["flow", "prose", "prose"]  ✓
```

**Screenshot:** `screens/pass2-bug2-wordcount.png`  
The title row clearly shows **"23 words"** (non-zero) alongside the "T1 architecture" heading.

**Result: PASS — BUG-2 fix verified.**

---

## BUG-3 Verification — Orphan block has no "orphaned embed" badge

**Fix:** `packages/renderer/src/shell/Feed.tsx` + `packages/renderer/src/cards/cards.css` — Feed wraps orphan-block items in `.feed-item-orphan` with `data-orphan-embed="true"`, prepends a `.orphan-embed-badge` pill above the card.

**Verification session:** `2026-05-23-qa-pass2-t3` (fresh session)

**Event posted:**

```json
{
  "participant_id": "ag-claude",
  "id": "fl_orphan_p2",
  "title": "Orphan flow",
  "append_to": "20990101T000000Z_ag-nobody.prose.md",
  "nodes": [{"id": "x", "label": "Orphan"}],
  "edges": []
}
```

Response: `{"filename":"20260523T204316Z_ag-claude.flow.json","kind":"flow"}` HTTP 200.

**DOM queries (run in browser on the live session):**

```js
document.querySelectorAll('[aria-label="Feed"] .flow-card:not(.flow-card-embedded)').length
// => 1  ✓  (orphan renders at top level)

document.querySelectorAll('.feed-item-orphan').length
// => 1  ✓

document.querySelectorAll('[data-orphan-embed="true"]').length
// => 1  ✓

document.querySelectorAll('.orphan-embed-badge').length
// => 1  ✓

document.querySelector('.orphan-embed-badge')?.textContent
// => "orphaned embed — append_to points at a missing anchor"  ✓

document.querySelector('.flow-title')?.textContent
// => "Orphan flow"  ✓

document.querySelector('.feed-item-orphan > .orphan-embed-badge') !== null
// => true  ✓  (badge is direct child of orphan wrapper, above the card)

document.querySelectorAll('.prose-card').length
// => 0  ✓  (no phantom anchor card)
```

**Console errors:** 0 errors, 1 irrelevant warning (unchanged).

**Screenshot:** `screens/pass2-bug3-orphan-badge.png`  
The screenshot shows the orange pill badge "orphaned embed — append_to points at a missing anchor" above the "Orphan flow" card which contains the "Orphan" node in the flow canvas.

**Result: PASS — BUG-3 fix verified.**

---

## SUMMARY

| Bug | Severity | Fix commit | Verification | Result |
|-----|----------|------------|--------------|--------|
| BUG-1 — `pnpm dev` module error | P0 | e4e8ad6 | Clean boot, no SyntaxError | **VERIFIED FIXED** |
| BUG-2 — word count always 0 | P2 | e4e8ad6 | DOM: `.prose-meta-words` = "23 words" | **VERIFIED FIXED** |
| BUG-3 — no orphan badge | P3 | aa7ec3c | DOM: `.orphan-embed-badge` present, text correct | **VERIFIED FIXED** |
| BUG-4 — stale dist tree | P1 | (not fixed, out of scope) | n/a | **OUT OF SCOPE** |

**Regressions observed:** none. All 3 in-scope fixes confirmed. The build-pipeline gap (BUG-4) persisted as expected — the renderer bundle must be rebuilt manually after source changes before the fix is observable in-browser. This is a pre-existing workflow issue, not introduced by the fixes.

**Kernel cleanup:** kernel process killed after verification (SIGTERM sent to PID 3931769).
