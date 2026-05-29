import { describe, it, expect } from "vitest";
import { join } from "path";
import { createClaudeAdapter } from "../../../src/runtimes/adapters/claude.js";

const FIXTURES = join(__dirname, "fixtures", "claude");

describe("claude adapter", () => {
  describe("listModels", () => {
    it("returns the hardcoded model set", async () => {
      const adapter = createClaudeAdapter();
      const models = await adapter.listModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain("claude-opus-4-7");
      expect(ids).toContain("claude-sonnet-4-6");
      expect(ids).toContain("claude-haiku-4-5");
    });
  });

  describe("listEfforts", () => {
    it("returns the five effort levels claude --help advertises", async () => {
      const adapter = createClaudeAdapter();
      const efforts = await adapter.listEfforts();
      expect(efforts.map((e) => e.id)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]);
    });
  });

  describe("readCurrent", () => {
    it("returns the model from the LAST assistant entry", async () => {
      const adapter = createClaudeAdapter();
      const state = await adapter.readCurrent({
        transcriptPath: join(FIXTURES, "transcript-sample.jsonl"),
      });
      expect(state).not.toBeNull();
      expect(state?.model).toBe("claude-sonnet-4-6");
      expect(state?.effort).toBeUndefined(); // not observable from transcript
      expect(state?.source).toBe("transcript");
    });

    it("returns null when no transcript path provided", async () => {
      const adapter = createClaudeAdapter();
      expect(await adapter.readCurrent({})).toBeNull();
    });
  });

  describe("buildSpawnArgs", () => {
    it("builds --model + --effort", () => {
      const adapter = createClaudeAdapter();
      expect(
        adapter.buildSpawnArgs({ model: "sonnet", effort: "high" }),
      ).toEqual(["--model", "sonnet", "--effort", "high"]);
    });

    it("returns [] for empty patch", () => {
      const adapter = createClaudeAdapter();
      expect(adapter.buildSpawnArgs({})).toEqual([]);
    });
  });

  describe("sanitizeArgs", () => {
    it("strips --model and --effort when both are patched", () => {
      const adapter = createClaudeAdapter();
      expect(
        adapter.sanitizeArgs(
          ["--model", "opus", "--effort", "low", "--keep"],
          { model: "sonnet", effort: "high" },
        ),
      ).toEqual(["--keep"]);
    });
  });
});
