# P3 — MarkdownRenderer + JsonRenderer (multi-mode + collapsible)

## Intent

Mirror the spirit of `cabal-be/.../MarkdownRenderer.tsx` + `AccordionMarkdown.tsx` but generalized:
- Markdown renderer with three modes: `rendered`, `source`, `accordion` (H1/H2 collapsible).
- JSON renderer with three modes: `tree` (collapsible `<details>`), `source`, `table` (homogeneous-object array → table).
- A reusable segmented `ModeToggle` driven by both.
- All visual chrome must work across the six F-Mark themes (no CABAL-specific dark classes).

## Commit

`93bf3b5 feat(renderer): markdown + json renderers with multi-mode + collapsible`

## Files created

- `packages/renderer/src/render/MarkdownRenderer.tsx`
- `packages/renderer/src/render/AccordionMarkdown.tsx`
- `packages/renderer/src/render/JsonRenderer.tsx`
- `packages/renderer/src/render/ModeToggle.tsx`
- `packages/renderer/src/render/copy.ts`
- `packages/renderer/src/render/render.css`
- `packages/renderer/tests/render/markdown.test.tsx`
- `packages/renderer/tests/render/json.test.tsx`
- `packages/renderer/tests/render/mode-toggle.test.tsx`

## Files modified

- `packages/renderer/package.json` — added `marked@^14.1.3`, `lucide-react@^0.469.0`.
- `packages/renderer/src/styles.css` — added `@import "./render/render.css"`.
- `pnpm-lock.yaml`
- `planning/redesign/progress.md`

## Verification done by implementer

- `pnpm -F @f-mark/renderer test` → 35 passed (5 markdown + 6 json + 4 toggle on top of the 20 pre-existing).
- `pnpm -F @f-mark/renderer build` → clean, 302 modules, 315 kB JS.

## What you (Codex) verify

Read `git show 93bf3b5` and the new files. For each item, return PASS / FAIL with one short line:

1. **Markdown modes complete:** `rendered` produces `marked`-parsed HTML inside a class indicating themed prose; `source` shows raw markdown in a `<pre>`-styled box; `accordion` produces collapsible `<button>`+`<chevron-right>` per `#` heading with nested `##` collapsibles inside. Code fences must NOT be split incorrectly (parser preserves fence content).
2. **JSON tree mode:** primitives render with distinct typed classes (`fm-json-string`, `fm-json-number`, `fm-json-bool`, `fm-json-null`); nested objects/arrays each render their own `<details>`; the test for `{a:{b:1}, c:[2,3]}` passes per spec (root open, descendants closed); "expand all" / "collapse all" buttons exist and work.
3. **JSON source mode:** `JSON.stringify(value, null, 2)` in a `<pre>`.
4. **JSON table mode:** homogeneous-object array renders `<table>` with union-of-keys columns; non-homogeneous fallback to tree. Verify the fallback path with a test or a code-read.
5. **ModeToggle:** generic over option type, active option has class `on`, click fires `onChange(next)`.
6. **Theming:** every `fm-*` class uses CSS variables (`var(--canvas)`, `var(--ink)`, `var(--line)`, `var(--panel)`, `var(--mono)`, `var(--serif)`, `var(--radius)`, `var(--user)`, `var(--agent)`, `var(--green)`, etc.). No hard-coded colors that would break dark themes. Verify by grepping `render.css` for `#[0-9a-fA-F]` (should be empty or rare) and for `rgb(`.
7. **Scope hygiene:** only files inside `packages/renderer/src/render/`, the corresponding tests dir, `package.json`, `pnpm-lock.yaml`, `styles.css`, and `progress.md` were touched. No layout/card/store/kernel files modified.

End with: "Overall verdict: ready to advance" OR "Overall verdict: fix the following before advancing: …"

Write your review to `/home/roey/workspace/F-Mark/planning/redesign/buddy/p3/review_1.md`. Do not modify any source files.
