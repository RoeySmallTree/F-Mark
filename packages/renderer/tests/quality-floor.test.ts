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

/* A regex cannot extract an @media block. The block contains nested rules,
   so any non-greedy pattern terminates at the first inner `}` and everything
   after the first rule goes unread — shell.css has a live two-rule
   reduced-motion block whose second rule was never scanned. Match braces. */
function mediaBlocks(css: string, needle: string): string[] {
  const out: string[] = [];
  const open = /@media[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(css)) !== null) {
    if (!m[0].includes(needle)) continue;
    let depth = 1;
    let i = open.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    out.push(css.slice(open.lastIndex, i - 1));
  }
  return out;
}

/* Every duration in a declaration, normalised to milliseconds. */
function durationsMs(decl: string): number[] {
  return [...decl.matchAll(/(\d*\.?\d+)\s*(ms|s)\b/g)].map(([, n, unit]) =>
    unit === "s" ? Number(n) * 1000 : Number(n),
  );
}

const TIMED_DECL = /(?:animation|transition)(?:-duration|-delay)?:\s*[^;}]+/g;

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

  /* A focus ring that fades in cannot be followed while tabbing.
     Widened from :focus-visible to every focus pseudo-class — :focus and
     :focus-within draw the same ring and were unscanned. */
  test("focus rings are never transitioned", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const blocks = f.css.match(/[^{}]*:focus(?:-visible|-within)?[^{]*\{[^}]*\}/g) ?? [];
      for (const b of blocks) {
        if (/transition:(?!\s*none)/.test(b)) offenders.push(`${f.path}: ${b.trim().slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /* prefers-reduced-motion must kill animation, not merely shorten it.
     A previous revision "reset" durations to a 120ms token, defeating it.

     Two ways past the original version of this test, both now closed:
     it read only the first rule of each media block, and it matched only
     the -duration longhands, so `transition: all var(--dur-fast)` — the
     shorthand — sailed through. Any non-trivial duration now fails,
     whether it arrives as a token or as a literal. */
  test("reduced-motion resets are near-zero, not a duration", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const block of mediaBlocks(f.css, "prefers-reduced-motion")) {
        for (const decl of block.match(TIMED_DECL) ?? []) {
          const tokenised = /var\(\s*--dur-/.test(decl);
          const slow = durationsMs(decl).some((ms) => ms > 1);
          if (tokenised || slow) {
            offenders.push(`${f.path}: ${decl.replace(/\s+/g, " ").slice(0, 70)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /* The ring is protected by interaction.css's global `transition: none
     !important` on the :focus-visible rule. Nothing tested that it exists,
     so the protection was load-bearing by accident: delete that one
     declaration and every base-rule transition starts dragging the ring,
     with no test turning red. Assert it directly.

     This is the guard the selector-scoped test above cannot provide —
     that one only ever sees rules whose own selector says :focus-visible. */
  test("the global focus-ring transition reset still exists", () => {
    const interaction = FILES.find((f) => f.path === path.join("themes", "interaction.css"));
    expect(interaction, "themes/interaction.css not found").toBeDefined();
    const ringRules = (interaction?.css ?? "").match(/:focus-visible[^{]*\{[^}]*\}/g) ?? [];
    const reset = ringRules.filter((r) => /transition:\s*none\s*!important/.test(r));
    expect(reset.length, "no global `transition: none !important` on a :focus-visible rule").toBeGreaterThan(0);
  });
});
