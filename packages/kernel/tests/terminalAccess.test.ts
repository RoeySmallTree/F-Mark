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
        scope: "default",
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
});
