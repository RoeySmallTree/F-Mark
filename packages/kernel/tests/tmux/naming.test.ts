// packages/kernel/tests/tmux/naming.test.ts
import { describe, expect, it } from "vitest";
import {
  projectRootHash,
  fmarkAgentSessionName,
  fmarkTerminalSessionName,
  isFmarkSessionName,
  parseFmarkSessionName,
} from "../../src/tmux/naming.js";

describe("tmux naming", () => {
  const root = "/home/user/projects/acme-billing";

  it("projectRootHash returns 8 hex chars deterministically", () => {
    const a = projectRootHash(root);
    const b = projectRootHash(root);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(projectRootHash("/different")).not.toBe(a);
  });

  it("fmarkAgentSessionName composes the agent session id", () => {
    const name = fmarkAgentSessionName(root, "ag-claude-12");
    expect(name).toMatch(/^fmark-acme-billing-[0-9a-f]{8}-ag-ag-claude-12$/);
    expect(name.length).toBeLessThanOrEqual(90);
  });

  it("fmarkTerminalSessionName composes the terminal session id", () => {
    const name = fmarkTerminalSessionName(root, 3);
    expect(name).toMatch(/^fmark-acme-billing-[0-9a-f]{8}-term-3$/);
  });

  it("truncates long participant ids to 32 chars in the session name", () => {
    const longId = "ag-" + "x".repeat(64);
    const name = fmarkAgentSessionName(root, longId);
    expect(name).toContain("-ag-ag-");
    expect(name.length).toBeLessThanOrEqual(90);
  });

  it("preserves the hash/kind/id suffix when the basename is very long", () => {
    const longBasename = "/tmp/" + "a".repeat(200);
    const name = fmarkAgentSessionName(longBasename, "ag-claude-xyz");
    expect(name.length).toBeLessThanOrEqual(90);
    // hash8 must remain intact in the composed name.
    const hash = projectRootHash(longBasename);
    expect(name).toContain(`-${hash}-ag-ag-claude-xyz`);
    // Suffix must end with the truncated id, not be cut off mid-string.
    expect(name.endsWith("-ag-ag-claude-xyz")).toBe(true);
    expect(name.startsWith("fmark-")).toBe(true);
  });

  it("preserves the hash/kind/index suffix when basename is very long (terminal)", () => {
    const longBasename = "/tmp/" + "b".repeat(200);
    const name = fmarkTerminalSessionName(longBasename, 7);
    expect(name.length).toBeLessThanOrEqual(90);
    const hash = projectRootHash(longBasename);
    expect(name).toContain(`-${hash}-term-7`);
    expect(name.endsWith("-term-7")).toBe(true);
    expect(name.startsWith("fmark-")).toBe(true);
  });

  it("isFmarkSessionName recognises the convention", () => {
    expect(isFmarkSessionName("fmark-acme-12345678-ag-ag-claude")).toBe(true);
    expect(isFmarkSessionName("random-session")).toBe(false);
  });

  it("parseFmarkSessionName extracts kind + id", () => {
    const a = parseFmarkSessionName("fmark-acme-12345678-ag-ag-claude");
    expect(a).toEqual({ kind: "agent", participantId: "ag-claude" });
    const t = parseFmarkSessionName("fmark-acme-12345678-term-2");
    expect(t).toEqual({ kind: "terminal", index: 2 });
    expect(parseFmarkSessionName("nope")).toBeNull();
  });

  it("parseFmarkSessionName rejects non-numeric terminal index suffix", () => {
    expect(parseFmarkSessionName("fmark-x-12345678-term-2abc")).toBeNull();
    expect(parseFmarkSessionName("fmark-x-12345678-term-")).toBeNull();
    expect(parseFmarkSessionName("fmark-x-12345678-term-abc")).toBeNull();
    // valid numeric still works
    expect(parseFmarkSessionName("fmark-x-12345678-term-42")).toEqual({
      kind: "terminal",
      index: 42,
    });
  });
});
