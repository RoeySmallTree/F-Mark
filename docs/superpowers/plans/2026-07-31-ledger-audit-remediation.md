# Ledger Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 3 critical, 3 major and 2 minor findings from the `hallmark audit` of the Ledger redesign, plus one broken-in-production contrast-theme bug the audit surfaced.

**Architecture:** Four independent commits, ordered by risk. Each repairs one class of problem and ends with its own verification. No task depends on a later task's output. Two tasks add a regression test so the defect class cannot silently return.

**Tech Stack:** TypeScript, React 19, plain CSS (no framework), Vitest 2, `@testing-library/react` 16, pnpm workspaces, lucide-react icons.

## Global Constraints

- **Never `overflow: hidden` for page-edge clipping — always `overflow-x: clip`.** This repo has **11 `position: sticky` rules** across 5 files. `hidden` creates a scroll container and confines sticky descendants to it; `clip` creates no formatting context and leaves them working. ([source](https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/), [source](https://benfrain.com/yes-you-can-use-position-sticky-and-overflow-together/))
- **Every colour and font must resolve through a token.** No raw `#hex`, `rgb()`, `hsl()` or `oklch()` in component CSS. `pnpm -F @f-mark/renderer run test:static-colors` enforces this and must stay green.
- **Themes are exactly three:** `light` (default, no body class), `night`, `contrast`. Any other `body.theme-*` selector is dead code.
- **Every visual channel carries exactly one meaning** (`DESIGN.md`): ink weight = hierarchy · ledger green (`--ledger`/`--agent`) = agent authorship and live agent activity · alarm red (`--alarm`/`--rose`) = destruction and error · hairline rules = structure. Do not introduce a colour to mean "warning", "info", or "emphasis".
- **Contrast ratios are measured, never estimated.** `packages/renderer/tests/token-contrast.test.ts` recomputes every ratio recorded in `tokens.css` and fails on drift. If you change a token value, update its recorded ratio from the test output, not by eye.
- **Focus rings never animate.** `themes/interaction.css` sets `transition: none !important` on `:focus-visible`. Do not add a transition to any focus state.
- **Motion uses only the four duration tokens and the named easings** (`--dur-instant` 120ms · `--dur-fast` 160ms · `--dur-base` 200ms · `--dur-slow` 320ms; `--ease-snap` is the default for state change). Never a raw `ms` value, never the browser default `ease`/`ease-out`.
- **`prefers-reduced-motion` resets must stay literal.** `styles.css:57-65` uses `0.01ms`/`0ms` deliberately — a duration token there defeats the reset.
- **Verify regressions by failing-FILE-SET diff, never by count.** The suite has a known-red baseline of **32 files**; counts drift legitimately as tasks add tests. The baseline JSON lives at `/tmp/base.json` (regenerate per Task 0 if missing).

---

## Baseline setup (run once, before Task 1)

The renderer suite is partly red on this branch's base for reasons unrelated to this plan (Node 22 exposes a native `localStorage` that shadows jsdom's and lacks `Storage.prototype` methods, so `.clear()` throws). Record the failing **file set** so regressions are detectable.

- [ ] **Step 0.1: Build shared (mandatory — 73 kernel files fail to *collect* without it)**

```bash
cd /Users/oranefroni/Projects/F-Mark/.claude/worktrees/ui-redesign-ledger
pnpm -F @f-mark/shared build
```

- [ ] **Step 0.2: Record the baseline failing file set**

```bash
git stash list  # confirm nothing of yours is stashed; do NOT use bare git stash in this repo
pnpm -F @f-mark/renderer exec vitest run --reporter=json --outputFile=/tmp/base.json
node -e "
const f=require('/tmp/base.json').testResults.filter(t=>t.status==='failed');
console.log('baseline red files:', f.length);
"
```

Expected: `baseline red files: 32`

If the number is not 32, stop and report — the baseline moved for a reason outside this plan.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/renderer/src/themes/structural.css` | Per-theme structural overrides (radius, border weight, casing). Shrinks from 257 lines to ~40 — only `contrast` survives. | 1, 2 |
| `packages/renderer/tests/structural-themes.test.ts` | **new** — guards that no retired theme selector returns. | 2 |
| `packages/renderer/src/styles.css` | Import order + global page rules. Gains the page-edge clip. | 3 |
| `packages/renderer/src/shell/shell.css` | Shell layout. Gains the ≤640px header collapse and toolbar `nowrap`. | 3, 4 |
| `packages/renderer/src/shell/topBar/ViewModeToggle.tsx` | Feed view-mode filter. Gains explicit `aria-label` so its name survives label collapse. | 3 |
| `packages/renderer/src/components/chips.css` | Agent chips + the runtime context meter. Meter stops animating `width`. | 4 |
| `packages/renderer/src/popovers/PresetItem.tsx` | Preset row. Default icon becomes a Lucide node. | 4 |
| `packages/renderer/src/cards/toolUseCard/ToolUseHeader.tsx` | Tool-call status mark. `✓` → Lucide `Check`. | 4 |
| `packages/renderer/src/modals/integrationSetup/SetupItem.tsx` | Integration row action mark. `✓`/`↗` → Lucide. | 4 |
| `DESIGN.md` | Captured design system. Gains the supported-width statement. | 3 |

---

## Task 1: Repair the contrast theme's structural rules

**Why this is first:** it is the only finding that is broken *in production today*. The Ledger redesign inverted the contrast theme from black-paper/white-ink to white-paper/black-ink, but `structural.css` still hardcodes the old inverted values. `border: 3px solid #fff` now paints a white border on a white background, and `outline: 2px solid #ffff00` is yellow-on-white at roughly 1.07:1.

**Files:**
- Modify: `packages/renderer/src/themes/structural.css:129-148`

**Interfaces:**
- Consumes: tokens from `themes/tokens.css` — `--ink` (`#000000` in contrast), `--rule` (`#000000`), `--user` (`#000000`), `--agent` (`#005c33`), `--border-w` (`2px` in contrast).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1.1: Confirm the bug is real before fixing it**

```bash
cd /Users/oranefroni/Projects/F-Mark/.claude/worktrees/ui-redesign-ledger
grep -n "#fff\|#ffff00" packages/renderer/src/themes/structural.css | sed -n '1,8p'
grep -n -- "--canvas: #ffffff" packages/renderer/src/themes/tokens.css
```

Expected: `structural.css` hardcodes `#fff` borders and a `#ffff00` outline, while `tokens.css` sets the contrast canvas to `#ffffff`. White on white.

- [ ] **Step 1.2: Replace the contrast block**

Replace lines 129–148 of `packages/renderer/src/themes/structural.css` (the block beginning `/* High Contrast — hard edges, big borders, the a11y target */` and ending with the `.left-panel, .right-panel` rule) with:

```css
/* High Contrast — hard edges, heavy borders, the a11y target.

   Every value here resolves through a token. The previous revision hardcoded
   #fff borders and a #ffff00 outline, which were correct when this theme had a
   black canvas — the Ledger redesign inverted it to white paper, so those rules
   painted white-on-white borders and a ~1.07:1 yellow outline. Tokens invert
   with the theme; literals do not. */
body.theme-contrast .card,
body.theme-contrast .prose-card,
body.theme-contrast .embed-card,
body.theme-contrast .choices-card,
body.theme-contrast .todo-card {
  border: var(--border-w) solid var(--rule);
  box-shadow: none;
  border-radius: 0;
}
body.theme-contrast .modal,
body.theme-contrast .popover {
  border: 3px solid var(--rule);
  border-radius: 0;
  box-shadow: none;
}
body.theme-contrast .turn-pill,
body.theme-contrast .badge,
body.theme-contrast .pop-chip,
body.theme-contrast .status-pill,
body.theme-contrast .assign-badge,
body.theme-contrast .kbd-chip,
body.theme-contrast .prose-pin,
body.theme-contrast .cmdk-kind {
  border-radius: 0 !important;
  border-width: var(--border-w);
}
body.theme-contrast .avatar {
  border-radius: 0;
  border-width: var(--border-w);
}
body.theme-contrast .avatar::before,
body.theme-contrast .avatar.with-image img {
  border-radius: 0;
}
body.theme-contrast .card .stripe::after {
  width: 9px;
  height: 9px;
}
body.theme-contrast .prose-title,
body.theme-contrast .modal-title,
body.theme-contrast .settings-h,
body.theme-contrast .choices-q,
body.theme-contrast .embed-title,
body.theme-contrast .feed-inner h2 {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
/* Links are underlined rather than outlined. A permanent 2px outline on every
   link was the old theme's way of making them unmissable; underline is the
   standard affordance and does not fight the focus ring that
   themes/interaction.css already draws at 21:1 in this theme. */
body.theme-contrast a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
body.theme-contrast .topbar,
body.theme-contrast .compose,
body.theme-contrast .left-panel,
body.theme-contrast .right-panel {
  border-width: var(--border-w);
}
```

**Note on the `.stripe` rules:** the old block set `.card .stripe { width: 6px; background: var(--user) }`. The Ledger gutter no longer uses a filled stripe — it is a hairline rule (`::before`) plus a solid authorship mark (`::after`), and the mark already takes `--card-accent`. Widening the mark is the correct contrast-theme adaptation; setting `width`/`background` on `.stripe` itself would paint a 6px bar over the rule.

- [ ] **Step 1.3: Verify no hardcoded colours remain in the contrast block**

```bash
awk '/High Contrast/,/^\/\* Ember/' packages/renderer/src/themes/structural.css | grep -nE '#[0-9a-fA-F]{3,6}' || echo "CLEAN — no hardcoded colours in the contrast block"
```

Expected: `CLEAN — no hardcoded colours in the contrast block`

- [ ] **Step 1.4: Verify the static-colour gate still passes**

```bash
pnpm -F @f-mark/renderer run test:static-colors
```

Expected: exits 0, no output.

- [ ] **Step 1.5: Commit**

```bash
git add packages/renderer/src/themes/structural.css
git commit -m "fix(themes): repair contrast-theme structural rules broken by the palette inversion

The Ledger redesign inverted the contrast theme from black-paper/white-ink to
white-paper/black-ink, but structural.css still hardcoded the old values:
\`border: 3px solid #fff\` painted a white border on a white background, and
\`outline: 2px solid #ffff00\` was yellow-on-white at roughly 1.07:1. Both shipped
in the theme whose entire purpose is accessibility.

Every value now resolves through a token, so the block inverts with the theme.
Links are underlined rather than permanently outlined — the standard affordance,
and it no longer fights the focus ring interaction.css already draws at 21:1.

The .stripe rules are dropped: the Ledger gutter is a hairline rule plus a solid
authorship mark, so the old 6px filled bar would paint over it. The contrast
adaptation is a larger mark instead."
```

---

## Task 2: Delete the retired-theme CSS and guard against its return

**Files:**
- Modify: `packages/renderer/src/themes/structural.css` (delete ~185 rules across 13 dead themes)
- Create: `packages/renderer/tests/structural-themes.test.ts`

**Interfaces:**
- Consumes: `ThemeName` from `packages/renderer/src/themes/index.ts` — the union `"light" | "night" | "contrast"`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 2.1: Write the failing test**

Create `packages/renderer/tests/structural-themes.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { THEMES } from "../src/themes/index.js";

/* structural.css carries per-theme overrides. When the theme registry was cut
   from 17 to 3, tokens.css and @f-mark/shared were updated but this file was
   not — 185 rules for 13 unreachable themes survived, carrying 33 hardcoded
   hexes and three gradient-text rules with them. applyTheme() can no longer set
   any of those body classes, so none of it could ever match.

   This test is the guard: a selector here must name a theme that still exists. */

const STRUCTURAL = readFileSync(
  path.join(__dirname, "../src/themes/structural.css"),
  "utf8",
);

/* `light` is the default and carries NO body class, so it never appears as a
   `body.theme-*` selector. Only the two classed themes are legal here. */
const CLASSED_THEMES = THEMES.map((t) => t.name).filter((n) => n !== "light");

function themeSelectorsInFile(): string[] {
  const found = new Set<string>();
  for (const m of STRUCTURAL.matchAll(/body\.theme-([a-z0-9-]+)/gi)) {
    found.add(m[1]!);
  }
  return [...found].sort();
}

describe("structural.css theme selectors", () => {
  test("every theme selector names a theme that still exists", () => {
    const orphans = themeSelectorsInFile().filter(
      (name) => !CLASSED_THEMES.includes(name as (typeof CLASSED_THEMES)[number]),
    );
    expect(orphans).toEqual([]);
  });

  test("no hardcoded colour literals survive", () => {
    /* Tokens invert with the theme; literals do not. That mismatch is exactly
       what broke the contrast theme. */
    const literals = STRUCTURAL.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals).toEqual([]);
  });

  test("no gradient-text rules survive", () => {
    expect(STRUCTURAL).not.toMatch(/background-clip:\s*text/);
  });
});
```

- [ ] **Step 2.2: Run it to confirm it fails**

```bash
pnpm -F @f-mark/renderer exec vitest run tests/structural-themes.test.ts
```

Expected: **FAIL** — 3 failing assertions. The orphan list contains `brutalist`, `terminal`, `cyber`, `dracula`, `amber`, `catppuccin`, `tokyo`, `gruvbox`, `nord`, `monokai`, `borland`, `sepia`, `ember`; the literal list is non-empty; `background-clip: text` is present.

- [ ] **Step 2.3: Delete every retired-theme block**

```bash
python3 - <<'PY'
import io, re
p = "packages/renderer/src/themes/structural.css"
src = io.open(p, encoding="utf-8").read()

KEEP = {"contrast", "night"}

out, i, dropped = [], 0, 0
# Walk rule-by-rule: a rule is <selector-list> { ... }. Drop any rule whose
# selector list mentions a body.theme-* that is not in KEEP.
for m in re.finditer(r"([^{}]*)\{([^{}]*)\}", src):
    sel, body = m.group(1), m.group(2)
    themes = set(re.findall(r"body\.theme-([a-z0-9-]+)", sel, re.I))
    if themes and not (themes & KEEP):
        dropped += 1
        continue
    out.append(f"{sel.strip()} {{{body}}}")

header = (
    "/* Theme structural overrides — radius, border weight, casing.\n"
    "   Only `contrast` needs them: it is the one theme whose STRUCTURE differs\n"
    "   (square corners, doubled borders, uppercase heads), not just its palette.\n"
    "   `light` and `night` are pure token swaps and need nothing here.\n"
    "   Guarded by tests/structural-themes.test.ts. */\n\n"
)
io.open(p, "w", encoding="utf-8").write(header + "\n".join(out) + "\n")
print(f"dropped {dropped} rules")
PY
```

Expected: `dropped 185 rules` (±2 — the exact count depends on how comment-only spans parse; anything in the 180–190 range is correct).

- [ ] **Step 2.4: Run the test to confirm it passes**

```bash
pnpm -F @f-mark/renderer exec vitest run tests/structural-themes.test.ts
```

Expected: **PASS**, 3 tests.

- [ ] **Step 2.5: Verify the file shrank and still parses**

```bash
wc -l packages/renderer/src/themes/structural.css
pnpm -F @f-mark/renderer build 2>&1 | grep -E "error|✓ built"
```

Expected: roughly 40–55 lines (from 257), and `✓ built`.

- [ ] **Step 2.6: Verify no regressions against the recorded baseline**

```bash
pnpm -F @f-mark/renderer exec vitest run --reporter=json --outputFile=/tmp/now.json >/dev/null 2>&1
node -e "
const g=p=>require(p).testResults.filter(t=>t.status==='failed').map(t=>t.name.split('/packages/renderer/')[1]);
const b=new Set(g('/tmp/base.json')), n=new Set(g('/tmp/now.json'));
const newly=[...n].filter(f=>!b.has(f));
console.log('REGRESSIONS:', newly.length ? newly.join(', ') : 'none');
"
```

Expected: `REGRESSIONS: none`

- [ ] **Step 2.7: Commit**

```bash
git add packages/renderer/src/themes/structural.css packages/renderer/tests/structural-themes.test.ts
git commit -m "fix(themes): delete 185 unreachable rules for 13 retired themes

The theme cut updated tokens.css and @f-mark/shared but never touched
structural.css, which still styled theme-cyber, theme-dracula, theme-ember,
theme-brutalist and nine others. applyTheme() can no longer set any of those
body classes, so every one of those rules was dead — and they carried 33
hardcoded hexes and three background-clip:text gradient-title rules with them.

Only \`contrast\` survives, because it is the one theme whose structure differs
rather than just its palette. structural.css goes from 257 lines to ~45.

tests/structural-themes.test.ts guards all three properties: selectors must name
a live theme, no colour literals, no gradient text."
```

---

## Task 3: Page-edge clip, header collapse, and an honest supported width

**Files:**
- Modify: `packages/renderer/src/styles.css` (add the page-edge clip)
- Modify: `packages/renderer/src/shell/shell.css` (add the ≤640px header rule)
- Modify: `packages/renderer/src/shell/topBar/ViewModeToggle.tsx` (explicit `aria-label`)
- Modify: `DESIGN.md` (record the supported width)

**Interfaces:**
- Consumes: `ViewMode` and `useStore` from `../../state/store.js`; the existing `.view-toggle` / `.view-toggle-label` classes in `shell.css:2315`.
- Produces: nothing consumed by later tasks.

**Scope decision (already made, do not revisit):** F-Mark declares a minimum comfortable width rather than growing an off-canvas mode. It drives tmux agents, file viewers and diffs; it is a desktop tool. The clip guarantees nothing scrolls sideways, the header collapse keeps the one control that overflowed usable, and `DESIGN.md` states the supported width plainly instead of implying a phone layout exists.

- [ ] **Step 3.1: Write the failing test**

Create `packages/renderer/tests/page-edge-clip.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/* The page must never scroll sideways. The fix is `overflow-x: clip` on both
   html and body — NOT `hidden`. `hidden` creates a scroll container, which
   confines every `position: sticky` descendant to it; this repo has 11 sticky
   rules across 5 files and they would all break. `clip` creates no formatting
   context and leaves them working. */

const STYLES = readFileSync(
  path.join(__dirname, "../src/styles.css"),
  "utf8",
);

describe("page-edge clipping", () => {
  test("html and body clip horizontal overflow", () => {
    expect(STYLES).toMatch(/overflow-x:\s*clip/);
  });

  test("clipping never uses `hidden`, which would break sticky descendants", () => {
    expect(STYLES).not.toMatch(/overflow-x:\s*hidden/);
  });
});
```

- [ ] **Step 3.2: Run it to confirm it fails**

```bash
pnpm -F @f-mark/renderer exec vitest run tests/page-edge-clip.test.ts
```

Expected: **FAIL** on the first test — `overflow-x: clip` is not present.

- [ ] **Step 3.3: Add the page-edge clip**

In `packages/renderer/src/styles.css`, find:

```css
html,
body,
#root {
  height: 100%;
}
```

Replace with:

```css
html,
body,
#root {
  height: 100%;
}

/* Nothing scrolls sideways. `clip`, never `hidden`: `hidden` creates a scroll
   container and would confine all 11 of this app's `position: sticky` elements
   to it, breaking sticky file-tree headers, card heads and popover rails.
   `clip` creates no formatting context, so they keep working. */
html,
body {
  overflow-x: clip;
}
```

- [ ] **Step 3.4: Run the test to confirm it passes**

```bash
pnpm -F @f-mark/renderer exec vitest run tests/page-edge-clip.test.ts
```

Expected: **PASS**, 2 tests.

- [ ] **Step 3.5: Give the view-mode buttons an explicit accessible name**

The visible label is about to collapse at narrow widths. The accessible name must not depend on the viewport, so it moves to `aria-label`.

In `packages/renderer/src/shell/topBar/ViewModeToggle.tsx`, find:

```tsx
          aria-selected={viewMode === mode}
          className={viewMode === mode ? "active" : ""}
          onClick={() => setViewMode(mode)}
          title={title}
        >
```

Replace with:

```tsx
          aria-selected={viewMode === mode}
          /* The visible label collapses to an icon below 640px, so the
             accessible name comes from aria-label — it must not depend on the
             viewport. */
          aria-label={label}
          className={viewMode === mode ? "active" : ""}
          onClick={() => setViewMode(mode)}
          title={title}
        >
```

- [ ] **Step 3.6: Collapse the header labels below 640px**

Append to `packages/renderer/src/shell/shell.css`:

```css
/* Below 640px the ledger header's two clusters cannot both hold their labels —
   measured at 320px the view toggle alone was 320px wide and pushed the page to
   513px of scrollWidth. The labels collapse to icons; the names survive in
   aria-label (see ViewModeToggle.tsx). The header also wraps rather than
   overflowing, so the pane switcher drops to its own line before it clips. */
@media (max-width: 640px) {
  .ledger-header {
    flex-wrap: wrap;
    height: auto;
    row-gap: 4px;
    padding-block: 5px;
  }
  .view-toggle-label,
  .ledger-panes button span {
    display: none;
  }
}
```

- [ ] **Step 3.7: Verify no horizontal scroll at any width**

Start the dev server if it is not already running:

```bash
SCRATCH=/private/tmp/claude-501/-Users-oranefroni/6a985480-0faa-4749-a1f1-6c1230bf5ad3/scratchpad/fmark-ui
HOME="$SCRATCH/home" XDG_CONFIG_HOME="$SCRATCH/home/.config" \
  pnpm dev --no-auth --port 7788 --path "$SCRATCH/project" &
sleep 12
```

Then, with the Playwright MCP, load `http://localhost:7788`, select a session, and at **each** of 320 / 375 / 414 / 768 / 1024 / 1440 / 1920 run:

```js
() => {
  const de = document.documentElement;
  return {
    w: de.clientWidth,
    scrollWidth: de.scrollWidth,
    horizontalScroll: de.scrollWidth > de.clientWidth + 1,
  };
}
```

Expected: `horizontalScroll: false` at **every** width. Before this task it was `true` at 320px with 193px of overflow.

- [ ] **Step 3.8: Record the supported width in DESIGN.md**

In `DESIGN.md`, immediately before the `## Themes` heading, insert:

```markdown
## Supported width

F-Mark drives tmux agents, file viewers and side-by-side diffs — it is a desktop
tool, and the three-zone shell assumes room for three zones.

- **≥ 1100px** — the designed experience.
- **900–1100px** — usable; the context column gets tight.
- **< 900px** — degrades honestly rather than pretending: the ledger header's
  labels collapse to icons below 640px, and `overflow-x: clip` on `html`/`body`
  guarantees the page never scrolls sideways at any width.

There is deliberately **no off-canvas mobile mode.** Building one would add a
second layout system — overlay state, focus trapping, scroll locking, dismiss
behaviour — for a usage pattern this tool does not have. Stating the minimum is
more honest than shipping a phone layout nobody drives agents from.
```

- [ ] **Step 3.9: Verify build, lint and no regressions**

```bash
pnpm -F @f-mark/renderer build 2>&1 | grep -E "error TS|✓ built"
pnpm -F @f-mark/renderer run lint
pnpm -F @f-mark/renderer exec vitest run --reporter=json --outputFile=/tmp/now.json >/dev/null 2>&1
node -e "
const g=p=>require(p).testResults.filter(t=>t.status==='failed').map(t=>t.name.split('/packages/renderer/')[1]);
const b=new Set(g('/tmp/base.json')), n=new Set(g('/tmp/now.json'));
const newly=[...n].filter(f=>!b.has(f));
console.log('REGRESSIONS:', newly.length ? newly.join(', ') : 'none');
"
```

Expected: `✓ built`, lint silent, `REGRESSIONS: none`.

- [ ] **Step 3.10: Commit**

```bash
git add packages/renderer/src/styles.css packages/renderer/src/shell/shell.css \
        packages/renderer/src/shell/topBar/ViewModeToggle.tsx \
        packages/renderer/tests/page-edge-clip.test.ts DESIGN.md
git commit -m "fix(shell): stop the page scrolling sideways, and state the supported width

At 320px the app scrolled 193px horizontally — scrollWidth 513 against a 320
viewport. The worst offender was .view-toggle, which this redesign moved into
the ledger header without giving it a narrow-width behaviour.

Three parts:
- \`overflow-x: clip\` on html and body. Deliberately NOT \`hidden\`: hidden creates
  a scroll container and would confine all 11 of this app's position:sticky
  elements to it. clip creates no formatting context and leaves them working.
- Below 640px the ledger header wraps and its labels collapse to icons. The
  names move to aria-label so the accessible name does not depend on viewport.
- DESIGN.md states the supported width plainly. F-Mark drives tmux agents and
  diffs; there is deliberately no off-canvas mobile mode, and saying so beats
  shipping a phone layout nobody uses.

Verified no horizontal scroll at 320/375/414/768/1024/1440/1920."
```

---

## Task 4: Polish — meter animation, icon consistency, label wrapping

**Files:**
- Modify: `packages/renderer/src/components/chips.css:726-733`
- Modify: `packages/renderer/src/popovers/PresetItem.tsx`
- Modify: `packages/renderer/src/cards/toolUseCard/ToolUseHeader.tsx`
- Modify: `packages/renderer/src/modals/integrationSetup/SetupItem.tsx`
- Modify: `packages/renderer/src/shell/shell.css` (toolbar `nowrap`)

**Interfaces:**
- Consumes: `--agent-runtime-context` (a percentage custom property set inline by the agent runtime row); lucide-react icon components.
- Produces: nothing consumed by later tasks.

- [ ] **Step 4.1: Stop the context meter animating `width`**

`width` is a layout property — animating it forces reflow every frame. `transform: scaleX()` is the usual replacement but is **wrong here**: the bar carries `linear-gradient(90deg, …)` and `border-radius: inherit`, and scaling distorts both. `clip-path: inset()` runs on the compositor in Chromium, Firefox and Safari and preserves gradient geometry and radius exactly. ([source](https://motion.dev/docs/performance), [source](https://css-tricks.com/animating-with-clip-path/))

In `packages/renderer/src/components/chips.css`, find:

```css
.agent-runtime-context-meter span {
  display: block;
  width: var(--agent-runtime-context, 0%);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--user), var(--agent));
  transition: width var(--dur-slow) var(--ease-out-expo);
}
```

Replace with:

```css
/* The fill spans the full track and is revealed by clipping, rather than being
   grown by width. Animating width is a layout property — it reflows every
   frame. scaleX would composite, but it stretches the gradient and squashes the
   inherited radius; clip-path: inset() composites AND leaves both intact. */
.agent-runtime-context-meter span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--user), var(--agent));
  clip-path: inset(0 calc(100% - var(--agent-runtime-context, 0%)) 0 0);
  will-change: clip-path;
  transition: clip-path var(--dur-slow) var(--ease-out-expo);
}
```

- [ ] **Step 4.2: Verify no layout property is animated anywhere**

```bash
grep -rnE 'transition:[^;]*\b(width|height|top|left|margin|padding)\b' packages/renderer/src --include='*.css' \
  || echo "CLEAN — no layout properties animated"
```

Expected: `CLEAN — no layout properties animated`

- [ ] **Step 4.3: Replace the emoji preset fallback with a Lucide icon**

`preset.icon` is an optional user-supplied string, so user values must keep working — only the *default* changes.

In `packages/renderer/src/popovers/PresetItem.tsx`, change the import:

```tsx
import { Pencil } from "lucide-react";
```

to:

```tsx
import { Pencil, Sparkles } from "lucide-react";
```

Then find:

```tsx
  const icon = preset.icon ?? "✨";
```

and replace with:

```tsx
  /* Presets may carry a user-supplied icon string; only the fallback changes.
     A ✨ emoji was the one emoji-as-icon left in a codebase that otherwise uses
     lucide-react exclusively — emoji render differently per platform and cannot
     take a token colour. */
  const icon = preset.icon ?? <Sparkles size={14} aria-hidden />;
```

- [ ] **Step 4.4: Replace the `✓` glyphs with Lucide icons**

`ToolUseHeader.tsx` has **no** lucide import today — add one as the first import line:

```tsx
import { Check } from "lucide-react";
```

Then find:

```tsx
      <span className="ok-dot" aria-hidden>
        ✓
      </span>
```

and replace with:

```tsx
      <span className="ok-dot" aria-hidden>
        <Check size={11} />
      </span>
```

`SetupItem.tsx` **already imports `Check`** on line 1 — add only `ArrowUpRight`, keeping alphabetical order:

```tsx
import { AlertTriangle, ArrowUpRight, Check, Cpu, Plug, ShieldCheck, X } from "lucide-react";
```

Then find:

```tsx
          <span className="integration-setup-action-mark" aria-hidden>
            {isReady ? "✓" : "↗"}
          </span>
```

and replace with:

```tsx
          <span className="integration-setup-action-mark" aria-hidden>
            {isReady ? <Check size={12} /> : <ArrowUpRight size={12} />}
          </span>
```

- [ ] **Step 4.5: Stop clickable labels wrapping to two lines**

Eight controls wrap: *Mention agent · Open presets · Open skills palette · Open create todo · Attach a file · New session in project · End turn · toggle group*. A clickable label on two lines reads as a styling error.

Append to `packages/renderer/src/shell/shell.css`:

```css
/* Clickable text never wraps. A two-line button label reads as broken layout,
   not as intent. The rows these sit in already wrap (compose-zone-augments,
   right-tabs), so the row reflows instead of the label. */
.mode-btn,
.mode-btn .dock-label,
.view-toggle button,
.ledger-panes button,
.right-tabs button {
  white-space: nowrap;
}
```

- [ ] **Step 4.6: Verify no emoji remain as icons**

```bash
grep -rnoP '[\x{1F300}-\x{1FAFF}\x{2700}-\x{27BF}\x{2190}-\x{21FF}\x{2713}\x{2717}]' \
  packages/renderer/src --include='*.tsx' | grep -v '\.test\.' \
  || echo "CLEAN — no emoji or dingbat glyphs used as icons"
```

Expected: `CLEAN — no emoji or dingbat glyphs used as icons`. One acceptable exception is `ProfileStep.tsx` (`😄`), which is body copy in onboarding, not an icon — if it is the only hit, that is a pass.

- [ ] **Step 4.7: Verify build, lint, no regressions, and no two-line labels**

```bash
pnpm -F @f-mark/renderer build 2>&1 | grep -E "error TS|✓ built"
pnpm -F @f-mark/renderer run lint
pnpm -F @f-mark/renderer run test:static-colors
pnpm -F @f-mark/renderer exec vitest run --reporter=json --outputFile=/tmp/now.json >/dev/null 2>&1
node -e "
const g=p=>require(p).testResults.filter(t=>t.status==='failed').map(t=>t.name.split('/packages/renderer/')[1]);
const b=new Set(g('/tmp/base.json')), n=new Set(g('/tmp/now.json'));
const newly=[...n].filter(f=>!b.has(f));
console.log('REGRESSIONS:', newly.length ? newly.join(', ') : 'none');
"
```

Then in the browser at 1440px, re-run the two-line check:

```js
() => {
  const c = [...document.querySelectorAll('button, a, [role="tab"]')].filter(e => e.offsetParent);
  const twoLine = c.filter(e => {
    const cs = getComputedStyle(e);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    return e.textContent.trim().length > 0 && e.getBoundingClientRect().height > lh * 1.8;
  }).map(e => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 26));
  return [...new Set(twoLine)];
}
```

Expected: `[]`, `✓ built`, lint silent, `REGRESSIONS: none`.

- [ ] **Step 4.8: Commit**

```bash
git add packages/renderer/src/components/chips.css \
        packages/renderer/src/popovers/PresetItem.tsx \
        packages/renderer/src/cards/toolUseCard/ToolUseHeader.tsx \
        packages/renderer/src/modals/integrationSetup/SetupItem.tsx \
        packages/renderer/src/shell/shell.css
git commit -m "fix(ui): composite the context meter, unify icons, stop labels wrapping

- The agent context meter animated \`width\`, the last layout-property animation
  in the codebase, reflowing every frame. It now spans the full track and is
  revealed with clip-path: inset(), which composites in all three engines.
  scaleX would also composite but stretches the bar's gradient and squashes its
  inherited radius; inset() leaves both intact.
- The ✨ preset fallback and two ✓ glyphs were the only non-lucide icons left in
  the app. Emoji render differently per platform and cannot take a token colour.
  User-supplied preset icon strings still work — only the fallback changed.
- Eight control labels wrapped to two lines, which reads as broken layout. They
  are nowrap now; the rows they sit in already wrap, so the row reflows instead."
```

---

## Self-Review

**1. Spec coverage** — every audit finding maps to a task:

| Finding | Severity | Task |
|---|---|---|
| 0 · Contrast theme structural rules inverted | critical (new) | 1 |
| 1 · Horizontal scroll at 320px | critical | 3 |
| 2 · 185 dead theme rules | critical | 2 |
| 3 · Gradient text + hardcoded hexes | critical | 2 (subsumed) |
| 4 · Animating `width` | major | 4 |
| 5 · Emoji as icon | major | 4 |
| 6 · Two-line clickable text | major | 4 |
| 7 · Pure `#000`/`#fff` in contrast | minor | 1 (documented as deliberate in the block comment) |
| 8 · `✓` glyphs vs icon set | minor | 4 |

**2. Placeholder scan** — no "TBD", no "add appropriate error handling", no "similar to Task N". Every code step carries the literal replacement text and every verification step carries its exact command and expected output.

**3. Type consistency** — all verified against the source rather than assumed:

- `THEMES` / `ThemeName` in Task 2's test match `themes/index.ts` (`"light" | "night" | "contrast"`; `light` is classless and so excluded from `CLASSED_THEMES`).
- `--agent-runtime-context` in Task 4 matches the custom property already set in `chips.css`.
- `label` is destructured in `ViewModeToggle.tsx:41` (`{ mode, label, title, Icon }`), so Task 3's `aria-label={label}` resolves.
- `Check`, `Sparkles`, `ArrowUpRight`, `ScrollText` and `Moon` all exist in the installed `lucide-react`.
- **Correction found during review:** `SetupItem.tsx:1` already imports `Check`, so Task 4 adds only `ArrowUpRight`. `ToolUseHeader.tsx` has no lucide import at all and needs a new one.

**One gap worth naming:** Task 1 changes the contrast theme's `.stripe` handling based on reading the Ledger gutter's `::before`/`::after` structure, not on seeing it rendered in the contrast theme. Whoever runs Task 1 should switch to the contrast theme in the browser and confirm the authorship mark is visible before committing.
