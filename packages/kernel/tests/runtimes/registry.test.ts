import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRuntimes,
  saveRuntimes,
  initRuntimesFile,
  upsertRuntime,
  removeRuntime,
} from "../../src/runtimes/registry.js";
import { DEFAULT_RUNTIMES } from "../../src/runtimes/defaults.js";

async function withTmpFmark<T>(fn: (fmarkDir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fmark-rt-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("runtimes registry", () => {
  it("initRuntimesFile writes defaults if absent", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      const parsed = JSON.parse(await readFile(join(fmarkDir, "runtimes.json"), "utf8"));
      expect(parsed.runtimes.claude).toEqual(DEFAULT_RUNTIMES.claude);
    });
  });

  it("initRuntimesFile is idempotent and preserves user edits", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      const cfg = await loadRuntimes(fmarkDir);
      cfg.runtimes.claude!.args = ["--model", "haiku"];
      await saveRuntimes(fmarkDir, cfg);
      await initRuntimesFile(fmarkDir);
      const after = await loadRuntimes(fmarkDir);
      expect(after.runtimes.claude!.args).toEqual(["--model", "haiku"]);
    });
  });

  it("upsertRuntime adds and updates", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      await upsertRuntime(fmarkDir, "mylocal", { displayName: "My Local", executable: "/usr/local/bin/my", args: ["--debug"] });
      const cfg = await loadRuntimes(fmarkDir);
      expect(cfg.runtimes.mylocal?.displayName).toBe("My Local");
    });
  });

  it("removeRuntime deletes", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      await upsertRuntime(fmarkDir, "x", { displayName: "X", executable: "x", args: [] });
      await removeRuntime(fmarkDir, "x");
      const cfg = await loadRuntimes(fmarkDir);
      expect(cfg.runtimes.x).toBeUndefined();
    });
  });

  it("upsertRuntime rejects bad executable", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await initRuntimesFile(fmarkDir);
      await expect(upsertRuntime(fmarkDir, "bad", { displayName: "Bad", executable: "bad ; rm -rf", args: [] })).rejects.toThrow();
    });
  });
});
