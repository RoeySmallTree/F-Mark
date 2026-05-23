import { describe, expect, it } from "vitest";
import { detectClaudeHooks, renderClaudeInstallSnippet } from "../../src/hooksInstall/claude.js";

describe("Claude hooks adapter", () => {
  it("detects installed when both Stop and UserPromptSubmit hooks reference the participant ids", () => {
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream ag-claude" }] }],
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream us-1 --kind user" }] }],
      },
    };
    const r = detectClaudeHooks(settings, "ag-claude", "us-1");
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(2);
  });

  it("partial install reported as not installed", () => {
    const settings = { hooks: { Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream ag-claude" }] }] } };
    const r = detectClaudeHooks(settings, "ag-claude", "us-1");
    expect(r.installed).toBe(false);
  });

  it("renders a valid snippet with the right ids", () => {
    const s = renderClaudeInstallSnippet("ag-claude", "us-1");
    expect(s).toContain("ag-claude");
    expect(s).toContain("us-1");
    expect(s).toContain("UserPromptSubmit");
    expect(s).toContain("Stop");
  });

  it("returns empty detected entries when settings is missing hooks", () => {
    const r = detectClaudeHooks({}, "ag-claude", "us-1");
    expect(r.installed).toBe(false);
    expect(r.detectedEntries).toEqual([]);
    expect(r.expectedEntries.length).toBe(2);
  });

  it("returns empty detected entries when settings is null", () => {
    const r = detectClaudeHooks(null as any, "ag-claude", "us-1");
    expect(r.installed).toBe(false);
  });
});
