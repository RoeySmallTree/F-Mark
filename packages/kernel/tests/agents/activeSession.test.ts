import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  writeActiveSession,
  readActiveSession,
  activeSessionPath,
} from "../../src/agents/activeSession";

describe("active-session pointer", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "fm-")); });

  it("writes <fmark>/agents/<id>/active-session containing the session id", async () => {
    await writeActiveSession(dir, "ag-claude", "2026-05-23-spike");
    expect(await readActiveSession(dir, "ag-claude")).toBe("2026-05-23-spike");
  });

  it("returns null when no pointer exists", async () => {
    expect(await readActiveSession(dir, "ag-claude")).toBeNull();
  });

  it("activeSessionPath is deterministic", () => {
    expect(activeSessionPath(dir, "ag-claude"))
      .toBe(join(dir, "agents", "ag-claude", "active-session"));
  });

  it("overwrites previous pointer atomically (no partial reads)", async () => {
    await writeActiveSession(dir, "ag-claude", "session-a");
    await writeActiveSession(dir, "ag-claude", "session-b");
    expect(await readActiveSession(dir, "ag-claude")).toBe("session-b");
  });

  it("rejects participant_id with path traversal", async () => {
    await expect(writeActiveSession(dir, "../etc", "x")).rejects.toThrow();
  });
});
