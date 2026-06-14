import { describe, it, expect } from "vitest";
import { getAdapter } from "../../../src/runtimes/adapters/index.js";

describe("getAdapter", () => {
  it("returns the codex adapter for runtimeId='codex'", () => {
    const a = getAdapter("codex");
    expect(a).not.toBeNull();
    expect(a?.runtimeId).toBe("codex");
  });

  it("returns the claude adapter for runtimeId='claude'", () => {
    const a = getAdapter("claude");
    expect(a?.runtimeId).toBe("claude");
  });

  it("returns the opencode adapter for runtimeId='opencode'", () => {
    const a = getAdapter("opencode");
    expect(a?.runtimeId).toBe("opencode");
  });

  it("returns null for an unknown runtime", () => {
    expect(getAdapter("custom-runtime")).toBeNull();
  });

  it("returns null for null", () => {
    expect(getAdapter(null)).toBeNull();
  });

  it("returns the same instance on repeated calls (cached)", () => {
    const a1 = getAdapter("codex");
    const a2 = getAdapter("codex");
    expect(a1).toBe(a2);
  });
});
