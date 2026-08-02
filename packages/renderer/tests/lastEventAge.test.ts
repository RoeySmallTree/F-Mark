import { describe, expect, test } from "vitest";
import { formatElapsed } from "../src/hooks/useElapsed.js";

/* The top bar reuses the same formatter as the approval wait timer, so the two
   never disagree about what "3m 41s" means. */
describe("top-bar freshness reuses formatElapsed", () => {
  test("sub-minute reads in seconds", () => {
    expect(formatElapsed(42_000)).toBe("42s");
  });
  test("clamps a clock skew into the past to zero", () => {
    expect(formatElapsed(-1_000)).toBe("0s");
  });
});
