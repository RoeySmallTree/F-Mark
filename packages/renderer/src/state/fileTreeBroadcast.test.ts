import { describe, it, expect } from "vitest";
import {
  messageMatchesScope,
  type FileTreeBroadcastMessage,
} from "./fileTreeBroadcast.js";

function msg(over: Partial<FileTreeBroadcastMessage>): FileTreeBroadcastMessage {
  return {
    pathId: "p1",
    sessionId: "s1",
    activeFile: "/repo/a.ts",
    origin: "other-tab",
    ...over,
  };
}

describe("messageMatchesScope (X6 standalone broadcast filter)", () => {
  it("accepts a sibling on the same (path_id, sessionId)", () => {
    expect(messageMatchesScope(msg({}), "self", "p1", "s1")).toBe(true);
  });

  it("ignores its OWN echo (matching origin)", () => {
    expect(messageMatchesScope(msg({ origin: "self" }), "self", "p1", "s1")).toBe(
      false,
    );
  });

  it("ignores a DIFFERENT session id (same root)", () => {
    expect(messageMatchesScope(msg({ sessionId: "s2" }), "self", "p1", "s1")).toBe(
      false,
    );
  });

  it("ignores a DIFFERENT path_id (same session id — cross-root collision)", () => {
    expect(messageMatchesScope(msg({ pathId: "p2" }), "self", "p1", "s1")).toBe(
      false,
    );
  });

  it("matches when BOTH sides have no path_id (null === null)", () => {
    expect(
      messageMatchesScope(msg({ pathId: null }), "self", null, "s1"),
    ).toBe(true);
  });

  it("does not match a path-id'd message against a path-id-less tab", () => {
    expect(messageMatchesScope(msg({ pathId: "p1" }), "self", null, "s1")).toBe(
      false,
    );
  });

  it("never matches when the tab has no session selected", () => {
    expect(messageMatchesScope(msg({}), "self", "p1", null)).toBe(false);
  });
});
