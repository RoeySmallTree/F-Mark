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
});
