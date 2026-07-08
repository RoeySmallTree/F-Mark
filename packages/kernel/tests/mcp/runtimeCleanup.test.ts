import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupStaleFmarkMcpProcesses,
  registerFmarkMcpProcess,
} from "../../src/mcp/runtimeRegistry.js";

async function withTempRegistry(
  fn: (ctx: { root: string; fmarkDir: string }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "fmark-mcp-registry-"));
  const fmarkDir = join(root, ".f-mark");
  try {
    await mkdir(fmarkDir, { recursive: true });
    await fn({ root, fmarkDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function readRegistry(fmarkDir: string): Promise<Array<Record<string, unknown>>> {
  return JSON.parse(
    await readFile(join(fmarkDir, "mcp-stdio-registry.json"), "utf8"),
  ) as Array<Record<string, unknown>>;
}

describe("MCP runtime cleanup registry", () => {
  it("registers stdio MCP metadata and unregisters on close", async () => {
    await withTempRegistry(async ({ root, fmarkDir }) => {
      const registration = await registerFmarkMcpProcess({
        fmarkDir,
        projectRoot: root,
        env: {
          F_MARK_RUNTIME_ID: "claude",
          F_MARK_AGENT_ID: "ag-claude",
          F_MARK_MCP_VERSION: "old-version",
        },
        pid: 12345,
        startedAt: "2026-06-18T00:00:00.000Z",
      });

      const records = await readRegistry(fmarkDir);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        id: registration.id,
        pid: 12345,
        projectRoot: root,
        runtimeId: "claude",
        participantId: "ag-claude",
        commandSpecVersion: "old-version",
        startedAt: "2026-06-18T00:00:00.000Z",
      });

      await registration.unregister();
      expect(await readRegistry(fmarkDir)).toEqual([]);
    });
  });

  it("terminates only stale tracked pids for the affected root/runtime", async () => {
    await withTempRegistry(async ({ root, fmarkDir }) => {
      const otherRoot = join(root, "other");
      await registerFmarkMcpProcess({
        fmarkDir,
        projectRoot: root,
        env: { F_MARK_RUNTIME_ID: "claude", F_MARK_MCP_VERSION: "old-version" },
        pid: 111,
      });
      await registerFmarkMcpProcess({
        fmarkDir,
        projectRoot: root,
        env: { F_MARK_RUNTIME_ID: "claude", F_MARK_MCP_VERSION: "phase5-stdio-v1" },
        pid: 222,
      });
      await registerFmarkMcpProcess({
        fmarkDir,
        projectRoot: otherRoot,
        env: { F_MARK_RUNTIME_ID: "claude", F_MARK_MCP_VERSION: "old-version" },
        pid: 333,
      });
      await registerFmarkMcpProcess({
        fmarkDir,
        projectRoot: root,
        env: { F_MARK_RUNTIME_ID: "codex", F_MARK_MCP_VERSION: "old-version" },
        pid: 444,
      });
      await registerFmarkMcpProcess({
        fmarkDir,
        projectRoot: root,
        env: { F_MARK_RUNTIME_ID: "claude", F_MARK_MCP_VERSION: "old-version" },
        pid: 555,
      });

      const alive = new Set([111, 222, 333, 444]);
      const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
      const result = await cleanupStaleFmarkMcpProcesses({
        fmarkDir,
        projectRoot: root,
        runtimeId: "claude",
        deps: {
          isAlive: (pid) => alive.has(pid),
          signal: (pid, signal) => {
            signals.push({ pid, signal });
            if (signal === "SIGKILL") alive.delete(pid);
          },
          wait: async () => {},
        },
      });

      expect(result).toEqual({ killed_mcp_pids: [111], errors: [] });
      expect(signals).toEqual([
        { pid: 111, signal: "SIGTERM" },
        { pid: 111, signal: "SIGKILL" },
      ]);
      const remainingPids = (await readRegistry(fmarkDir))
        .map((record) => record.pid)
        .sort();
      expect(remainingPids).toEqual([222, 333, 444]);
    });
  });
});
