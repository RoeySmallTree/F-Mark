import { describe, expect, test } from "vitest";
import { formatFreshness, freshnessTickMs } from "../src/hooks/useElapsed.js";

/* The top bar deliberately reads CALMER than the approval wait timer
   (formatElapsed) — see useElapsed.ts. An open approval is usually why
   nothing else has happened, so when it's also the newest event, the two
   timers sit a few inches apart; without a coarser top-bar granularity they
   tick in lockstep and read as duplicate information. */
describe("top-bar freshness formatter", () => {
  test("collapses under the noise floor to just now", () => {
    expect(formatFreshness(4_000)).toBe("just now");
  });
  test("shows exact seconds once past the noise floor", () => {
    expect(formatFreshness(42_000)).toBe("42s");
  });
  test("drops seconds once a minute has passed", () => {
    expect(formatFreshness(3 * 60_000 + 41_000)).toBe("3m");
  });
  test("shows hours once past 60 minutes", () => {
    expect(formatFreshness(90 * 60_000)).toBe("1h");
  });
  test("clamps a clock skew into the past to just now", () => {
    expect(formatFreshness(-1_000)).toBe("just now");
  });
});

describe("top-bar freshness tick cadence", () => {
  test("ticks every second while seconds are still shown", () => {
    expect(freshnessTickMs(42_000)).toBe(1_000);
  });
  test("slows to once a minute once seconds stop being shown", () => {
    expect(freshnessTickMs(90_000)).toBe(60_000);
  });
});
