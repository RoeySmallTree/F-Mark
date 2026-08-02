# Aurora Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Aurora design system on F-Mark's existing token contract, fix seven ships-broken defects, enforce the quality floor with tests, and wire nine user-facing improvements — without renaming a single token or touching the event aggregator.

**Architecture:** Aurora's *values* are mapped onto the *existing* Ledger token names, because 5,751 `var()` call sites consume them (verified 2026-08-02). Three themes live in `themes/tokens.css` as `:root` (aurora-dark, default) plus `body.night` → aurora-light and `body.contrast` → unchanged. Two guard tests — one extending the existing contrast test, one new — make the quality floor mechanical rather than remembered. Improvements reuse machinery that already exists in the renderer rather than inventing parallel systems.

**Tech Stack:** React 18 · Vite · Zustand · vanilla CSS custom properties · Vitest 2 · pnpm 10.33.2 workspace

---

## Context an implementer cannot guess

**You are on branch `feature/ui-redesign-ledger`** in a git worktree at
`/Users/oranefroni/Projects/F-Mark/.claude/worktrees/ui-redesign-ledger`.
Run everything from there. Do **not** `cd` to the main checkout.

**The design spec is `DESIGN.md` at the repo root.** Read it before Task 1. It is the source of
truth for *intent*. It is **not** accurate about token *names* — see the mapping in Task 2.

**Supporting review:** `docs/ui-sweep/2026-08-02-polish-review.md` — 31 findings from four
independent reviewers, with the ones this plan implements marked.

### Facts verified on 2026-08-02 (do not re-derive, do not doubt)

| Fact | Value |
|---|---|
| `var()` call sites in component CSS | **5,751** |
| `--ink` / `--canvas` / `--agent` / `--panel` usages | 588 / 515 / 324 / 297 |
| Aurora names (`--tx`, `--ac`, `--solid`, `--hot`) usages | **0** — they do not exist |
| Node version in this environment | **v25.8.1** |
| `packages/renderer/tests/token-contrast.test.ts` | exists, parses `tokens.css` comments |

### Gotchas that will cost you an hour each

1. **Node 25 breaks the renderer test suite.** Node ships an inert
   `globalThis.localStorage` with no `.clear()`, which shadows jsdom's. The repo targets Node 20.
   **~32 renderer test FILES are red before you touch anything.** This is the baseline, not a
   regression. Task 0 records it.
2. **Never compare failure *counts*.** Diff the failing **FILE SET** against the recorded
   baseline. Counts drift as tasks add tests, and that drift is where a real regression hides.
3. **`pnpm -F @f-mark/shared build` is mandatory** before any renderer or kernel test run, or 73
   kernel files fail to *collect*.
4. **Two vitest roots:** `src/**/*.test.{ts,tsx}` AND `tests/**/*.test.{ts,tsx}`. A run scoped to
   one reports green while missing the other.
5. **CSS load order is load-bearing.** In `styles.css`: `themes/interaction.css` loads **early**
   (zero-specificity `:where()` baseline, meant to be overridable);
   `themes/surface.css` loads **LAST** (its rules must win). Putting a surface rule in
   `interaction.css` silently does nothing.
6. **`overflow-x: clip`, never `hidden`.** This repo has 11 `position: sticky` rules across 5
   files; `hidden` creates a scroll container and traps every one.
7. **Never `git stash`.** The stash stack is shared across worktrees and other sessions. Use a
   WIP commit.
8. **Do not push and do not open a PR.** Not without explicit approval from Oran.
9. **`AgentKindArt` case-collision:** two tracked files differ only in case, which on macOS makes
   ~42 renderer test files red. Oran has an **uncommitted fix in the main working tree**. Do not
   duplicate it, do not "fix" it here.

---

## Global Constraints

- **Do not rename any CSS custom property.** 5,751 call sites depend on the current names.
- **Do not modify** `state/aggregate/EventAggregator.ts` or `feed/projectFeed.ts`. Out of scope.
- **No new dependencies.** None. Not one.
- **One meaning per channel** (from `DESIGN.md`): ink level = hierarchy · `--agent`/`--ledger`
  green = an agent is working · `--alarm` = destruction/blocked · participant hue = who ·
  tool hue = what kind. Never give a channel a second meaning.
- **Every ratio written into `tokens.css` must be computed, never estimated.** Run the test and
  paste its output.
- **Quality floor, non-negotiable on every surface touched:** `:focus-visible` ring is instant
  (never transitioned) · `:active` and `:disabled` styled with `not-allowed` on disabled ·
  `prefers-reduced-motion` honoured · no horizontal scroll 320–1920px · WCAG AA on all text.
- **Commit after every task.** Imperative mood, no emojis, no "Generated with" footer.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/renderer/src/themes/tokens.css` | all three themes' values | **rewrite values, keep every name** |
| `packages/renderer/src/themes/surface.css` | depth, identity colour, tool hue, motion (loads LAST) | modify |
| `packages/renderer/src/themes/interaction.css` | overridable `:where()` interaction baseline | modify |
| `packages/renderer/tests/token-contrast.test.ts` | asserts recorded ratios are real | **extend to all 3 themes** |
| `packages/renderer/tests/quality-floor.test.ts` | asserts the floor mechanically | **create** |
| `packages/renderer/src/shell/shell.css` | feed rows, fresh edge, unread floater | modify |
| `packages/renderer/src/shell/Feed.tsx` | j/k binding, participant-focus listener | modify |
| `packages/renderer/src/cards/toolUseCard/ToolUseHeader.tsx` | copy-on-click, completion sweep | modify |
| `packages/renderer/src/panels/right/agents/RightAgentControls.tsx` | live wait timer, busy states | modify |

---

## Task 0: Record the baseline

**Files:** none modified — this task only records state.

**Interfaces:**
- Produces: `/tmp/aurora-baseline.json` — the failing-test FILE SET every later task diffs against.

- [ ] **Step 1: Build shared (mandatory before any test run)**

```bash
pnpm -F @f-mark/shared build
```

- [ ] **Step 2: Record the failing FILE SET**

```bash
pnpm -F @f-mark/renderer test --run --reporter=json --outputFile=/tmp/aurora-raw.json 2>&1 | tail -5
node -e '
const r=require("/tmp/aurora-raw.json");
const failed=[...new Set(r.testResults.filter(t=>t.status!=="passed").map(t=>t.name))].sort();
require("fs").writeFileSync("/tmp/aurora-baseline.json",JSON.stringify(failed,null,2));
console.log("baseline failing files:",failed.length);
'
```

Expected: a number around 32. **Whatever it prints is the baseline.** Do not try to fix these.

- [ ] **Step 3: Verify the build is green**

```bash
pnpm -F @f-mark/renderer build
```

Expected: exits 0.

- [ ] **Step 4: Commit the baseline record**

```bash
mkdir -p docs/ui-sweep
cp /tmp/aurora-baseline.json docs/ui-sweep/2026-08-02-test-baseline.json
git add docs/ui-sweep/2026-08-02-test-baseline.json
git commit -m "chore(test): record pre-Aurora failing-file baseline

Node 25 shadows jsdom's localStorage with an inert built-in lacking .clear(),
so these files fail before any Aurora change. Later tasks diff the failing
FILE SET against this, never the count."
```

---

## Task 1: Extend the contrast test to all three themes

Write the test **before** changing any value, so it fails against Ledger and passes against
Aurora. This is the guard that makes Task 2 safe.

**Files:**
- Modify: `packages/renderer/tests/token-contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a test that parses `/* N.NN:1 */` comments in `tokens.css` and asserts each against a
  computed ratio, **per theme block**, against every surface that theme uses.

- [ ] **Step 1: Read the existing test to match its parsing style**

```bash
cat packages/renderer/tests/token-contrast.test.ts
```

It already has `channel()`, `luminance()`, `contrast()` helpers and a `Claim` interface. Reuse
them — do not rewrite them.

- [ ] **Step 2: Add the multi-surface assertion**

Append to `packages/renderer/tests/token-contrast.test.ts`:

```ts
/* Aurora surfaces. A token must pass AA against EVERY surface its theme puts
   text on — not just the darkest one. The light theme in particular has three
   (canvas, panel, panel-2) and an accent that passes on one can fail on
   another. */
const SURFACES_BY_THEME: Record<string, string[]> = {
  root: ["--canvas", "--panel", "--panel-2"],
  night: ["--canvas", "--panel", "--panel-2"],
  contrast: ["--canvas", "--panel"],
};

/* Tokens that carry TEXT and must therefore meet AA (4.5:1).
   --ink-4 is deliberately excluded: it is documented debt (2.57:1, ~214 text
   call sites) and splitting its text/border roles is a separate task. */
const TEXT_TOKENS = ["--ink", "--ink-2", "--ink-3", "--ledger", "--alarm", "--agent"];

function themeBlock(css: string, theme: string): string {
  const marker = theme === "root" ? ":root {" : `body.${theme} {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`theme block not found: ${theme}`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

function tokenValue(block: string, name: string): string | null {
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1] : null;
}

describe("every text token meets AA on every surface of its theme", () => {
  for (const [theme, surfaces] of Object.entries(SURFACES_BY_THEME)) {
    const block = themeBlock(TOKENS, theme);
    for (const token of TEXT_TOKENS) {
      const fg = tokenValue(block, token);
      if (fg === null) continue; /* theme may not redefine every token */
      for (const surfaceName of surfaces) {
        const bg = tokenValue(block, surfaceName);
        if (bg === null) continue;
        test(`${theme} ${token} on ${surfaceName}`, () => {
          expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
```

- [ ] **Step 3: Run it — it MUST fail on the current Ledger values**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/token-contrast.test.ts
```

Expected: **FAIL.** Ledger's `--ink-3` is 5.47:1 on `--canvas` but lower on `--panel-2`, and the
night theme was never checked against three surfaces. If it passes, your `themeBlock` parsing is
wrong — fix that before continuing.

- [ ] **Step 4: Commit the failing guard**

```bash
git add packages/renderer/tests/token-contrast.test.ts
git commit -m "test(themes): assert every text token meets AA on every surface

Extends the existing recorded-ratio check with a stronger claim: a token must
pass AA against each surface its theme actually puts text on, not just the
canvas. Currently RED against Ledger values - Aurora makes it green."
```

---

## Task 2: Map Aurora onto the existing token names

**This is the load-bearing task.** `DESIGN.md` describes Aurora using names that do not exist
(`--tx`, `--ac`, `--solid`). Do **not** create them. Map as follows.

**Files:**
- Modify: `packages/renderer/src/themes/tokens.css`

**Interfaces:**
- Consumes: the test from Task 1.
- Produces: `tokens.css` with Aurora values on Ledger names, three themes, every ratio measured.

### The mapping — Aurora concept → existing token name

| `DESIGN.md` says | Use this existing name | Call sites |
|---|---|---|
| `--canvas` (the void) | `--bg` | 113 |
| `--solid` (opaque content surface) | `--canvas` | 515 |
| `--solid-2` (raised content) | `--panel` | 297 |
| `--solid-3` (hover) | `--panel-2` | — |
| `--tx` | `--ink` | 588 |
| `--tx-2` | `--ink-2` | 180 |
| `--tx-3` | `--ink-3` | 250 |
| `--ac` / `--ok` | `--ledger`, `--agent`, `--green` (all three) | 439 combined |
| `--hot` | `--alarm` | — |
| `--line` / `--line-2` | `--rule`, `--line`, `--line-2`, `--line-3` | — |
| participant: agent | `--agent` | 324 |
| participant: human | `--user` | 141 |

`--ac-2` (violet) has **no** existing equivalent. Do not invent one in this task — Aurora's
violet is used only for the launching-presence state, which is out of scope here.

### STRUCTURE — read before writing a single line

**Two earlier attempts at this mapping were wrong. This is the ruled, verified structure.**

Keep the file's existing shape. Swap Aurora's values into the blocks that already exist:

```
:root                 -> aurora LIGHT   (the classless default — do not move it)
body.theme-night      -> aurora DARK
body.theme-contrast   -> unchanged
```

**Why `:root` must stay light.** `applyTheme` at `themes/index.ts:127` reads
`if (name !== "light") body.classList.add(...)` — the `light` theme deliberately adds **no class**,
so `:root` *is* the light theme. It is documented at `index.ts:6-16`, asserted by two tests in
`tests/themes.test.ts`, and `resolveThemeName` at `:93-99` returns `"light"` for every user with no
stored preference. A `body.theme-light` block would be **dead CSS that nothing ever matches**, and
everyone who picked "Day" would see dark.

**Do NOT create `body.theme-light`. Do NOT edit `themes/index.ts`. Do NOT change any assertion in
`tests/themes.test.ts`.** Those are out of scope; `DESIGN.md`'s dark-first line is being amended to
match this instead.

- [ ] **Step 1: Rewrite `body.theme-night` to aurora-dark**

Replace the surface/ink/rule/accent declarations inside the existing `body.theme-night` block
(starts at `tokens.css:159`) with the values below. **The selector stays `body.theme-night` — only
the values change.**

```css
body.theme-night {
  /* ── Surfaces — AURORA DARK ───────────────────────────────────────────
     Elevation is surface LUMINANCE, not shadow: a lighter surface reads as
     closer. There are no drop shadows in the dark theme. */
  --bg: #0b0d16;        /* the void behind everything */
  --canvas: #12141f;    /* OPAQUE. every surface that carries text */
  --panel: #171a27;     /* raised content: hover, active row, nested panel */
  --panel-2: #1d2130;   /* hover on raised content */
  --paper: #12141f;     /* legacy alias, kept: 0 call sites but referenced in comments */
  --paper-band: #141724;
  --paper-sunk: #0b0d16;

  /* ── Ink ──────────────────────────────────────────────────────────────
     MEASURED against --canvas (#12141f). Do not hand-write these numbers;
     run tests/token-contrast.test.ts and paste its output. */
  --ink: #f0f1f7;   /* 16.26:1 — primary */
  --ink-2: #a8adc4; /*  8.24:1 — secondary */
  --ink-3: #8b91a8; /*  5.86:1 — meta, timestamps. The lightest AA text. */
  --ink-4: #5b607a; /*  2.71:1 — NON-TEXT tier. Documented debt: ~214 sites
                       still set it as `color:`. Do not add new text uses. */

  /* ── Rules ────────────────────────────────────────────────────────────*/
  --rule: rgb(255 255 255 / 10%);
  --rule-strong: rgb(255 255 255 / 17%);
  --line: rgb(255 255 255 / 10%);
  --line-2: rgb(255 255 255 / 7%);
  --line-3: rgb(255 255 255 / 4%);

  /* ── The one accent ───────────────────────────────────────────────────
     Aurora teal. Means: an agent wrote this, or an agent is working. */
  --ledger: #5eead4;      /* 12.39:1 on --canvas */
  --ledger-tint: rgb(94 234 212 / 16%);
  --ledger-tint-2: rgb(94 234 212 / 28%);

  /* ── Authorship ───────────────────────────────────────────────────────*/
  --user: #a8adc4;
  --user-tint: rgb(168 173 196 / 14%);
  --user-tint-2: rgb(168 173 196 / 24%);
  --agent: #5eead4;
  --agent-tint: rgb(94 234 212 / 16%);
  --agent-tint-2: rgb(94 234 212 / 28%);

  /* ── Signals ──────────────────────────────────────────────────────────*/
  --green: #5eead4;       /* 12.39:1 */
  --green-tint: rgb(94 234 212 / 16%);
  --alarm: #fb8fa0;       /*  7.86:1 — destruction and error ONLY */
  --rose: #fb8fa0;
}
```

- [ ] **Step 2: Rewrite `:root` to aurora-light**

`:root` is the classless default and therefore the **light** theme — see the STRUCTURE note above.
Replace its surface/ink/rule/accent declarations with the values below. **The selector stays
`:root`.**

Aurora-light is **not an inversion** of the dark palette. Dark teal measures 1.48:1 on white and is
unusable, so every accent is re-picked. Elevation also switches mechanism — nothing is lighter than
white, so light uses a shadow where dark uses surface luminance.

```css
:root {
  /* ── AURORA LIGHT.
     The canvas is TINTED, never white, so a white card can sit visibly above
     it. On a white canvas white cards vanish and every panel needs a border
     merely to exist. */
  --bg: #e9ecf3;
  --canvas: #ffffff;
  --panel: #f5f6fa;
  --panel-2: #eceef5;
  --paper: #ffffff;
  --paper-band: #f7f8fb;
  --paper-sunk: #e9ecf3;

  /* MEASURED worst-case across --canvas, --panel, --panel-2 */
  --ink: #16181f;   /* 14.99:1 */
  --ink-2: #4a5163; /*  6.71:1 */
  --ink-3: #5f6675; /*  4.87:1 — lightest AA text */
  --ink-4: #8b91a3; /*  2.68:1 — NON-TEXT tier, same debt as dark */

  --rule: rgb(16 20 34 / 11%);
  --rule-strong: rgb(16 20 34 / 19%);
  --line: rgb(16 20 34 / 11%);
  --line-2: rgb(16 20 34 / 7%);
  --line-3: rgb(16 20 34 / 4%);

  --ledger: #0a6b5d;  /* 5.42:1 — dark teal #5eead4 is 1.48:1 here, unusable */
  --ledger-tint: rgb(10 107 93 / 11%);
  --ledger-tint-2: rgb(10 107 93 / 20%);

  --user: #4a5163;
  --user-tint: rgb(74 81 99 / 10%);
  --user-tint-2: rgb(74 81 99 / 18%);
  --agent: #0a6b5d;
  --agent-tint: rgb(10 107 93 / 11%);
  --agent-tint-2: rgb(10 107 93 / 20%);

  --green: #0a6b5d;   /* 5.42:1 */
  --green-tint: rgb(10 107 93 / 11%);
  --alarm: #b02a44;   /* 5.45:1 */
  --rose: #b02a44;
}
```

- [ ] **Step 2b: Leave the contrast test's theme map alone**

`SURFACES_BY_THEME` already covers `root`, `night`, `contrast` — which is exactly the three themes
that exist. **No change needed.** `root` is the light theme and `night` is the dark one, so both
palettes are already under assertion.

Do not add a `light` key. There is no `body.theme-light` block for `themeBlock()` to find, and it
would throw `theme block not found: light`.

### Headroom targets — measured on 2026-08-02, use these

Task 1 measured every assertion against the current Ledger values. One hard failure and six
near-misses. **Aim above 5.5:1 for anything on this list**, not 4.51 — these are the pairs where
a small value tweak flips the theme red:

| theme | token | surface | ratio | |
|---|---|---|---|---|
| night | `--ink-3` | `--panel-2` | **3.882** | **FAIL today** |
| night | `--ink-3` | `--panel` | 4.507 | one nudge from red |
| root | `--ledger` / `--agent` | `--panel-2` | 4.563 | |
| root | `--ink-3` | `--panel-2` | 4.730 | |
| night | `--ink-3` | `--canvas` | 4.856 | |
| root | `--ledger` / `--agent` | `--panel` | 4.978 | |

The pattern is unambiguous: **`--ink-3` and the accent on the `--panel-2` hover surface** are where
this design fails. The Aurora values in Step 1 already target ~5.86:1 for `--ink-3`; verify that
holds on `--panel-2`, not only on `--canvas`.

- [ ] **Step 3: Run the contrast test — it MUST now pass**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/token-contrast.test.ts
```

Expected: **PASS.** If any assertion fails, the printed ratio is the truth — **darken or lighten
the token until it passes, then paste the measured number into the comment.** Never adjust the
comment to match a failing value.

- [ ] **Step 4: Diff the failing FILE SET against the baseline**

```bash
pnpm -F @f-mark/renderer test --run --reporter=json --outputFile=/tmp/aurora-now.json 2>&1 | tail -3
node -e '
const base=require("./docs/ui-sweep/2026-08-02-test-baseline.json");
const now=require("/tmp/aurora-now.json");
const f=[...new Set(now.testResults.filter(t=>t.status!=="passed").map(t=>t.name))].sort();
const added=f.filter(x=>!base.includes(x));
console.log("NEW failing files:",added.length); added.forEach(x=>console.log("  ",x));
'
```

Expected: **`NEW failing files: 0`**. Any new file is a regression you caused — fix it before
committing.

- [ ] **Step 5: Verify build and the static-colour check**

```bash
pnpm -F @f-mark/renderer build
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/themes/tokens.css
git commit -m "feat(themes): land Aurora values on the existing token contract

Aurora dark becomes the default, night becomes Aurora light. Values only -
not one custom property is renamed, because 5751 var() call sites consume
the current names (--ink 588, --canvas 515, --agent 324, --panel 297).

DESIGN.md describes Aurora as --tx/--ac/--solid; those names have zero call
sites and are deliberately NOT introduced. The mapping lives in this plan.

Light is not an inversion: dark teal measures 1.48:1 on white, so every
accent is re-picked, and elevation switches from luminance to shadow because
nothing is lighter than white. Every ratio in the file is computed by
tests/token-contrast.test.ts, which now asserts AA on every surface a theme
puts text on."
```

---

## Task 3: The quality-floor guard test

The floor is currently enforced by memory, and it drifted within days — `overflow-x: hidden`
shipped in a lab despite `DESIGN.md` saying "never `hidden`", and `:active`/`:disabled` went
missing on four surfaces. The contrast rule is enforced by a test and has never drifted. Make the
rest mechanical.

**Files:**
- Create: `packages/renderer/tests/quality-floor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a test asserting three floor rules across all renderer CSS.

- [ ] **Step 1: Write the test**

Create `packages/renderer/tests/quality-floor.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/* The quality floor in DESIGN.md was enforced by memory and drifted within
   days. The contrast rule is enforced by a test and never has. This file
   gives the rest of the floor the same treatment. */

const SRC = path.join(__dirname, "../src");

function cssFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) cssFiles(full, acc);
    else if (entry.endsWith(".css")) acc.push(full);
  }
  return acc;
}

const FILES = cssFiles(SRC).map((f) => ({
  path: path.relative(SRC, f),
  css: readFileSync(f, "utf8"),
}));

describe("quality floor", () => {
  /* This repo has 11 position:sticky rules. overflow-x:hidden on a block that
     does not already scroll creates a NEW scroll container and confines every
     sticky inside it; clip does not.

     A block that already declares overflow-y:auto|scroll is exempt: it is
     already a scroll container, so hidden traps nothing new there. Swapping
     those to `clip` would be a no-op anyway - per spec, `clip` computes back
     to `hidden` when the other axis scrolls. Two such blocks exist today:
     .settings-main (modals.css) and .agent-runtime-pop (chips.css). */
  test("no overflow-x: hidden on a non-scrolling block", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const block of f.css.match(/\{[^}]*\}/g) ?? []) {
        if (!/overflow-x:\s*hidden/.test(block)) continue;
        if (/overflow-y:\s*(auto|scroll)/.test(block)) continue;
        offenders.push(`${f.path}: ${block.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /* A focus ring that fades in cannot be followed while tabbing. */
  test("focus-visible rings are never transitioned", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const blocks = f.css.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? [];
      for (const b of blocks) {
        if (/transition:(?!\s*none)/.test(b)) offenders.push(`${f.path}: ${b.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /* prefers-reduced-motion must kill animation, not merely shorten it.
     A previous revision "reset" durations to a 120ms token, defeating it. */
  test("reduced-motion resets are near-zero, not a duration token", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const blocks = f.css.match(/@media[^{]*prefers-reduced-motion[^{]*\{[\s\S]*?\n\s*\}/g) ?? [];
      for (const b of blocks) {
        if (/animation-duration:\s*var\(/.test(b) || /transition-duration:\s*var\(/.test(b)) {
          offenders.push(f.path);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/quality-floor.test.ts
```

Expected: all three PASS against current renderer source — verified 2026-08-02 across all 29
renderer CSS files. Zero offenders on each rule.

**If any fails, fix the CSS, not the test** — with one exception already ruled on: the two
`overflow-x: hidden` blocks that also scroll on Y (`.settings-main` in `modals.css`,
`.agent-runtime-pop` in `chips.css`) are legitimate and the test is written to exempt them. Do not
"fix" those two, and do not widen the rule back to a blanket ban.

- [ ] **Step 3: Commit**

```bash
git add packages/renderer/tests/quality-floor.test.ts
git commit -m "test(themes): enforce the quality floor mechanically

DESIGN.md's floor was enforced by memory and drifted within days: overflow-x
hidden appeared where the doc says never, and :active/:disabled went missing.
The contrast rule is enforced by a test and has never drifted.

Asserts three rules across all renderer CSS: no overflow-x hidden on a block
that does not already scroll (it would newly trap the 11 sticky rules; a block
already scrolling on Y is exempt, and clip computes back to hidden there
anyway), focus-visible rings never transitioned, and
reduced-motion resets are near-zero rather than a duration token - a previous
revision reset them to a 120ms token, which defeated the reset entirely."
```

---

## Task 4: Wire the four improvements that already exist

Four of the ten prototyped "wins" are already built in the renderer; the work is wiring, not
invention. Verified 2026-08-02.

**Files:**
- Modify: `packages/renderer/src/shell/shell.css`
- Modify: `packages/renderer/src/shell/Feed.tsx`

**Interfaces:**
- Consumes: `useFreshFeedKeys` (already in `shell/useFeedProjection.ts`, exports `freshKeys`);
  `useFeedStepNavigation` (already in `shell/useFeedScrollController.ts`, exports
  `onPrev()`, `onNext()`, `canGoPrev`, `canGoNext`).
- Produces: no new exports.

- [ ] **Step 1: Confirm the substrate exists before writing anything**

```bash
grep -n "freshKeys\|is-fresh" packages/renderer/src/shell/useFeedProjection.ts packages/renderer/src/shell/FeedRows.tsx | head
grep -n "onPrev\|onNext\|canGoPrev" packages/renderer/src/shell/useFeedScrollController.ts | head
```

Expected: `freshKeys` and `.is-fresh` present; `onPrev`/`onNext`/`canGoPrev` present. If either is
missing, **stop and report** — the plan's assumption is wrong.

- [ ] **Step 2: Add the new-event edge (CSS only)**

Append to `packages/renderer/src/shell/shell.css`:

```css
/* New-event edge. `.is-fresh` is already applied per row by FeedRows using
   calculateFreshKeys, which deliberately excludes the initial session load so
   a whole batch never animates at once. This is presentation only.

   It FADES rather than persisting: a permanent marker on every arrival becomes
   wallpaper within a minute. Six seconds is long enough to catch the eye on
   return, short enough not to accumulate. */
.feed-item.is-fresh {
  position: relative;
}
.feed-item.is-fresh::before {
  content: "";
  position: absolute;
  inset-block: 2px;
  inset-inline-start: -6px;
  width: 2px;
  border-radius: 2px;
  background: var(--agent);
  animation: feed-fresh-edge 6s var(--ease-out-quart) forwards;
}
@keyframes feed-fresh-edge {
  0%, 55% { opacity: 1; }
  100% { opacity: 0; }
}
```

- [ ] **Step 3: Bind j/k to the existing navigation**

In `packages/renderer/src/shell/Feed.tsx`, **first add `useEffect` to the React import** — the
file currently imports only `useCallback, useMemo, useState, type JSX` and will not compile
without it. Then add inside the component body:

```tsx
/* j/k reuse the step navigation that already powers FeedNavCluster's buttons.
   Only the key binding is new.

   The guard must cover EVERY editable surface, not just the composer: this app
   also has comment textareas, todo-item editors, session-rename editors and
   the cmdk palette. A composer-only guard lets j/k hijack typing in all of
   them. `closest()` on the active element covers nested editors too. */
useEffect(() => {
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "j" && e.key !== "k") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.isContentEditable || active.closest("input, textarea, [contenteditable]"))
    ) {
      return;
    }
    e.preventDefault();
    if (e.key === "j") scroll.onNext();
    else scroll.onPrev();
  }
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [scroll.onNext, scroll.onPrev]);
```

**Verified 2026-08-02 — use `scroll`, not `navigation`.** `navigation` is a local inside
`useFeedScrollController.ts:96` and never leaves that file. What `Feed.tsx` holds is `scroll`, the
`FeedScrollController` returned at `useFeedScrollController.ts:103-115`, whose exported interface
(`:30-46`) declares `onPrev()`, `onNext()`, `canGoPrev`, `canGoNext` directly on it.

- [ ] **Step 4: Verify build and the baseline file set**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer build
pnpm -F @f-mark/renderer test --run --reporter=json --outputFile=/tmp/aurora-now.json 2>&1 | tail -3
node -e '
const base=require("./docs/ui-sweep/2026-08-02-test-baseline.json");
const now=require("/tmp/aurora-now.json");
const f=[...new Set(now.testResults.filter(t=>t.status!=="passed").map(t=>t.name))].sort();
console.log("NEW failing files:",f.filter(x=>!base.includes(x)).length);
'
```

Expected: build exits 0, `NEW failing files: 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shell/shell.css packages/renderer/src/shell/Feed.tsx
git commit -m "feat(feed): new-event edge and j/k navigation

Both reuse machinery that already existed. calculateFreshKeys already computes
which rows are new and already excludes the initial load; FeedRows already
applies .is-fresh. useFeedStepNavigation already exports onPrev/onNext and
powers the FeedNavCluster buttons.

The edge fades after 6s rather than persisting - a permanent marker on every
arrival becomes wallpaper within a minute.

The j/k guard covers every editable surface, not just the composer: this app
has comment textareas, todo editors, rename editors and the cmdk palette, and
a composer-only guard would let j/k hijack typing in all of them."
```

---

## Task 5: Copy-on-click for tool arguments

`copyToClipboard` already exists in `render/copy.ts` and is used at 8 call sites. The tool chip's
argument — the most copyable text in the app — is the gap.

**Files:**
- Modify: `packages/renderer/src/cards/toolUseCard/ToolUseHeader.tsx`
- Modify: `packages/renderer/src/cards/cards.css`

**Interfaces:**
- Consumes: `copyToClipboard` from `render/copy.ts`.
- Produces: no new exports.

- [ ] **Step 1: Confirm the helper's signature**

```bash
grep -n "export" packages/renderer/src/render/copy.ts
grep -rn "copyToClipboard" packages/renderer/src/cards/ProseCard.tsx | head -3
```

Use whatever signature `ProseCard` uses — match the existing call convention exactly.

- [ ] **Step 2: Add the copy affordance**

In `ToolUseHeader.tsx`, wrap the argument text so clicking copies it, following the
`ProseCard` convention. Add a transient `is-copied` class for ~900ms using `window.setTimeout`,
mirroring the `ANCHOR_FLASH_CLASS` pattern already in `FeedRows.tsx`.

- [ ] **Step 3: Style it**

Append to `packages/renderer/src/cards/cards.css`:

```css
.tool-arg-copy {
  cursor: copy;
  border-radius: 4px;
  padding-inline: 3px;
  margin-inline: -3px;
  transition: background var(--dur-instant) var(--ease-out-quart);
}
.tool-arg-copy:hover { background: var(--agent-tint); color: var(--ink); }
.tool-arg-copy:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.tool-arg-copy.is-copied { background: var(--agent-tint-2); }
```

- [ ] **Step 4: Verify**

```bash
pnpm -F @f-mark/shared build && pnpm -F @f-mark/renderer build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/cards/toolUseCard/ToolUseHeader.tsx packages/renderer/src/cards/cards.css
git commit -m "feat(cards): copy a tool call's argument by clicking it

copyToClipboard already exists and is used at 8 call sites; the tool chip's
argument was the obvious remaining gap and is the most copyable text in the
app. Uses the same transient-class pattern as FeedRows' anchor flash."
```

---

## Task 6: Live wait timer on blocked approvals

The one number whose entire job is "still stuck, and getting worse" currently renders once and
freezes.

**Files:**
- Modify: `packages/renderer/src/cards/AccessRequestCard.tsx`
- Create: `packages/renderer/src/hooks/useElapsed.ts`
- Test: `packages/renderer/tests/useElapsed.test.ts`

**Interfaces:**
- Produces: `useElapsed(since: string | number): string` — returns a human elapsed string that
  re-renders once per second.

- [ ] **Step 1: Write the failing test**

Create `packages/renderer/tests/useElapsed.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatElapsed } from "../src/hooks/useElapsed.js";

describe("formatElapsed", () => {
  test("seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(41_000)).toBe("41s");
  });
  test("minutes and seconds", () => {
    expect(formatElapsed(221_000)).toBe("3m 41s");
  });
  test("hours collapse the seconds", () => {
    expect(formatElapsed(3_700_000)).toBe("1h 1m");
  });
  test("never negative", () => {
    expect(formatElapsed(-5_000)).toBe("0s");
  });
});
```

- [ ] **Step 2: Run it — must fail**

```bash
pnpm -F @f-mark/shared build
pnpm -F @f-mark/renderer test --run tests/useElapsed.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/hooks/useElapsed.ts`:

```ts
import { useEffect, useState } from "react";

/* A blocked agent's wait time is the one number whose whole job is to say
   "still stuck, and getting worse". Rendered once it silently stops being
   true, which erodes trust in it the moment someone notices. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function useElapsed(since: string | number): string {
  const start = typeof since === "number" ? since : Date.parse(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return formatElapsed(now - start);
}
```

- [ ] **Step 4: Run the test — must pass**

```bash
pnpm -F @f-mark/renderer test --run tests/useElapsed.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Use it in the approval card**

In `AccessRequestCard.tsx`, replace the static waiting string with
`useElapsed(event.created_at)` (use whatever timestamp field the event carries — check the
component's existing props before writing).

- [ ] **Step 6: Verify and commit**

```bash
pnpm -F @f-mark/renderer build
git add packages/renderer/src/hooks/useElapsed.ts packages/renderer/tests/useElapsed.test.ts packages/renderer/src/cards/AccessRequestCard.tsx
git commit -m "feat(cards): live wait timer on blocked approvals

The wait time rendered once and froze. It is the one number whose entire job
is to communicate 'still stuck, and getting worse', so a frozen value quietly
stops being true."
```

---

## Task 7: Participant focus — imperative, never React state

**Read this before writing code.** `FeedRows.tsx` has **no `React.memo`** (verified). A natural
implementation using `useState(hoveredParticipantId)` would re-render every card in the feed twice
per hover movement, on the app's densest surface. This must be built imperatively.

**Files:**
- Modify: `packages/renderer/src/shell/FeedRows.tsx` (add one data attribute)
- Modify: `packages/renderer/src/shell/Feed.tsx` (delegated listener — `useEffect` must be added
  to its React import if Task 4 has not already done so)
- Modify: `packages/renderer/src/shell/shell.css`

**Interfaces:**
- Consumes: `scroll.scrollRef` (already exists in `Feed.tsx`).
- Produces: no new exports, no new state.

- [ ] **Step 1: Add the data attribute**

In `FeedRows.tsx`, add `data-participant-id={...}` to each rendered row. Both row types already
have `participant_id` in scope (`event.participant_id` / `group.participant_id`).

- [ ] **Step 2: Add the delegated listener**

In `Feed.tsx`:

```tsx
/* Deliberately imperative. FeedRows is not memoized, so a useState-driven
   version would re-render every card twice per hover movement on the densest
   surface in the app. This matches how useFeedScrollController already treats
   scroll and visibility as DOM-level concerns rather than component state. */
useEffect(() => {
  const root = scroll.scrollRef.current;
  if (!root) return;
  function over(e: MouseEvent): void {
    const av = (e.target as HTMLElement | null)?.closest?.("[data-participant-avatar]");
    if (!av) return;
    const id = av.getAttribute("data-participant-avatar");
    root!.classList.add("is-focusing");
    for (const row of root!.querySelectorAll<HTMLElement>("[data-participant-id]")) {
      row.classList.toggle("is-hi", row.dataset.participantId === id);
    }
  }
  function out(e: MouseEvent): void {
    if (!(e.target as HTMLElement | null)?.closest?.("[data-participant-avatar]")) return;
    root!.classList.remove("is-focusing");
    for (const row of root!.querySelectorAll<HTMLElement>(".is-hi")) row.classList.remove("is-hi");
  }
  root.addEventListener("mouseover", over);
  root.addEventListener("mouseout", out);
  return () => {
    root.removeEventListener("mouseover", over);
    root.removeEventListener("mouseout", out);
  };
}, [scroll.scrollRef]);
```

Add `data-participant-avatar={participantId}` to the avatar element in `ParticipantAvatar.tsx`.

- [ ] **Step 3: Style it**

```css
/* Dimming, never hiding: display:none would make the feed jump under the
   cursor, which is worse than the problem it solves. */
.feed-scroll.is-focusing .feed-item:not(.is-hi) {
  opacity: 0.28;
  transition: opacity var(--dur-fast) var(--ease-out-quart);
}
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm -F @f-mark/shared build && pnpm -F @f-mark/renderer build
git add packages/renderer/src/shell/FeedRows.tsx packages/renderer/src/shell/Feed.tsx packages/renderer/src/shell/shell.css packages/renderer/src/components/ParticipantAvatar.tsx
git commit -m "feat(feed): hover a participant to dim the others

Built imperatively on purpose. FeedRows is not memoized, so a useState-driven
version would re-render every card twice per hover movement on the densest
surface in the app. Matches how useFeedScrollController already treats scroll
and visibility as DOM concerns.

Dims rather than hides: display:none would make the feed jump under the cursor."
```

---

## Self-review

**Spec coverage.** This plan implements: the Aurora token migration (Task 2), the contrast guard
extended to all themes (Task 1), the quality-floor guard (Task 3), and five of the nine starred
improvements (Tasks 4–7). It does **not** implement the remaining four starred improvements
(approval confirmation state, busy states on Spawn/Send/Create, sparkline tinted by outcome, menu
close animation) because three of them belong to screens that do not exist yet.

**Deliberately deferred, each needing its own plan:**

| Plan | Why separate |
|---|---|
| **Routing** (`/`, `/session/:id`, `/session/:id/agent/:tmux`) | changes the shell; everything below depends on it |
| **The dashboard** | a screen that does not exist; needs routing first |
| **The agent screen** | a screen that does not exist; needs routing first |
| **Rail restructure** (9 tabs → 3 groups + one pin) | touches all 9 panels and `dockLayout`; includes the nested-interactive fix |
| **Attention + notifications** | needs a service worker, which the app does not have, and which interacts with `staleChunkReload.ts` |
| **Tier-0 a11y fixes** (tooltip `aria-describedby`, dialog focus trap) | those components do not exist in `src/` yet — they exist only in labs |

**Placeholder scan:** no "TBD", no "add error handling", no "similar to Task N". Three steps say
"check the existing convention before writing" (Tasks 4 Step 3, 5 Step 1, 6 Step 5) — these are
deliberate verification instructions, not placeholders, because the exact local identifier cannot
be known without reading the file.

**Type consistency:** `formatElapsed(ms: number): string` and `useElapsed(since): string` are
defined in Task 6 and used only there. `freshKeys`, `onPrev`, `onNext`, `canGoPrev` are consumed
in Task 4 and are pre-existing — Step 1 of that task verifies them before use.

**Known risk:** Task 2's ratio comments are computed from the values written in the same task. If
the test disagrees, **the test is right**. Adjust the value, re-run, paste the measured number.
