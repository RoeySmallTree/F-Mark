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
