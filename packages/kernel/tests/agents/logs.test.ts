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

  it("rotates when an exactly-MAX_LOG_BYTES file gets an append", async () => {
    await withTmp(async (fmarkDir) => {
      const dir = join(fmarkDir, "agents", "ag-exact");
      await mkdir(dir, { recursive: true });
      // Construct a file with EXACTLY MAX_LOG_BYTES bytes.
      const exact = "x".repeat(MAX_LOG_BYTES);
      await writeFile(join(dir, "log.jsonl"), exact);
      const preSize = (await stat(join(dir, "log.jsonl"))).size;
      expect(preSize).toBe(MAX_LOG_BYTES);

      await appendAgentLog(fmarkDir, "ag-exact", { event: "trigger-at-boundary" });

      // Original should be rotated: backup carries the prior content,
      // new log only contains the freshly appended line.
      const sizeBackup = (await stat(join(dir, "log.jsonl.1"))).size;
      expect(sizeBackup).toBe(MAX_LOG_BYTES);
      const sizeOriginal = (await stat(join(dir, "log.jsonl"))).size;
      expect(sizeOriginal).toBeLessThan(MAX_LOG_BYTES);
      expect(sizeOriginal).toBeGreaterThan(0);
    });
  });

  it("rotates exactly at the append that would cross MAX_LOG_BYTES", async () => {
    await withTmp(async (fmarkDir) => {
      const dir = join(fmarkDir, "agents", "ag-cross");
      await mkdir(dir, { recursive: true });
      // Start with a file just shy of the limit so a single small line crosses.
      // Reserve room for two appends: the first stays under, the second crosses.
      // Compute exact size based on the line shape produced by appendAgentLog.
      // The line is JSON.stringify({ ts, event }) + "\n". ts is ISO-8601 28 chars
      // typically. Use a placeholder filler equal to MAX - smallLineSize.
      // Simpler: write `MAX_LOG_BYTES - small` bytes such that the first append
      // stays under MAX and the second crosses.
      // The smallest realistic appended line size for { event: "x" } with ts is
      // around 50 bytes. We'll size the seed so that:
      //  preSize + line1 <= MAX (no rotation), preSize + line1 + line2 > MAX (rotate on line2).
      // Use seed = MAX_LOG_BYTES - 70 to give clear margin.
      const seed = "x".repeat(MAX_LOG_BYTES - 70);
      await writeFile(join(dir, "log.jsonl"), seed);

      // First append: should not rotate (preSize + lineBytes <= MAX).
      await appendAgentLog(fmarkDir, "ag-cross", { event: "near" });
      // Confirm no rotation happened.
      let backupExists = true;
      try {
        await stat(join(dir, "log.jsonl.1"));
      } catch {
        backupExists = false;
      }
      expect(backupExists).toBe(false);

      // Second append: now we should be above the seed + line1; another line
      // pushes us over MAX. After the second append, expect a rotation.
      // First, top up the file to just under MAX so the next line is guaranteed
      // to cross.
      const midSize = (await stat(join(dir, "log.jsonl"))).size;
      const need = MAX_LOG_BYTES - midSize - 5; // leave 5 bytes of headroom
      if (need > 0) {
        // Use raw appendFile via writeFile append flag through fs/promises.
        // We can use mkdir+writeFile? Simpler: open a writable and write.
        // Vitest test: use appendFile via fs/promises explicitly.
        const { appendFile } = await import("node:fs/promises");
        await appendFile(join(dir, "log.jsonl"), "x".repeat(need), "utf8");
      }
      const preCrossSize = (await stat(join(dir, "log.jsonl"))).size;
      expect(preCrossSize).toBeLessThanOrEqual(MAX_LOG_BYTES);

      // Now an append must rotate.
      await appendAgentLog(fmarkDir, "ag-cross", { event: "cross" });
      const sizeBackup = (await stat(join(dir, "log.jsonl.1"))).size;
      expect(sizeBackup).toBe(preCrossSize);
      const sizeOriginal = (await stat(join(dir, "log.jsonl"))).size;
      expect(sizeOriginal).toBeLessThan(MAX_LOG_BYTES);
      expect(sizeOriginal).toBeGreaterThan(0);
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
