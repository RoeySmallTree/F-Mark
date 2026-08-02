import { describe, expect, test } from "vitest";
import { formatApprovalStatus } from "../src/cards/AccessRequestCard.js";

/* Derives the expected HH:MM the same way the browser will — via the Date
   object's own local-time accessors — rather than pinning a timezone. The
   implementation renders in local time (matching every other feed card's
   timestamp), so a hardcoded "14:04" would only pass on a UTC machine. */
function localHHMM(iso: string): string {
  const parsed = new Date(iso);
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

describe("formatApprovalStatus", () => {
  test("open requests stay bare", () => {
    expect(formatApprovalStatus("open", null, null)).toBe("open");
  });
  test("an approval names its scope and time", () => {
    const at = "2026-08-02T14:04:00Z";
    expect(formatApprovalStatus("approved", "once", at)).toMatch(/once/);
    expect(formatApprovalStatus("approved", "once", at)).toMatch(new RegExp(localHHMM(at)));
  });
  test("a denial does not claim a scope", () => {
    expect(formatApprovalStatus("denied", "once", "2026-08-02T14:04:00Z")).not.toMatch(/once/);
  });
  test("missing time degrades to scope only", () => {
    expect(formatApprovalStatus("approved", "always", null)).toMatch(/always/);
  });
});
