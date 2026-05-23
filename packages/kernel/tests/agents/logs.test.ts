import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAgentLog, readAgentLog, MAX_LOG_BYTES } from "../../src/agents/logs.js";

async function withTmp<T>(fn: (fmarkDir: string) => Promise<T>): Promise<T> {
  const d = await mkdtemp(join(tmpdir(), "fmark-log-"));
  try {
    return await fn(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}

describe("agent logs", () => {
  it("appends entries as JSON lines", async () => {
    await withTmp(async (fmarkDir) => {
      await appendAgentLog(fmarkDir, "ag-x", { event: "spawn", runtime: "claude" });
      await appendAgentLog(fmarkDir, "ag-x", { event: "kill" });
      const entries = await readAgentLog(fmarkDir, "ag-x", { limit: 10 });
      expect(entries.map((e) => e.event)).toEqual(["spawn", "kill"]);
      // ts is automatically populated
      for (const e of entries) {
        expect(typeof e.ts).toBe("string");
        expect(e.ts.length).toBeGreaterThan(0);
      }
    });
  });

  it("readAgentLog returns [] when no log file exists", async () => {
    await withTmp(async (fmarkDir) => {
      const entries = await readAgentLog(fmarkDir, "ag-x");
      expect(entries).toEqual([]);
    });
  });

  it("readAgentLog tails to the requested limit (default 50)", async () => {
    await withTmp(async (fmarkDir) => {
      for (let i = 0; i < 60; i++) {
        await appendAgentLog(fmarkDir, "ag-x", { event: `e-${i}` });
      }
      const def = await readAgentLog(fmarkDir, "ag-x");
      expect(def).toHaveLength(50);
      expect(def[0]!.event).toBe("e-10");
      expect(def[49]!.event).toBe("e-59");

      const small = await readAgentLog(fmarkDir, "ag-x", { limit: 5 });
      expect(small.map((e) => e.event)).toEqual([
        "e-55",
        "e-56",
        "e-57",
        "e-58",
        "e-59",
      ]);
    });
  });

  it("rotates to .1 once size exceeds MAX_LOG_BYTES", async () => {
    await withTmp(async (fmarkDir) => {
      const big = "x".repeat(MAX_LOG_BYTES + 1);
      const dir = join(fmarkDir, "agents", "ag-x");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "log.jsonl"), big);
      await appendAgentLog(fmarkDir, "ag-x", { event: "rotate-trigger" });
      const sizeOriginal = (await stat(join(dir, "log.jsonl"))).size;
      const sizeBackup = (await stat(join(dir, "log.jsonl.1"))).size;
      expect(sizeBackup).toBeGreaterThan(0);
      expect(sizeOriginal).toBeLessThan(MAX_LOG_BYTES);
    });
  });

  it("rejects invalid participant ids", async () => {
    await withTmp(async (fmarkDir) => {
      await expect(
        appendAgentLog(fmarkDir, "../etc", { event: "spawn" }),
      ).rejects.toThrow(/invalid participant_id/);
      await expect(readAgentLog(fmarkDir, "Bad-Id")).rejects.toThrow(
        /invalid participant_id/,
      );
    });
  });
});
