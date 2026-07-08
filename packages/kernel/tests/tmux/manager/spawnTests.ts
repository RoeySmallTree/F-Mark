import { expect, it } from "vitest";
import {
  expectSpawnAgentCalls,
  expectSpawnTerminalCalls,
} from "./assertions.js";
import { commandResult, createHarness } from "./harness.js";

export function registerTmuxSpawnTests(): void {
  it(
    "spawnAgent runs tmux new-session with -- separator before the runtime command and sets user options",
    spawnAgentUsesSeparatorAndSetsOptions,
  );
  it("spawnAgent throws on non-zero new-session exit", spawnAgentThrowsOnFailure);
  it(
    "spawnTerminal runs tmux new-session for $SHELL with exact argv and sets @fmark-project",
    spawnTerminalUsesShellAndSetsProject,
  );
}

async function spawnAgentUsesSeparatorAndSetsOptions(): Promise<void> {
  const h = createHarness();
  h.expectTmux("new-session");
  h.expectTmux("set-option");
  h.expectTmux("set-option");
  const result = await h.manager.spawnAgent({
    participantId: "ag-claude",
    executable: "claude",
    args: ["--model", "haiku"],
    env: { CLAUDE_TEST: "1" },
  });
  expect(result.sessionName).toMatch(/^fmark-proj-acme-[0-9a-f]{8}-ag-ag-claude$/);
  expectSpawnAgentCalls(h, result.sessionName);
  h.verifyExpectationsConsumed();
}

async function spawnAgentThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux("new-session", commandResult({ stderr: "boom", exitCode: 1 }));
  await expect(
    h.manager.spawnAgent({ participantId: "ag-x", executable: "claude", args: [] }),
  ).rejects.toThrow(/tmux new-session failed/);
  h.verifyExpectationsConsumed();
}

async function spawnTerminalUsesShellAndSetsProject(): Promise<void> {
  const h = createHarness();
  h.expectTmux("new-session");
  h.expectTmux("set-option");
  const res = await h.manager.spawnTerminal({ index: 2 });
  expect(res.sessionName).toMatch(/-term-2$/);
  expectSpawnTerminalCalls(h, res.sessionName);
  h.verifyExpectationsConsumed();
}
