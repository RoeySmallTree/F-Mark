# Density: actually apply it throughout the renderer

## Goal

The Settings → Appearance density toggle (`compact` / `comfortable` / `spacious`)
is wired end-to-end (UI → `applyDensity()` → `body.density-*` class → localStorage)
but only **one** CSS rule consumes the class: the existing `.feed-inner` padding/gap
override in `packages/renderer/src/modals/modals.css` (~line 863, in the "Density
variants" block at the very bottom — confusingly parked in `modals.css`).

Make the density choice visibly affect spacing throughout the renderer UI:
feed cards, panels, modals, popovers, compose bar. `comfortable` (the default)
must look **pixel-identical to today** — only `compact` and `spacious` should
change anything visually.

## Context

### Package & build
- Package under work: `@f-mark/renderer` (path: `packages/renderer`).
- Build/test from repo root or with `pnpm -F @f-mark/renderer <script>`.
  - Test: `pnpm -F @f-mark/renderer test`
  - Build (tsc + vite): `pnpm -F @f-mark/renderer build`
- The other packages (`f-mark` kernel, `@f-mark/shared`) are **not** touched.

### Density plumbing (already in place — do not change behavior)
- `packages/renderer/src/themes/density.ts` — `DensityName`, `applyDensity()`,
  `getCurrentDensity()`, `subscribeDensity()`. Adds body class
  `density-compact|density-comfortable|density-spacious`. Default `comfortable`.
- `packages/renderer/src/main.tsx` — calls `applyDensity(getCurrentDensity())`
  before first render (no FOUC).
- `packages/renderer/src/modals/settings/Appearance.tsx` — the segmented
  control that calls `applyDensity`.
- `packages/renderer/tests/modals/settings.test.tsx` — tests `applyDensity`
  is invoked on click. **Do not break this test.**

### CSS architecture
Imports come from `packages/renderer/src/styles.css`:
```
@import "./themes/tokens.css";        // theme color/typography vars on body.theme-*
@import "./themes/structural.css";    // per-theme structural overrides
@import "./render/render.css";        // markdown rendering (out of scope)
@import "./shell/shell.css";          // topbar, rails, panels, compose
@import "./cards/cards.css";          // feed cards (msg/prose/choices/embed/todo/file)
@import "./modals/modals.css";        // modal frame + settings + new-session + density block
@import "./modals/cmdk/cmdk.css";     // cmd-k palette (out of scope)
@import "./popovers/popovers.css";    // popovers (presets / log filter / etc.)
@import "./overlays/overlays.css";    // toast/notification overlays
```

Theme tokens (in `tokens.css`) follow the convention: defaults on `:root`,
overrides on `body.theme-<name>{ --foo: ...; }`. Mirror that pattern for
density.

### The current single density rule (will be replaced)
In `packages/renderer/src/modals/modals.css` (~line 862):
```css
/* ============ Density variants ============ */
body.density-compact .feed-inner    { padding: 18px 28px 60px;  gap: 12px; }
body.density-comfortable .feed-inner{ padding: 36px 28px 80px;  gap: 18px; }
body.density-spacious .feed-inner   { padding: 52px 32px 100px; gap: 26px; }
```
The `comfortable` row matches the hardcoded `.feed-inner` rule in `shell.css`
(line 30-37: `padding: 36px 28px 80px; gap: 18px;`). Keep this exact mapping
for the comfortable case.

## Approach (recommended — depart only with reason logged)

Mirror the theme-token pattern. Introduce a small, explicit set of density
CSS variables, **defined per density on `body.density-*`**, and replace the
relevant hardcoded paddings/gaps/margins with `var(--foo)` references.

### Step 1 — Create `packages/renderer/src/themes/density.css`

A new sibling to `tokens.css` / `structural.css`. Define the tokens. Examples
(use these names; you may add more if a spot truly needs it):

```css
/* ============ Density tokens ============ */
/* Defaults = comfortable. Keeps initial paint identical if a body has no
   density class yet. */
:root {
  /* Feed (the main scrolling card area) */
  --feed-pad-y-top: 36px;
  --feed-pad-y-bot: 80px;
  --feed-pad-x: 28px;
  --feed-gap: 18px;

  /* Cards (msg/prose/choices/embed/todo/file) */
  --card-head-pad-y: 12px;
  --card-head-pad-x: 16px;
  --card-body-pad-y: 18px;
  --card-body-pad-x: 22px;
  --card-foot-pad-y: 8px;
  --card-foot-pad-x: 18px;

  /* Prose-specific (its body uses asymmetric padding) */
  --prose-body-pad-y: 22px;
  --prose-body-pad-r: 64px;
  --prose-body-pad-l: 30px;

  /* Side panels (left/right) */
  --panel-head-pad-y: 12px;
  --panel-head-pad-x: 14px;
  --panel-scroll-pad-y: 14px;
  --panel-scroll-pad-x: 14px;
  --panel-list-pad-y: 4px;
  --panel-list-pad-x: 8px;
  --session-item-pad-y: 8px;
  --session-item-pad-x: 10px;

  /* Modals */
  --modal-head-pad-y: 18px;
  --modal-head-pad-x: 22px;
  --modal-body-pad-y: 16px;
  --modal-body-pad-x: 22px;
  --modal-foot-pad-y: 12px;
  --modal-foot-pad-x: 18px;
  --form-row-mb: 12px;

  /* Popovers */
  --pop-head-pad-y: 11px;
  --pop-head-pad-x: 14px;
  --pop-section-pad-y: 12px;
  --pop-section-pad-x: 14px;

  /* Compose bar */
  --compose-pad-y: 12px;
  --compose-pad-x: 14px;
  --compose-inner-gap: 8px;
  --compose-box-pad-y: 10px;
  --compose-box-pad-x: 14px;
}

body.density-comfortable { /* (defaults; explicit for symmetry) */ }

body.density-compact {
  --feed-pad-y-top: 18px; --feed-pad-y-bot: 60px; --feed-pad-x: 28px; --feed-gap: 12px;
  --card-head-pad-y: 8px;  --card-body-pad-y: 12px; --card-foot-pad-y: 6px;
  --prose-body-pad-y: 14px; --prose-body-pad-r: 48px; --prose-body-pad-l: 22px;
  --panel-head-pad-y: 8px;  --panel-scroll-pad-y: 8px;  --panel-list-pad-y: 2px;
  --session-item-pad-y: 5px;
  --modal-head-pad-y: 12px; --modal-body-pad-y: 10px; --modal-foot-pad-y: 8px;
  --form-row-mb: 8px;
  --pop-head-pad-y: 8px;    --pop-section-pad-y: 8px;
  --compose-pad-y: 8px;     --compose-inner-gap: 6px;  --compose-box-pad-y: 7px;
}

body.density-spacious {
  --feed-pad-y-top: 52px; --feed-pad-y-bot: 100px; --feed-pad-x: 32px; --feed-gap: 26px;
  --card-head-pad-y: 16px; --card-body-pad-y: 26px; --card-foot-pad-y: 12px;
  --prose-body-pad-y: 30px; --prose-body-pad-r: 80px; --prose-body-pad-l: 38px;
  --panel-head-pad-y: 16px; --panel-scroll-pad-y: 20px; --panel-list-pad-y: 6px;
  --session-item-pad-y: 11px;
  --modal-head-pad-y: 24px; --modal-body-pad-y: 22px; --modal-foot-pad-y: 16px;
  --form-row-mb: 18px;
  --pop-head-pad-y: 14px;   --pop-section-pad-y: 16px;
  --compose-pad-y: 16px;    --compose-inner-gap: 12px; --compose-box-pad-y: 13px;
}
```

You can adjust the spacious/compact values if a number looks visually off —
just preserve the **comfortable = current-literal** rule.

### Step 2 — Wire `density.css` into the build

Add `@import "./themes/density.css";` to `packages/renderer/src/styles.css`,
immediately after `tokens.css` and `structural.css`. Order matters only
relative to the rules that consume the vars — putting it third (after
structural) keeps the existing tokens.css/structural.css layering intact.

### Step 3 — Replace hardcoded values with tokens

In each file below, change ONLY the listed properties to use the new vars.
Do not touch colors, borders, border-radius, box-shadow, fonts, font-sizes,
line-heights, or non-spacing transitions/widths.

**`packages/renderer/src/shell/shell.css`**
- `.feed-inner` (line 30) → `padding: var(--feed-pad-y-top) var(--feed-pad-x) var(--feed-pad-y-bot); gap: var(--feed-gap);`
- `.panel-head` (line 369) → use `var(--panel-head-pad-y)` for top/bottom and `var(--panel-head-pad-x)` for sides (keep the existing 8px bottom-vs-top asymmetry if you prefer — or collapse to symmetric, your call; log the decision).
- `.panel-scroll` (line 589) → `padding: var(--panel-scroll-pad-y) var(--panel-scroll-pad-x) calc(var(--panel-scroll-pad-y) * 1.5);` (or similar — keep the original 24px bottom asymmetry intent).
- `.panel-list` (line 434) → `padding: var(--panel-list-pad-y) var(--panel-list-pad-x) calc(var(--panel-list-pad-y) * 3);`
- `.session-item` (line 448) → `padding: var(--session-item-pad-y) var(--session-item-pad-x);`
- `.compose` (line 596) → `padding: var(--compose-pad-y) var(--compose-pad-x) calc(var(--compose-pad-y) + 2px);`
- `.compose-inner` → `gap: var(--compose-inner-gap);`
- `.compose-box` (line 665) → `padding: var(--compose-box-pad-y) var(--compose-box-pad-x);`

**`packages/renderer/src/cards/cards.css`**
- `.prose-head` (line 124) → `padding: var(--card-head-pad-y) calc(var(--card-head-pad-x) + 2px);`
- `.prose-body` (line 189) → `padding: var(--prose-body-pad-y) var(--prose-body-pad-r) var(--prose-body-pad-y) var(--prose-body-pad-l);`
- `.prose-body.user` (line 193) → `padding-left: var(--prose-body-pad-l);`
- `.prose-foot` (line 357) → `padding: var(--card-foot-pad-y) calc(var(--card-foot-pad-x) + 0px) calc(var(--card-foot-pad-y) + 2px);`
- `.choices-head` (line 403), `.embed-head` (line 544), `.todo-card` head (find it), `.file-card` head (find it) → all use `var(--card-head-pad-y) var(--card-head-pad-x)`.
- `.choices-body` (line 429) → `padding: var(--card-body-pad-y) var(--card-body-pad-x) calc(var(--card-body-pad-y) - 2px);`
- `.embed-foot` (line 618) → use card-foot tokens, preserve the existing asymmetric bottom padding intent.

For any card sub-element you can't easily map, prefer **leaving it alone** over
forcing a token in. Density should affect "outer rhythm" — head/body/foot
padding and inter-card gap — far more than micro-paddings inside a row.

**`packages/renderer/src/modals/modals.css`**
- `.modal-head` (line 35) → `padding: var(--modal-head-pad-y) var(--modal-head-pad-x) calc(var(--modal-head-pad-y) * 2/3);`
- `.modal-body` (line 61) → `padding: var(--modal-body-pad-y) var(--modal-body-pad-x);`
- `.modal-foot` (line 65) → `padding: var(--modal-foot-pad-y) var(--modal-foot-pad-x);`
- `.form-row` (line 86) → `margin-bottom: var(--form-row-mb);`
- **DELETE** the old "============ Density variants ============" block at
  the bottom (lines 863-875). It's now superseded by `.feed-inner` consuming
  the tokens in `shell.css`.

**`packages/renderer/src/popovers/popovers.css`**
- `.pop-head` (line 35) → `padding: var(--pop-head-pad-y) var(--pop-head-pad-x);`
- `.pop-section` (line 46) → `padding: var(--pop-section-pad-y) var(--pop-section-pad-x);`

### Step 4 — Sanity-check the visual delta

After the swap, the **comfortable** body class must render the exact same
pixel padding as today (since you set defaults to the current literals and
your `body.density-comfortable` is a no-op override). Open one of the
existing prose tests or just `grep` for the literal values you replaced —
none should remain in spots you converted.

You do NOT need to add a new unit test that asserts CSS values. The existing
`settings.test.tsx` density test already covers the dispatch path.

## Deliverables

- New file: `packages/renderer/src/themes/density.css` with the token map.
- `packages/renderer/src/styles.css` imports the new file.
- `packages/renderer/src/shell/shell.css` — feed/panel/compose padding & gap
  rules read from tokens.
- `packages/renderer/src/cards/cards.css` — card head/body/foot padding rules
  read from tokens (prose, choices, embed, todo, file).
- `packages/renderer/src/modals/modals.css` — modal head/body/foot + form-row
  read from tokens; old `.feed-inner` density block deleted.
- `packages/renderer/src/popovers/popovers.css` — popover head/section read
  from tokens.

## Constraints

- **Do not change**: colors, borders, border-widths, border-radius,
  box-shadows, fonts, font-sizes, font-weights, letter-spacing, line-heights,
  transitions, widths (except where width is purely padding-derived), z-index,
  positioning, display modes, animations.
- **Do not change**: any TypeScript file. The density.ts module already does
  the right thing. The Settings UI already triggers it.
- **Do not change**: tests. The existing density test in
  `tests/modals/settings.test.tsx` must keep passing untouched.
- **Do not change**: package names, build scripts, or dependencies.
- **Do not introduce** new themes, new density names, new persistence keys,
  or refactor unrelated CSS.
- **comfortable must visually equal current `main`.** This is the hard
  acceptance bar. If you have to choose between elegant tokenization and
  preserving the literal, preserve the literal.
- Don't add CSS comments explaining the token map beyond the section banner
  itself — the property names are self-documenting.

## Definition of done

1. `pnpm -F @f-mark/renderer test` passes.
2. `pnpm -F @f-mark/renderer build` succeeds (tsc + vite, no errors).
3. `git diff --stat` shows changes only in:
   `packages/renderer/src/themes/density.css` (new),
   `packages/renderer/src/styles.css`,
   `packages/renderer/src/shell/shell.css`,
   `packages/renderer/src/cards/cards.css`,
   `packages/renderer/src/modals/modals.css`,
   `packages/renderer/src/popovers/popovers.css`,
   and `planning/density/*` (the planning artifacts).
   No other files.
4. `grep -n "body.density-" packages/renderer/src/modals/modals.css`
   returns nothing (the old block is gone).
5. `grep -n "body.density-" packages/renderer/src/themes/density.css`
   returns the three density override blocks.
6. A spot-check `grep -n "padding: 36px 28px 80px" packages/renderer/src`
   returns nothing — the literal feed padding has migrated to tokens.
