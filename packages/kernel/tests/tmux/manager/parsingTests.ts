import { expect, it } from "vitest";
import { parseTmuxSessionListLine } from "../../../src/tmux/manager.js";

export function registerTmuxParsingTests(): void {
  it("parses tmux session_activity as an ISO timestamp", parsesSessionActivity);
}

function parsesSessionActivity(): void {
  expect(
    parseTmuxSessionListLine("fmark-proj-acme-abcdef12-ag-ag-claude|1710000000"),
  ).toEqual({
    sessionName: "fmark-proj-acme-abcdef12-ag-ag-claude",
    lastActivityAt: "2024-03-09T16:00:00.000Z",
  });
  expect(parseTmuxSessionListLine("fmark-x")).toEqual({
    sessionName: "fmark-x",
  });
  expect(parseTmuxSessionListLine("")).toBeNull();
}
