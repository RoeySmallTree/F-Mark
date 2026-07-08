import { expect, it } from "vitest";
import {
  expectListFmarkSessionsCalls,
  expectSingleTmuxCall,
} from "./assertions.js";
import { commandResult, createHarness, root } from "./harness.js";

export function registerTmuxSessionTests(): void {
  it(
    "listFmarkSessions filters by project hash in session names",
    listFmarkSessionsFiltersByProject,
  );
  it("killSession runs tmux kill-session", killSessionRunsTmuxKillSession);
  it("killSession throws on non-zero exit", killSessionThrowsOnFailure);
  it(
    "captureSnapshot runs tmux capture-pane with the correct flags",
    captureSnapshotUsesCorrectFlags,
  );
  it("captureSnapshot throws on non-zero exit", captureSnapshotThrowsOnFailure);
}

async function listFmarkSessionsFiltersByProject(): Promise<void> {
  const h = createHarness();
  h.expectTmux(
    "ls",
    commandResult({
      stdout: "fmark-proj-acme-3f067b38-ag-ag-claude\n",
    }),
  );
  const sessions = await h.manager.listFmarkSessions();
  expect(sessions.map((s) => s.sessionName)).toEqual([
    "fmark-proj-acme-3f067b38-ag-ag-claude",
  ]);
  expectListFmarkSessionsCalls(h);
  h.verifyExpectationsConsumed();
}

async function killSessionRunsTmuxKillSession(): Promise<void> {
  const h = createHarness();
  h.expectTmux("kill-session");
  await h.manager.killSession("fmark-x");
  expectSingleTmuxCall(h, ["tmux", "kill-session", "-t", "fmark-x"]);
  h.verifyExpectationsConsumed();
}

async function killSessionThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux(
    "kill-session",
    commandResult({ stderr: "no session", exitCode: 1 }),
  );
  await expect(h.manager.killSession("fmark-x")).rejects.toThrow(
    /tmux kill-session failed/,
  );
  h.verifyExpectationsConsumed();
}

async function captureSnapshotUsesCorrectFlags(): Promise<void> {
  const h = createHarness();
  h.expectTmux("capture-pane", commandResult({ stdout: "snapshot-bytes" }));
  const out = await h.manager.captureSnapshot("fmark-x");
  expect(out).toBe("snapshot-bytes");
  expectSingleTmuxCall(h, [
    "tmux",
    "capture-pane",
    "-t",
    "fmark-x",
    "-p",
    "-e",
    "-J",
    "-S",
    "-2000",
  ]);
  h.verifyExpectationsConsumed();
}

async function captureSnapshotThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux(
    "capture-pane",
    commandResult({ stderr: "no session", exitCode: 1 }),
  );
  await expect(h.manager.captureSnapshot("fmark-x")).rejects.toThrow(
    /tmux capture-pane failed/,
  );
  h.verifyExpectationsConsumed();
}
