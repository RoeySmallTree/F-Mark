# Composable-Prose QA — Sonnet Pass 1 (T1/T3/T10)

**Date:** 2026-05-23  
**Model:** Claude Sonnet 4.6  
**Branch:** main  
**Kernel:** `node dist/index.js` (rebuilt from source — see BUG-1/BUG-4)  
**Renderer:** Freshly built from current source (`pnpm -F @f-mark/renderer build`)

---

## Test results

| Test | Name | Result | Bugs |
|---|---|---|---|
| T1 | Canonical four-event document | **MOSTLY PASS** (1 failure) | BUG-2 |
| T3 | Orphan block | **MOSTLY PASS** (1 minor failure) | BUG-3 |
| T10 | `/best-practices` endpoint | **PASS** | — |

### T1 detail

- Composable document renders correctly: one `prose-card` containing 3 inline blocks in order `[prose, flow, prose]`. ✓
- Embedded flow has no `.flow-head` chrome. ✓
- "Data flow" sub-section shows `.prose-block-name` h3. ✓
- No standalone `.flow-card` in the feed. ✓
- **FAIL:** Word-count badge shows "0 words" — does not count words from embedded prose blocks. → BUG-2

### T3 detail

- Orphan flow (pointing at non-existent anchor `20990101T000000Z_ag-nobody.prose.md`) renders as a top-level `.flow-card` in the feed. ✓
- No prose-card created for the missing anchor. ✓
- Console clean. ✓
- **FAIL (P3):** No "orphaned embed" badge on the card — visually indistinguishable from a normal top-level flow. → BUG-3

### T10 detail

- `GET /best-practices` returns HTTP 200 `text/markdown`. ✓
- Body is 6620 bytes. ✓
- Contains "Canonical four-event recipe", "Common mistakes", "tombstone". ✓
- Full PASS.

---

## Bugs found

### BUG-1 — P0 — `pnpm dev` fails: `MAX_ATTACHMENT_BYTES` not exported from `files.ts`

`packages/kernel/src/server.ts:13` imports `MAX_ATTACHMENT_BYTES` from `./routes/files.js` but `packages/kernel/src/routes/files.ts` does not export it. Running `pnpm -F f-mark dev` (or `tsx src/index.ts`) throws `SyntaxError` at startup. This blocked the standard QA setup path entirely.

**Fix:** Add `export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;` to `packages/kernel/src/routes/files.ts`.

---

### BUG-2 — P2 — Word-count badge always shows "0 words" for composable docs

`ProseCard`'s word-count logic reads only the anchor's own `content` field (empty for header-only anchors). It does not sum words from the blocks in `consumedBlocksByAnchor`. Result: any composable document built via the `append_to` model shows "0 words" even when it has substantial prose content.

**Fix:** Update the word-count derivation in `ProseCard.tsx` to iterate over all `prose`-kind blocks and sum their `content` word counts.

---

### BUG-3 — P3 — Orphan block has no visual "orphaned embed" badge

A block with a non-existent `append_to` target renders at top level (correct per spec) but with no badge or indicator that it is an orphan. The plan specifies an `"orphaned embed"` badge. Without it, authors cannot easily identify which events failed to attach to their anchor.

**Fix:** Pass `orphanedAppendTo` prop to card renderers in `EventCard.tsx` when the block is in `orphanBlocks`; render a small badge in `FlowCard`, `EmbedCard`, etc.

---

### BUG-4 — P1 — Committed `dist/` is stale (pre-phase-4 kernel + pre-phase-5 renderer)

The `dist/` tree committed to the repo was compiled before phases 4–13. Running `node dist/index.js` with the unmodified dist:
- Returns `text/html` (SPA fallback) for `GET /best-practices` (route not registered)
- Renders all `append_to` blocks as standalone top-level cards (composable-prose aggregate missing from renderer bundle)

The QA pass worked around this by rebuilding both kernel and renderer from source. The fix is to either resolve BUG-1 and commit a fresh dist, or document that `tsc --noEmitOnError false && pnpm -F @f-mark/renderer build && node scripts/bundle-renderer.mjs` is required after phase 13.

---

## Environment notes

- `pnpm dev` is broken (BUG-1). The kernel was run via `node dist/index.js` after patching the dist.
- The renderer was built fresh via `pnpm -F @f-mark/renderer build` to include composable-prose (phases 5–12).
- `dist/routes/files.js` was patched in-place to add the missing `MAX_ATTACHMENT_BYTES` export so the rebuilt `server.js` could load.
- Screenshots saved in `planning/composable-prose/qa/screens/`.
