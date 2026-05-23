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

  it("detects hooks declared with a multiline command array", () => {
    const toml = `
[[hooks.Stop]]
command = [
  "npx",
  "-y",
  "f-mark",
  "hook",
  "auto-stream",
  "ag-codex-1"
]
timeout = 30

[[hooks.UserPromptSubmit]]
command = [
  "npx", "-y", "f-mark", "hook", "auto-stream",
  "us-1", "--kind", "user"
]
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(2);
  });

  it("does not detect commented-out command lines as installed", () => {
    const toml = `
[[hooks.Stop]]
# command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-1"]

[[hooks.UserPromptSubmit]]
# command = ["npx", "-y", "f-mark", "hook", "auto-stream", "us-1", "--kind", "user"]
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(false);
    expect(r.detectedEntries).toEqual([]);
  });

  it("detects when one event uses single-line and the other uses multiline arrays", () => {
    const toml = `
[[hooks.Stop]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-1"]
timeout = 30

[[hooks.UserPromptSubmit]]
command = [
  "npx", "-y", "f-mark", "hook", "auto-stream",
  "us-1", "--kind", "user"
]
`;
    const r = detectCodexHooks(toml, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(2);
  });

  it("detects when hooks live across both user-level and project-local TOML", () => {
    // Simulates the dispatcher concatenating ~/.codex/config.toml and
    // <projectRoot>/.codex/config.toml. detectCodexHooks should treat the
    // combined content as a single TOML stream so installed status reflects
    // the union of both files.
    const userToml = `
[[hooks.Stop]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-1"]
`;
    const projectToml = `
[[hooks.UserPromptSubmit]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "us-1", "--kind", "user"]
`;
    const combined = userToml + "\n" + projectToml;
    const r = detectCodexHooks(combined, "ag-codex-1", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(2);
  });
});
