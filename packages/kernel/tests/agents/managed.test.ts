import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeTmuxSession,
  readTmuxSession,
  writeRuntime,
  readRuntime,
  clearManagedSiblings,
  listManagedAgentIds,
} from "../../src/agents/managed.js";

/* The helpers now take an `agentsDir` (the parent of per-agent subdirs)
   rather than a `fmarkDir`. Keep the test fixture name "fmarkDir" for
   continuity, but always pass `join(fmarkDir, "agents")` to the helpers
   so the on-disk layout (`<fmarkDir>/agents/<id>/...`) is preserved. */
async function withTmpFmark<T>(fn: (fmarkDir: string, agentsDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fmark-mgd-"));
  try {
    return await fn(dir, join(dir, "agents"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("managed sibling files", () => {
  it("round-trips tmux-session and runtime", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      await writeTmuxSession(agentsDir, "ag-claude", "fmark-x-ag-ag-claude");
      await writeRuntime(agentsDir, "ag-claude", "claude");
      expect(await readTmuxSession(agentsDir, "ag-claude")).toBe(
        "fmark-x-ag-ag-claude",
      );
      expect(await readRuntime(agentsDir, "ag-claude")).toBe("claude");
    });
  });

  it("readTmuxSession + readRuntime return null when sibling missing", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      expect(await readTmuxSession(agentsDir, "ag-claude")).toBeNull();
      expect(await readRuntime(agentsDir, "ag-claude")).toBeNull();
    });
  });

  it("clearManagedSiblings keeps active-session and log.jsonl", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      await writeTmuxSession(agentsDir, "ag-claude", "session");
      await writeRuntime(agentsDir, "ag-claude", "claude");
      const dir = join(fmarkDir, "agents", "ag-claude");
      await writeFile(join(dir, "active-session"), "sess-1");
      await writeFile(join(dir, "log.jsonl"), "{}\n");
      await clearManagedSiblings(agentsDir, "ag-claude");
      expect(await readTmuxSession(agentsDir, "ag-claude")).toBeNull();
      expect(await readRuntime(agentsDir, "ag-claude")).toBeNull();
      expect(await readFile(join(dir, "active-session"), "utf8")).toBe("sess-1");
      expect(await readFile(join(dir, "log.jsonl"), "utf8")).toBe("{}\n");
    });
  });

  it("clearManagedSiblings is a no-op when siblings are already absent", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      // No tmux-session/runtime were ever written.
      await mkdir(join(fmarkDir, "agents", "ag-claude"), { recursive: true });
      await expect(
        clearManagedSiblings(agentsDir, "ag-claude"),
      ).resolves.toBeUndefined();
    });
  });

  it("listManagedAgentIds returns only ids with tmux-session file", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      await writeTmuxSession(agentsDir, "ag-a", "s-a");
      // also create ag-b WITHOUT tmux-session
      const dir = join(fmarkDir, "agents", "ag-b");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "active-session"), "x");
      const ids = await listManagedAgentIds(agentsDir);
      expect(ids).toEqual(["ag-a"]);
    });
  });

  it("listManagedAgentIds returns [] when agents dir does not exist", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      const ids = await listManagedAgentIds(agentsDir);
      expect(ids).toEqual([]);
    });
  });

  it("rejects participant ids that don't match the safe pattern", async () => {
    await withTmpFmark(async (fmarkDir, agentsDir) => {
      await expect(writeTmuxSession(agentsDir, "../etc", "s")).rejects.toThrow(
        /invalid participant_id/,
      );
      await expect(writeRuntime(agentsDir, "Bad-Id", "claude")).rejects.toThrow(
        /invalid participant_id/,
      );
    });
  });
});
