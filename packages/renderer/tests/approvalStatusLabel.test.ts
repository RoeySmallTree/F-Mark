import { describe, expect, test } from "vitest";
import { formatApprovalStatus } from "../src/cards/AccessRequestCard.js";
import { formatWhen } from "../src/cards/format.js";

/* formatApprovalStatus delegates its time formatting to formatWhen — the
   same relative-first convention every other feed card uses — rather than
   keeping a second, diverging formatter. These assert the delegation itself
   (via formatWhen as the oracle) plus the one behavior a bespoke HH:MM
   clock could never have: a decision from weeks ago reads differently than
   one from a minute ago. */
describe("formatApprovalStatus", () => {
  test("open requests stay bare", () => {
    expect(formatApprovalStatus("open", null, null)).toBe("open");
  });
  test("a recent approval names its scope and reads relative, like the rest of the feed", () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatApprovalStatus("approved", "once", at)).toBe(
      `allowed · once · ${formatWhen(at)}`,
    );
    expect(formatApprovalStatus("approved", "once", at)).toMatch(/minutes? ago/);
  });
  test("a denial does not claim a scope", () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatApprovalStatus("denied", "once", at)).not.toMatch(/once/);
  });
  test("missing time degrades to scope only", () => {
    expect(formatApprovalStatus("approved", "always", null)).toMatch(/always/);
  });
  test("an approval from weeks ago falls back to formatWhen's absolute date+time, not a bare clock", () => {
    const at = "2026-06-01T14:04:00Z";
    expect(formatApprovalStatus("approved", "once", at)).toBe(
      `allowed · once · ${formatWhen(at)}`,
    );
    expect(formatApprovalStatus("approved", "once", at)).toMatch(/Jun 1/);
  });
});
