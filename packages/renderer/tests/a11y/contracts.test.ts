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
  test('every aria-modal="true" file wires useFocusTrap, directly or via a documented shared shell', () => {
    const uncovered = ARIA_MODAL_FILES.filter(
      (f) => !f.tsx.includes("useFocusTrap") && !f.tsx.includes("Focus trap:"),
    ).map((f) => f.path);
    expect(uncovered).toEqual([]);
  });

  test("at least one dialog file is actually present in the scan (sanity check the walk itself)", () => {
    expect(ARIA_MODAL_FILES.length).toBeGreaterThan(0);
  });
});

/* role="tablist" and role="radiogroup" promise arrow-key roving. The 2026-08-04
   sweep filed this as five widgets; walking the source found twenty-one, so
   fixing the named five would have left the class wide open while looking
   closed. This guard is how the real number became visible at all.

   The allowlist below is the honest remainder: every entry is a real gap, not
   an exemption. Its job is to make a NEW composite widget fail this test, so
   omitting the keyboard pattern has to be a deliberate act of adding a line
   here rather than something that happens by not noticing. Shrink it; do not
   grow it. */
const ROVING_DEBT = [
  "cards/ApprovalActions.tsx",
  "modals/presetEditor/CategoryField.tsx",
  "modals/onboarding/ThemeStep.tsx",
  "modals/onboarding/providers/ScopeToggle.tsx",
];

const COMPOSITE_FILES = tsxFiles(SRC)
  .map((f) => ({ path: path.relative(SRC, f), tsx: readFileSync(f, "utf8") }))
  .filter(
    (f) =>
      f.tsx.includes('role="tablist"') || f.tsx.includes('role="radiogroup"'),
  );

describe("composite widget keyboard contract", () => {
  test("a new tablist or radiogroup must wire useRovingTabIndex or be listed as known debt", () => {
    const uncovered = COMPOSITE_FILES.filter(
      (f) =>
        !f.tsx.includes("useRovingTabIndex") && !ROVING_DEBT.includes(f.path),
    ).map((f) => f.path);
    expect(uncovered).toEqual([]);
  });

  test("the debt list has no stale entries — a fixed widget must be removed from it", () => {
    const fixed = COMPOSITE_FILES.filter(
      (f) =>
        f.tsx.includes("useRovingTabIndex") && ROVING_DEBT.includes(f.path),
    ).map((f) => f.path);
    expect(fixed).toEqual([]);
  });

  test("every debt entry still exists — a deleted file must not linger here", () => {
    const known = new Set(COMPOSITE_FILES.map((f) => f.path));
    expect(ROVING_DEBT.filter((p) => !known.has(p))).toEqual([]);
  });
});
