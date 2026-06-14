import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { paths } from "../../src/paths.js";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import { writeTmuxSession, writeRuntime } from "../../src/agents/managed.js";
import { createAgentStateStore } from "../../src/services/agentState.js";

async function withScratch<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "fmark-agent-state-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("AgentStateStore", () => {
  it("reads global active-session before legacy and mirrors active writes", async () => {
    await withScratch(async (root) => {
      const fallbackRoot = join(root, "fallback");
      const activeRoot = join(root, "active");
      const configRoot = join(root, "config");
      await mkdir(fallbackRoot, { recursive: true });
      await mkdir(activeRoot, { recursive: true });

      const active = activePaths(activeRoot);
      const g = globalPaths(configRoot);
      const ref = new PathContextRef({ global: g, active });
      const store = createAgentStateStore({
        fallback: paths(fallbackRoot),
        ref,
      });

      await writeActiveSession(
        join(active.fmarkDir(), "agents"),
        "ag-bridge",
        "legacy-session",
      );
      await writeActiveSession(
        g.projectAgentsDir(active.pathId()),
        "ag-bridge",
        "global-session",
      );

      expect(await store.readActiveSession("ag-bridge")).toBe("global-session");

      await store.writeActiveSession("ag-bridge", "next-session");
      expect(
        await readFile(
          join(g.projectAgentsDir(active.pathId()), "ag-bridge", "active-session"),
          "utf8",
        ),
      ).toBe("next-session");
      expect(
        await readFile(
          join(active.fmarkDir(), "agents", "ag-bridge", "active-session"),
          "utf8",
        ),
      ).toBe("next-session");
    });
  });

  it("writes managed siblings only to primary but clears both locations", async () => {
    await withScratch(async (root) => {
      const fallbackRoot = join(root, "fallback");
      const activeRoot = join(root, "active");
      const configRoot = join(root, "config");
      await mkdir(fallbackRoot, { recursive: true });
      await mkdir(activeRoot, { recursive: true });

      const active = activePaths(activeRoot);
      const g = globalPaths(configRoot);
      const ref = new PathContextRef({ global: g, active });
      const store = createAgentStateStore({
        fallback: paths(fallbackRoot),
        ref,
      });
      const primaryDir = g.projectAgentsDir(active.pathId());
      const legacyDir = join(active.fmarkDir(), "agents");

      await writeTmuxSession(legacyDir, "ag-managed", "legacy-tmux");
      await writeRuntime(legacyDir, "ag-managed", "legacy-runtime");
      await store.writeTmuxSession("ag-managed", "global-tmux");
      await store.writeRuntime("ag-managed", "global-runtime");

      expect(await store.readTmuxSession("ag-managed")).toBe("global-tmux");
      expect(await store.readRuntime("ag-managed")).toBe("global-runtime");
      expect(await store.listManagedAgentIds()).toEqual(["ag-managed"]);
      expect(
        await readFile(join(primaryDir, "ag-managed", "tmux-session"), "utf8"),
      ).toBe("global-tmux");

      await store.clearManagedSiblings("ag-managed");
      await expect(
        readFile(join(primaryDir, "ag-managed", "tmux-session"), "utf8"),
      ).rejects.toThrow();
      await expect(
        readFile(join(legacyDir, "ag-managed", "tmux-session"), "utf8"),
      ).rejects.toThrow();
    });
  });
});
