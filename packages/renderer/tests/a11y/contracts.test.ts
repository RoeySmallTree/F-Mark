import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/* aria-modal="true" is a promise to assistive tech that focus is contained.
   Nine-plus modals in this repo declared the attribute with zero focus-trap
   code anywhere (see src/a11y/useFocusTrap.ts). This guard makes sure a
   future modal can't repeat that: either the file wires useFocusTrap itself,
   or it carries the marker comment that says a shared shell (ModalBackdrop)
   does it on the file's behalf. */

const SRC = path.join(__dirname, "../../src");

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

const ARIA_MODAL_FILES = tsxFiles(SRC)
  .map((f) => ({ path: path.relative(SRC, f), tsx: readFileSync(f, "utf8") }))
  .filter((f) => f.tsx.includes('aria-modal="true"'));

describe("modal focus-containment contract", () => {
  test("every aria-modal=\"true\" file wires useFocusTrap, directly or via a documented shared shell", () => {
    const uncovered = ARIA_MODAL_FILES.filter(
      (f) => !f.tsx.includes("useFocusTrap") && !f.tsx.includes("Focus trap:"),
    ).map((f) => f.path);
    expect(uncovered).toEqual([]);
  });

  test("at least one dialog file is actually present in the scan (sanity check the walk itself)", () => {
    expect(ARIA_MODAL_FILES.length).toBeGreaterThan(0);
  });
});
