import { describe, expect, it } from "vitest";
import { detectGeminiHooks, renderGeminiInstallSnippet } from "../../src/hooksInstall/gemini.js";

describe("Gemini hooks adapter (manual-stream stub)", () => {
  it("always reports not installed with the right configPath note", () => {
    const r = detectGeminiHooks();
    expect(r.installed).toBe(false);
    expect(r.configPath).toContain("manual-stream");
  });

  it("renders the manual-stream snippet", () => {
    const s = renderGeminiInstallSnippet();
    expect(s).toContain("manual-stream");
    expect(s).toContain("AGENT.md");
  });
});
