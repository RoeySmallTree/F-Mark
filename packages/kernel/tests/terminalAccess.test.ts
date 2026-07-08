import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractTerminalAccessPrompt } from "../src/terminalAccess.js";

describe("terminal access prompt extraction", () => {
  it("parses Codex-style Bash approval prompts with provider options", () => {
    const prompt = `
Reading 1 file... (ctrl+o to expand)
└ mcp.json
└ PostToolUse:Read hook error

● Bash (ls /home/roey/workspace/F-Mark/packages/kernel/node_modules/.bin/tsx && timeout 10 ...)
└ Waiting...

Bash command
ls /home/roey/workspace/F-Mark/packages/kernel/node_modules/.bin/tsx && timeout 10
/home/roey/workspace/F-Mark/packages/kernel/node_modules/.bin/tsx
/home/roey/workspace/F-Mark/packages/kernel/src/index.ts mcp --path /home/roey/workspace/ides/t3code <<< '' 2>&1 | head -30
Check fmark MCP server binary and test startup

Do you want to proceed?
› 1. Yes
  2. Yes, and allow access to .bin/ and timeout 10 commands
  3. No
`;

    const result = extractTerminalAccessPrompt(prompt);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Bash command");
    expect(result!.request_type).toBe("command");
    expect(result!.message).toBe("Do you want to proceed?");
    expect(result!.command).toContain("timeout 10");
    expect(result!.command).not.toContain("Check fmark MCP server binary");
    expect(result!.description).toBe("Check fmark MCP server binary and test startup");
    expect(result!.suggestions).toEqual([
      {
        id: "terminal:1",
        label: "Yes",
        decision: "approve",
        terminal_input: "1",
        scope: "default",
      },
      {
        id: "terminal:2",
        label: "Yes, and allow access to .bin/ and timeout 10 commands",
        decision: "approve",
        terminal_input: "2",
        scope: "always",
      },
      {
        id: "terminal:3",
        label: "No",
        decision: "deny",
        terminal_input: "3",
        scope: "default",
      },
    ]);
  });

  it("preserves once/session/always provider choices from terminal prompts", () => {
    const prompt = `
Field 1/1
Allow the fmark MCP server to run tool "fmark_end_turn"?

participant_id: ag-codex
session_id: s1

› 1. Allow                   Run the tool and continue.
  2. Allow for this session  Run the tool and remember this choice for this session.
  3. Always allow            Run the tool and remember this choice for future tool calls.
  4. Cancel                  Cancel this tool call
enter to submit | esc to cancel
`;

    const result = extractTerminalAccessPrompt(prompt);

    expect(result).not.toBeNull();
    expect(result!.suggestions.map((s) => [s.id, s.scope])).toEqual([
      ["terminal:1", "default"],
      ["terminal:2", "session"],
      ["terminal:3", "always"],
      ["terminal:4", "default"],
    ]);
  });
});

describe("launch-time directory-trust prompts", () => {
  it("extracts the codex directory-trust dialog (wrapped line, ? mid-line)", () => {
    const snapshot = [
      "",
      "Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt injection. Trusting the directory allows project-local config, hooks, and exec policies to load.",
      "",
      "> 1. Yes, continue",
      "  2. No, quit",
      "",
      "Press enter to continue",
    ].join("\n");
    const prompt = extractTerminalAccessPrompt(snapshot);
    expect(prompt).not.toBeNull();
    expect(prompt!.title).toBe("Directory trust");
    expect(prompt!.message).toBe("Do you trust the contents of this directory?");
    expect(prompt!.suggestions).toHaveLength(2);
    expect(prompt!.suggestions[0]).toMatchObject({
      label: "Yes, continue",
      decision: "approve",
      terminal_input: "1",
    });
    expect(prompt!.suggestions[1]).toMatchObject({
      label: "No, quit",
      decision: "deny",
      terminal_input: "2",
    });
  });

  it("extracts the claude folder-trust dialog (question ends with a parenthetical)", () => {
    const snapshot = [
      " Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what's in this folder first.",
      " Claude Code'll be able to read, edit, and execute files here.",
      " Security guide",
      " ❯ 1. Yes, I trust this folder",
      "   2. No, exit",
      " Enter to confirm · Esc to cancel",
    ].join("\n");
    const prompt = extractTerminalAccessPrompt(snapshot);
    expect(prompt).not.toBeNull();
    expect(prompt!.title).toBe("Directory trust");
    expect(prompt!.message).toBe(
      "Quick safety check: Is this a project you created or one you trust?",
    );
    expect(prompt!.suggestions[0]).toMatchObject({
      label: "Yes, I trust this folder",
      decision: "approve",
      terminal_input: "1",
    });
    expect(prompt!.suggestions[1]).toMatchObject({
      label: "No, exit",
      decision: "deny",
      terminal_input: "2",
    });
  });

  it("extracts the claude folder-trust dialog captured from a narrow dock-width pane (hard-wrapped question)", () => {
    /* Real `capture-pane -p -e -J` of the claude trust dialog in a ~38-column
       dock pane: the TUI hard-wraps the question across three lines, which -J
       cannot rejoin, so no single line carries the whole phrase. */
    const snapshot = readFileSync(
      new URL("./fixtures/claude-trust-narrow.pane.txt", import.meta.url),
      "utf8",
    );
    const prompt = extractTerminalAccessPrompt(snapshot);
    expect(prompt).not.toBeNull();
    expect(prompt!.title).toBe("Directory trust");
    expect(prompt!.message).toBe(
      "Quick safety check: Is this a project you created or one you trust?",
    );
    expect(prompt!.suggestions).toHaveLength(2);
    expect(prompt!.suggestions[0]).toMatchObject({
      label: "Yes, I trust this folder",
      decision: "approve",
      terminal_input: "1",
    });
    expect(prompt!.suggestions[1]).toMatchObject({
      label: "No, exit",
      decision: "deny",
      terminal_input: "2",
    });
  });
});
