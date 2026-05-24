import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  writeActiveSession,
  readActiveSession,
  activeSessionPath,
} from "../../src/agents/activeSession";

/* Updated for the v0.5 helper contract: the helpers now take the parent
   of per-agent subdirs directly (was: take a fmarkDir and prepend
   "agents/"). On-disk layout is unchanged — callers compute
   `join(<fmarkDir>, "agents")` or `globalPaths.projectAgentsDir(pathId)`
   themselves. */
describe("active-session pointer", () => {
  let fmarkDir: string;
  let agentsDir: string;
  beforeEach(async () => {
    fmarkDir = await mkdtemp(join(tmpdir(), "fm-"));
    agentsDir = join(fmarkDir, "agents");
  });

  it("writes <agentsDir>/<id>/active-session containing the session id", async () => {
    await writeActiveSession(agentsDir, "ag-claude", "2026-05-23-spike");
    expect(await readActiveSession(agentsDir, "ag-claude")).toBe("2026-05-23-spike");
  });

  it("returns null when no pointer exists", async () => {
    expect(await readActiveSession(agentsDir, "ag-claude")).toBeNull();
  });

  it("activeSessionPath is deterministic", () => {
    expect(activeSessionPath(agentsDir, "ag-claude"))
      .toBe(join(agentsDir, "ag-claude", "active-session"));
  });

  it("overwrites previous pointer atomically (no partial reads)", async () => {
    await writeActiveSession(agentsDir, "ag-claude", "session-a");
    await writeActiveSession(agentsDir, "ag-claude", "session-b");
    expect(await readActiveSession(agentsDir, "ag-claude")).toBe("session-b");
  });

  it("rejects participant_id with path traversal", async () => {
    await expect(writeActiveSession(agentsDir, "../etc", "x")).rejects.toThrow();
  });
});
