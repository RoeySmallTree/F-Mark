import { describe, it, expect } from "vitest";
import { join } from "path";
import {
  canonicalizeClaudeModelId,
  createClaudeAdapter,
} from "../../../src/runtimes/adapters/claude.js";

const FIXTURES = join(__dirname, "fixtures", "claude");
const CLAUDE_HELP = `
  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name (e.g.
                                        'claude-fable-5').
`;

describe("claude adapter", () => {
  describe("listModels", () => {
    it("returns the provider-advertised model set from claude --help", async () => {
      const calls: string[][] = [];
      const adapter = createClaudeAdapter({
        runCli: async (args) => {
          calls.push(args);
          return { stdout: CLAUDE_HELP, stderr: "", code: 0 };
        },
      });
      const models = await adapter.listModels();
      const ids = models.map((m) => m.id);
      expect(calls).toEqual([["--help"]]);
      expect(ids).toEqual(["fable", "opus", "sonnet", "claude-fable-5"]);
      expect(ids).not.toContain("claude-opus-4-7");
      expect(models.find((model) => model.id === "fable")?.displayName).toBe(
        "Fable",
      );
    });
  });

  describe("listEfforts", () => {
    it("returns the five effort levels claude --help advertises", async () => {
      const adapter = createClaudeAdapter({
        runCli: async () => ({ stdout: CLAUDE_HELP, stderr: "", code: 0 }),
      });
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

    it("canonicalizes aliases + date suffixes + skips synthetic", async () => {
      // Fixture order: alias 'opus', then '<synthetic>' (skipped),
      // then date-suffixed haiku slug. Latest non-synthetic wins.
      const adapter = createClaudeAdapter();
      const state = await adapter.readCurrent({
        transcriptPath: join(FIXTURES, "transcript-alias.jsonl"),
      });
      expect(state?.model).toBe("claude-haiku-4-5");
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

  describe("canonicalizeClaudeModelId", () => {
    it("returns canonical slugs unchanged", () => {
      expect(canonicalizeClaudeModelId("claude-opus-4-7")).toBe("claude-opus-4-7");
    });

    it("keeps bare provider aliases as provider aliases", () => {
      expect(canonicalizeClaudeModelId("fable")).toBe("fable");
      expect(canonicalizeClaudeModelId("opus")).toBe("opus");
      expect(canonicalizeClaudeModelId("sonnet")).toBe("sonnet");
    });

    it("strips trailing date suffixes from family slugs", () => {
      expect(canonicalizeClaudeModelId("claude-fable-5-20261001")).toBe(
        "claude-fable-5",
      );
      expect(canonicalizeClaudeModelId("claude-haiku-4-5-20251001")).toBe(
        "claude-haiku-4-5",
      );
      expect(canonicalizeClaudeModelId("claude-sonnet-4-6-20260301")).toBe(
        "claude-sonnet-4-6",
      );
    });

    it("lowercases input", () => {
      expect(canonicalizeClaudeModelId("OPUS")).toBe("opus");
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
