import { expect, it } from "vitest";
import { expectSingleTmuxCall, expectUserOptionCall } from "./assertions.js";
import { commandResult, createHarness } from "./harness.js";

export function registerTmuxMetadataTests(): void {
  it("paneAlive uses display-message + pane_dead", paneAliveUsesPaneDead);
  it("getTmuxVersion parses output", getTmuxVersionParsesOutput);
  it(
    "getUserOption returns trimmed stdout or null on non-zero exit",
    getUserOptionReturnsValueOrNull,
  );
}

async function paneAliveUsesPaneDead(): Promise<void> {
  const h = createHarness();
  h.expectTmux("display-message", commandResult({ stdout: "0\n" }));
  expect(await h.manager.paneAlive("fmark-x")).toBe(true);
  h.verifyExpectationsConsumed();
}

async function getTmuxVersionParsesOutput(): Promise<void> {
  const h = createHarness();
  h.expectCommand(["tmux", "-V"], commandResult({ stdout: "tmux 3.4\n" }));
  expect(await h.manager.getVersion()).toEqual({ major: 3, minor: 4, raw: "3.4" });
  h.verifyExpectationsConsumed();
}

async function getUserOptionReturnsValueOrNull(): Promise<void> {
  const h = createHarness();
  h.expectTmux("show-options", commandResult({ stdout: "value-x\n" }));
  h.expectTmux(
    "show-options",
    commandResult({ stderr: "missing", exitCode: 1 }),
  );
  expect(await h.manager.getUserOption("fmark-x", "@fmark-project")).toBe(
    "value-x",
  );
  expect(await h.manager.getUserOption("fmark-x", "@fmark-project")).toBeNull();
  expectUserOptionCall(h);
  h.verifyExpectationsConsumed();
}
