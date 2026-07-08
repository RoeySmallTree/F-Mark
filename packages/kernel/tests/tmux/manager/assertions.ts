import { expect } from "vitest";
import { root, type TmuxManagerHarness } from "./harness.js";

export function expectSingleTmuxCall(
  h: TmuxManagerHarness,
  expected: string[],
): void {
  expect(h.calls).toHaveLength(1);
  expect(h.calls[0]).toEqual(expected);
}

export function expectSpawnAgentCalls(
  h: TmuxManagerHarness,
  sessionName: string,
): void {
  expect(h.calls).toHaveLength(3);
  expect(h.calls[0]).toEqual([
    "tmux",
    "new-session",
    "-d",
    "-s",
    sessionName,
    "-e",
    "CLAUDE_TEST=1",
    // F-Mark context is injected by spawnAgent so generic hooks can resolve
    // the bound project and agent without hard-coded install snippets.
    "-e",
    `F_MARK_PATH=${root}`,
    "-e",
    "F_MARK_AGENT_ID=ag-claude",
    "-c",
    root,
    "--",
    "claude",
    "--model",
    "haiku",
  ]);
  expect(h.calls[1]).toEqual([
    "tmux",
    "set-option",
    "-t",
    sessionName,
    "@fmark-project",
    root,
  ]);
  expect(h.calls[2]).toEqual([
    "tmux",
    "set-option",
    "-t",
    sessionName,
    "@fmark-participant",
    "ag-claude",
  ]);
}

export function expectSpawnTerminalCalls(
  h: TmuxManagerHarness,
  sessionName: string,
): void {
  const shell = process.env.SHELL ?? "/bin/sh";
  expect(h.calls).toHaveLength(2);
  expect(h.calls[0]).toEqual([
    "tmux",
    "new-session",
    "-d",
    "-s",
    sessionName,
    "-c",
    root,
    "--",
    shell,
  ]);
  expect(h.calls[1]).toEqual([
    "tmux",
    "set-option",
    "-t",
    sessionName,
    "@fmark-project",
    root,
  ]);
}

export function expectListFmarkSessionsCalls(h: TmuxManagerHarness): void {
  expect(h.calls).toHaveLength(1);
  expect(h.calls[0]).toEqual([
    "tmux",
    "ls",
    "-F",
    "#{session_name}|#{session_activity}",
    "-f",
    "#{session_name} =~ ^fmark-[a-z0-9-]+-3f067b38-(ag|term)-",
  ]);
}

export function expectUserOptionCall(h: TmuxManagerHarness): void {
  expect(h.calls[0]).toEqual([
    "tmux",
    "show-options",
    "-t",
    "fmark-x",
    "-v",
    "@fmark-project",
  ]);
}
