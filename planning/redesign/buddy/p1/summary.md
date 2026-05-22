# P1 — Foundation: themes + fonts + switcher

## Intent

Port the six theme palettes from `planning/redesign/design.html` (the source-of-truth HTML prototype) into the renderer as CSS variables, plus structural overrides per theme. Add Google Fonts. Body class swaps the active theme; preference persists in localStorage. No visual UI change yet — just infrastructure.

## Strategy

- CSS variables live in `packages/renderer/src/themes/tokens.css` (palette per theme).
- Structural rules (brutalist no-transitions / radius 0 / thick borders; terminal scanline `::before` + dashed borders; cyber gradients + glows; per-dark-theme `prose-foot` overrides) live in `packages/renderer/src/themes/structural.css`.
- TS module at `packages/renderer/src/themes/index.ts` exposes `applyTheme`, `getCurrentTheme`, `subscribeTheme`, `THEMES`, and storage key `fmark.theme`.
- `applyTheme('light')` removes all `theme-*` classes (light is the default body state).
- Fonts loaded via the verbatim `<link>` from `design.html:9` (Source Serif 4, DM Sans, JetBrains Mono).
- `main.tsx` calls `applyTheme(getCurrentTheme())` before `createRoot().render()` to avoid FOUC.

## Files created

- `packages/renderer/src/themes/tokens.css`
- `packages/renderer/src/themes/structural.css`
- `packages/renderer/src/themes/index.ts`
- `packages/renderer/tests/themes.test.ts` (12 tests)

## Files modified

- `packages/renderer/src/styles.css` (added two `@import` lines above the tailwind directives)
- `packages/renderer/index.html` (preconnect + Google Fonts link)
- `packages/renderer/src/main.tsx` (call `applyTheme(getCurrentTheme())` before mount)
- `planning/redesign/progress.md` (status row appended)

## Verification done by the implementer

- `pnpm -F @f-mark/renderer test themes` → 12 passed
- `pnpm -F @f-mark/renderer test` → 20 passed (no regressions)
- `pnpm -F @f-mark/renderer build` → clean (302 modules, 36.67 kB CSS; visual confirmation that the six theme blocks are in the bundled CSS)

## Commit

`c49cb9e feat(renderer): theme tokens + switcher (6 themes)`

## What you (Codex) are asked to verify

Read the diff `git show c49cb9e` and the source-of-truth prototype `planning/redesign/design.html` (especially lines 11–174 — the CSS-variable + structural-override blocks). For each finding, be specific.

1. **Palette parity (token-by-token):** confirm every CSS variable name + value in `tokens.css` matches the corresponding rule in `design.html`. Call out any drift — wrong hex, missing variable, extra variable, name mismatch.
2. **Structural override parity:** confirm `structural.css` includes every rule from `design.html` lines 112–173 (brutalist `transition:none !important`, brutalist square borders, terminal scanline, terminal dashed prose-head/foot, terminal glow, cyber gradients, cyber prose-card box-shadow, cyber send-btn gradient, the dark-theme foot/hover/dim consolidations). Call out anything dropped.
3. **TS API correctness:** `applyTheme('light')` must produce a body with **no** `theme-*` class (light = default). `applyTheme('cyber')` must produce exactly `class="theme-cyber"`, removing any prior theme class. `subscribeTheme(cb)` must return a working unsubscribe. Storage key must be `fmark.theme`. Test file `themes.test.ts` must cover these explicitly.
4. **Initialisation timing:** `applyTheme(getCurrentTheme())` must run **before** `createRoot(...).render(...)` to prevent FOUC. Verify in `main.tsx`.
5. **No regressions:** confirm the existing 8 renderer tests still pass alongside the 12 new theme tests.
6. **Scope adherence:** confirm no shell/card/store files were touched in this phase.

For each item, return PASS / FAIL with one short line explaining why. End with: "Overall verdict: ready to advance" OR "Overall verdict: fix the following before advancing: …".
