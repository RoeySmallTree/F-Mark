import { describe, it, expect } from "vitest";
import { join } from "path";
import { createCodexAdapter } from "../../../src/runtimes/adapters/codex.js";

const FIXTURES = join(__dirname, "fixtures", "codex");

describe("codex adapter", () => {
  describe("listModels", () => {
    it("returns visibility=list models from the cache fixture with efforts populated", async () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
      });
      const models = await adapter.listModels();

      // 2 visible models, internal-hidden is filtered out
      expect(models).toHaveLength(2);
      const gpt55 = models.find((m) => m.id === "gpt-5.5");
      expect(gpt55).toBeDefined();
      expect(gpt55?.displayName).toBe("GPT-5.5");
      expect(gpt55?.defaultEffort).toBe("medium");
      expect(gpt55?.efforts?.map((e) => e.id)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    });
  });

  describe("readCurrent", () => {
    it("returns model+effort from the LAST turn_context in the rollout", async () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
      });
      const state = await adapter.readCurrent({
        transcriptPath: join(FIXTURES, "rollout-sample.jsonl"),
      });
      expect(state).not.toBeNull();
      expect(state?.model).toBe("gpt-5.5");
      expect(state?.effort).toBe("xhigh");
      expect(state?.source).toBe("rollout");
      expect(typeof state?.observedAt).toBe("number");
    });

    it("returns null when no transcriptPath and no cwd are given", async () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
      });
      const state = await adapter.readCurrent({});
      expect(state).toBeNull();
    });

    it("falls back to cwd-scan of sessions root when transcriptPath is absent", async () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
        sessionsRoot: join(FIXTURES, "sessions"),
      });
      const state = await adapter.readCurrent({ cwd: "/match-this-cwd" });
      expect(state).not.toBeNull();
      expect(state?.model).toBe("gpt-5.5");
      expect(state?.effort).toBe("high");
    });
  });

  describe("buildSpawnArgs", () => {
    it("builds -m + -c effort args", () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
      });
      expect(
        adapter.buildSpawnArgs({ model: "gpt-5.5", effort: "xhigh" }),
      ).toEqual(["-m", "gpt-5.5", "-c", "model_reasoning_effort=xhigh"]);
    });

    it("returns [] for an empty patch", () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
      });
      expect(adapter.buildSpawnArgs({})).toEqual([]);
    });
  });

  describe("sanitizeArgs", () => {
    it("strips -m and -c model_reasoning_effort when both are patched", () => {
      const adapter = createCodexAdapter({
        cachePath: join(FIXTURES, "models_cache.json"),
      });
      expect(
        adapter.sanitizeArgs(
          ["-m", "gpt-5.4", "-c", "model_reasoning_effort=low", "--keep"],
          { model: "gpt-5.5", effort: "high" },
        ),
      ).toEqual(["--keep"]);
    });
  });
});
