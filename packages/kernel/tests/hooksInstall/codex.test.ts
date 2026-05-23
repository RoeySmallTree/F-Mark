import { describe, expect, it } from "vitest";
import { detectCodexHooks, renderCodexInstallSnippet } from "../../src/hooksInstall/codex.js";

describe("Codex hooks adapter", () => {
  it("detects installed when both Stop and UserPromptSubmit blocks present", () => {
    const toml = `
[[hooks.Stop]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-1"]
timeout = 30

[[hooks.UserPromptSubmit]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "us-1", "--kind", "user"]
timeout = 10
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(2);
  });

  it("partial install reported as not installed", () => {
    const toml = `[[hooks.Stop]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-1"]`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(false);
  });

  it("renders a valid snippet", () => {
    const s = renderCodexInstallSnippet("ag-codex-1", "us-1");
    expect(s).toContain("ag-codex-1");
    expect(s).toContain("us-1");
    expect(s).toContain("hooks.Stop");
    expect(s).toContain("hooks.UserPromptSubmit");
  });

  it("returns empty detected entries on empty TOML", () => {
    const r = detectCodexHooks("", "ag-codex-1", "us-1");
    expect(r.installed).toBe(false);
    expect(r.detectedEntries).toEqual([]);
  });
});
