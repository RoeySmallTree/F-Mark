import { describe, expect, it } from "vitest";
import { resolveBootActivePath } from "../../src/boot/activePath.js";

describe("resolveBootActivePath", () => {
  it("uses the explicit --path override when provided", () => {
    expect(
      resolveBootActivePath({
        explicitPath: "/explicit",
        launchPath: "/cwd",
        state: { activePath: "/persisted" },
      }),
    ).toBe("/explicit");
  });

  it("reuses the persisted active path on a normal launch", () => {
    expect(
      resolveBootActivePath({
        launchPath: "/cwd",
        state: { activePath: "/persisted" },
      }),
    ).toBe("/persisted");
  });

  it("falls back to the launch path when no active path is stored", () => {
    expect(
      resolveBootActivePath({
        launchPath: "/cwd",
        state: { activePath: null },
      }),
    ).toBe("/cwd");
  });
});
