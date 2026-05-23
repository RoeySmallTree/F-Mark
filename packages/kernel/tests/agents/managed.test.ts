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

async function withTmpFmark<T>(fn: (fmarkDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fmark-mgd-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("managed sibling files", () => {
  it("round-trips tmux-session and runtime", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await writeTmuxSession(fmarkDir, "ag-claude", "fmark-x-ag-ag-claude");
      await writeRuntime(fmarkDir, "ag-claude", "claude");
      expect(await readTmuxSession(fmarkDir, "ag-claude")).toBe(
        "fmark-x-ag-ag-claude",
      );
      expect(await readRuntime(fmarkDir, "ag-claude")).toBe("claude");
    });
  });

  it("readTmuxSession + readRuntime return null when sibling missing", async () => {
    await withTmpFmark(async (fmarkDir) => {
      expect(await readTmuxSession(fmarkDir, "ag-claude")).toBeNull();
      expect(await readRuntime(fmarkDir, "ag-claude")).toBeNull();
    });
  });

  it("clearManagedSiblings keeps active-session and log.jsonl", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await writeTmuxSession(fmarkDir, "ag-claude", "session");
      await writeRuntime(fmarkDir, "ag-claude", "claude");
      const dir = join(fmarkDir, "agents", "ag-claude");
      await writeFile(join(dir, "active-session"), "sess-1");
      await writeFile(join(dir, "log.jsonl"), "{}\n");
      await clearManagedSiblings(fmarkDir, "ag-claude");
      expect(await readTmuxSession(fmarkDir, "ag-claude")).toBeNull();
      expect(await readRuntime(fmarkDir, "ag-claude")).toBeNull();
      expect(await readFile(join(dir, "active-session"), "utf8")).toBe("sess-1");
      expect(await readFile(join(dir, "log.jsonl"), "utf8")).toBe("{}\n");
    });
  });

  it("clearManagedSiblings is a no-op when siblings are already absent", async () => {
    await withTmpFmark(async (fmarkDir) => {
      // No tmux-session/runtime were ever written.
      await mkdir(join(fmarkDir, "agents", "ag-claude"), { recursive: true });
      await expect(
        clearManagedSiblings(fmarkDir, "ag-claude"),
      ).resolves.toBeUndefined();
    });
  });

  it("listManagedAgentIds returns only ids with tmux-session file", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await writeTmuxSession(fmarkDir, "ag-a", "s-a");
      // also create ag-b WITHOUT tmux-session
      const dir = join(fmarkDir, "agents", "ag-b");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "active-session"), "x");
      const ids = await listManagedAgentIds(fmarkDir);
      expect(ids).toEqual(["ag-a"]);
    });
  });

  it("listManagedAgentIds returns [] when agents dir does not exist", async () => {
    await withTmpFmark(async (fmarkDir) => {
      const ids = await listManagedAgentIds(fmarkDir);
      expect(ids).toEqual([]);
    });
  });

  it("rejects participant ids that don't match the safe pattern", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await expect(writeTmuxSession(fmarkDir, "../etc", "s")).rejects.toThrow(
        /invalid participant_id/,
      );
      await expect(writeRuntime(fmarkDir, "Bad-Id", "claude")).rejects.toThrow(
        /invalid participant_id/,
      );
    });
  });
});
