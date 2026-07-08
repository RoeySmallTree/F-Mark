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

  it("round-trips lifecycle fields and merges runtime-session without dropping native ids", async () => {
    await withScratch(async (root) => {
      const p = paths(root);
      const store = createAgentStateStore({ fallback: p });

      await store.writeRuntimeSession("ag-managed", {
        desired_name: "sess-old",
        native_name_applied: true,
        native_session_id: "native-1",
        native_transcript_path: "/tmp/transcript.jsonl",
        native_id_source: "hook",
      });
      await store.mergeRuntimeSession("ag-managed", {
        desired_name: "sess-new",
      });
      expect(await store.readRuntimeSession("ag-managed")).toEqual({
        desired_name: "sess-new",
        native_name_applied: true,
        native_session_id: "native-1",
        native_transcript_path: "/tmp/transcript.jsonl",
        native_id_source: "hook",
      });

      await store.updateControlState("ag-managed", {
        last_activity_at: "2026-06-18T10:00:00.000Z",
        last_tmux_activity_at: "2026-06-18T09:59:00.000Z",
        idle_stopped_at: "2026-06-18T11:00:00.000Z",
        idle_stop_reason: "idle-timeout",
        last_tmux_session: "fmark-x-ag-ag-managed",
        pane_lifecycle: "idle-stopped",
      });
      expect(await store.readControlState("ag-managed")).toMatchObject({
        last_activity_at: "2026-06-18T10:00:00.000Z",
        last_tmux_activity_at: "2026-06-18T09:59:00.000Z",
        idle_stopped_at: "2026-06-18T11:00:00.000Z",
        idle_stop_reason: "idle-timeout",
        last_tmux_session: "fmark-x-ag-ag-managed",
        pane_lifecycle: "idle-stopped",
      });
    });
  });
});
