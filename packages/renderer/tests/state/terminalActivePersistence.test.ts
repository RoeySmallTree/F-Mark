import { beforeEach, describe, expect, it } from "vitest";
import {
  clearActiveTerminal,
  loadActiveTerminal,
  saveActiveTerminal,
} from "../../src/state/terminalActivePersistence.js";

beforeEach(() => {
  window.localStorage.clear();
});

describe("terminalActivePersistence", () => {
  it("returns null when nothing is stored", () => {
    expect(loadActiveTerminal("p1")).toBeNull();
  });

  it("round-trips the active terminal per path id", () => {
    saveActiveTerminal("p1", "fmark-x-term-1");
    expect(loadActiveTerminal("p1")).toBe("fmark-x-term-1");
  });

  it("isolates selections across different path ids", () => {
    saveActiveTerminal("p1", "fmark-x-term-1");
    saveActiveTerminal("p2", "fmark-y-term-3");
    expect(loadActiveTerminal("p1")).toBe("fmark-x-term-1");
    expect(loadActiveTerminal("p2")).toBe("fmark-y-term-3");
  });

  it("uses a shared bucket for a null path id (no active project)", () => {
    saveActiveTerminal(null, "fmark-z-term-2");
    expect(loadActiveTerminal(null)).toBe("fmark-z-term-2");
    // The null bucket is distinct from a named path.
    expect(loadActiveTerminal("p1")).toBeNull();
  });

  it("clears only when the stored selection matches the killed session", () => {
    saveActiveTerminal("p1", "fmark-x-term-1");
    // A different session does not clear the stored one.
    clearActiveTerminal("p1", "fmark-x-term-9");
    expect(loadActiveTerminal("p1")).toBe("fmark-x-term-1");
    // The matching session clears it.
    clearActiveTerminal("p1", "fmark-x-term-1");
    expect(loadActiveTerminal("p1")).toBeNull();
  });
});
