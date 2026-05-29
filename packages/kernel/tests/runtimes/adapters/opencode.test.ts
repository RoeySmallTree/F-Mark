import { describe, it, expect } from "vitest";
import { join } from "path";
import { readFile } from "fs/promises";
import { createOpencodeAdapter } from "../../../src/runtimes/adapters/opencode.js";

const FIXTURES = join(__dirname, "fixtures", "opencode");

async function modelsVerboseStdout(): Promise<string> {
  return readFile(join(FIXTURES, "models-verbose.txt"), "utf8");
}

describe("opencode adapter", () => {
  describe("listModels", () => {
    it("parses provider/model + JSON blocks from `opencode models --verbose`", async () => {
      const stdout = await modelsVerboseStdout();
      const adapter = createOpencodeAdapter({
        runCli: async (args) => {
          if (args[0] === "models" && args.includes("--verbose")) {
            return { stdout, stderr: "", code: 0 };
          }
          return { stdout: "", stderr: "", code: 1 };
        },
      });
      const models = await adapter.listModels();
      expect(models).toHaveLength(3);

      const gpt55 = models.find((m) => m.id === "openai/gpt-5.5");
      expect(gpt55).toBeDefined();
      expect(gpt55?.provider).toBe("openai");
      expect(gpt55?.displayName).toBe("GPT-5.5");
      expect(gpt55?.efforts?.map((e) => e.id)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);

      const sonnet = models.find(
        (m) => m.id === "github-copilot/claude-sonnet-4.6",
      );
      expect(sonnet?.efforts?.map((e) => e.id)).toEqual(["low", "high", "max"]);
    });
  });

  describe("listEfforts", () => {
    it("returns the variants for the requested model", async () => {
      const stdout = await modelsVerboseStdout();
      const adapter = createOpencodeAdapter({
        runCli: async () => ({ stdout, stderr: "", code: 0 }),
      });
      const efforts = await adapter.listEfforts("openai/gpt-5.2");
      expect(efforts.map((e) => e.id)).toEqual([
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    });
  });

  describe("readCurrent", () => {
    it("queries opencode db --format json by session id and parses the model JSON column", async () => {
      const dbRow = JSON.stringify([
        {
          id: "ses_abc",
          agent: "build",
          model: JSON.stringify({
            id: "gpt-5.3-codex",
            providerID: "openai",
            variant: "high",
          }),
          time_updated: 1779946763568,
        },
      ]);
      let calledWith: string[] | null = null;
      const adapter = createOpencodeAdapter({
        runCli: async (args) => {
          calledWith = args;
          return { stdout: dbRow, stderr: "", code: 0 };
        },
      });

      const state = await adapter.readCurrent({ sessionId: "ses_abc" });
      expect(state).not.toBeNull();
      expect(state?.model).toBe("gpt-5.3-codex");
      expect(state?.effort).toBe("high");
      expect(state?.provider).toBe("openai");
      expect(state?.source).toBe("opencode-db");

      // verify the right CLI was invoked
      expect(calledWith).not.toBeNull();
      expect(calledWith![0]).toBe("db");
      expect(calledWith).toContain("--format");
      expect(calledWith).toContain("json");
      expect(calledWith!.some((a) => a.includes("ses_abc"))).toBe(true);
    });

    it("returns null when no sessionId or cwd is given", async () => {
      const adapter = createOpencodeAdapter({
        runCli: async () => ({ stdout: "", stderr: "", code: 0 }),
      });
      expect(await adapter.readCurrent({})).toBeNull();
    });
  });

  describe("buildSpawnArgs", () => {
    it("builds -m + --variant args", () => {
      const adapter = createOpencodeAdapter({
        runCli: async () => ({ stdout: "", stderr: "", code: 0 }),
      });
      expect(
        adapter.buildSpawnArgs({
          model: "openai/gpt-5.5",
          effort: "high",
        }),
      ).toEqual(["-m", "openai/gpt-5.5", "--variant", "high"]);
    });
  });

  describe("sanitizeArgs", () => {
    it("strips -m and --variant when both are patched", () => {
      const adapter = createOpencodeAdapter({
        runCli: async () => ({ stdout: "", stderr: "", code: 0 }),
      });
      expect(
        adapter.sanitizeArgs(
          ["-m", "openai/gpt-5.4", "--variant", "low", "--keep"],
          { model: "openai/gpt-5.5", effort: "high" },
        ),
      ).toEqual(["--keep"]);
    });
  });
});
