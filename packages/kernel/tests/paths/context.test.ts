import { describe, it, expect } from "vitest";
import { globalPaths } from "../../src/paths/global.js";
import { activePaths } from "../../src/paths/active.js";
import { NoActivePathError, requireActive } from "../../src/paths/context.js";

describe("requireActive", () => {
  it("returns the active paths when present", () => {
    const ctx = {
      global: globalPaths("/tmp/cfg"),
      active: activePaths("/tmp/project"),
    };
    expect(requireActive(ctx).root()).toBe("/tmp/project");
  });

  it("throws NoActivePathError when active is null", () => {
    const ctx = { global: globalPaths("/tmp/cfg"), active: null };
    expect(() => requireActive(ctx)).toThrow(NoActivePathError);
    try {
      requireActive(ctx);
    } catch (err) {
      expect((err as NoActivePathError).code).toBe("NO_ACTIVE_PATH");
    }
  });
});
