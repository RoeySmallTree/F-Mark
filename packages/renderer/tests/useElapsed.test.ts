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
