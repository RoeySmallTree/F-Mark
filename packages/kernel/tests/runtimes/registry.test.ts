import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRuntimes,
  loadOfferableRuntimes,
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

  it("initRuntimesFile backfills built-in runtimes in legacy registries", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await mkdir(fmarkDir, { recursive: true });
      await writeFile(
        join(fmarkDir, "runtimes.json"),
        JSON.stringify(
          {
            version: "1.0",
            runtimes: {
              claude: {
                displayName: "Claude Code",
                executable: "claude",
                args: ["--model", "haiku"],
              },
              gemini: {
                displayName: "Gemini",
                executable: "gemini",
                args: [],
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      await initRuntimesFile(fmarkDir);

      const after = await loadRuntimes(fmarkDir);
      expect(after.runtimes.claude!.args).toEqual(["--model", "haiku"]);
      expect(after.runtimes.codex).toEqual(DEFAULT_RUNTIMES.codex);
      expect(after.runtimes.opencode).toEqual(DEFAULT_RUNTIMES.opencode);
      expect(after.runtimes.gemini?.displayName).toBe("Gemini");
    });
  });

  it("loads historical retired runtimes but excludes them from the offerable view", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await saveRuntimes(fmarkDir, {
        version: "1.0",
        runtimes: {
          ...DEFAULT_RUNTIMES,
          gemini: { displayName: "Gemini", executable: "gemini", args: [] },
        },
      });

      const full = await loadRuntimes(fmarkDir);
      expect(full.runtimes.gemini?.displayName).toBe("Gemini");

      const offerable = await loadOfferableRuntimes(fmarkDir);
      expect(offerable.runtimes.gemini).toBeUndefined();
      expect(Object.keys(offerable.runtimes).sort()).toEqual([
        "claude",
        "codex",
        "opencode",
      ]);
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

  it("loadRuntimes rejects file without runtimes object", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await mkdir(fmarkDir, { recursive: true });
      await writeFile(join(fmarkDir, "runtimes.json"), JSON.stringify({ version: "1.0" }), "utf8");
      await expect(loadRuntimes(fmarkDir)).rejects.toThrow(/runtimes/);
    });
  });

  it("loadRuntimes wraps JSON.parse errors with filename", async () => {
    await withTmpFmark(async (fmarkDir) => {
      await mkdir(fmarkDir, { recursive: true });
      await writeFile(join(fmarkDir, "runtimes.json"), "{ this is not json", "utf8");
      await expect(loadRuntimes(fmarkDir)).rejects.toThrow(/runtimes\.json/);
    });
  });
});
