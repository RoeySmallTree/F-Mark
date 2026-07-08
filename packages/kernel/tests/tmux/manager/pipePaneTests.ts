import { expect, it } from "vitest";
import { expectSingleTmuxCall } from "./assertions.js";
import { commandResult, createHarness } from "./harness.js";

export function registerTmuxPipePaneTests(): void {
  it(
    "startPipePane runs tmux pipe-pane with -o and exact argv",
    startPipePaneUsesOutputFlag,
  );
  it(
    "startPipePane rejects FIFO paths containing shell metacharacters",
    startPipePaneRejectsShellMetacharacters,
  );
  it("startPipePane throws on non-zero exit", startPipePaneThrowsOnFailure);
  it(
    "stopPipePane runs tmux pipe-pane with no command (default closes pipe)",
    stopPipePaneRunsWithoutCommand,
  );
  it("stopPipePane throws on non-zero exit", stopPipePaneThrowsOnFailure);
}

async function startPipePaneUsesOutputFlag(): Promise<void> {
  const h = createHarness();
  h.expectTmux("pipe-pane");
  await h.manager.startPipePane("fmark-x", "/tmp/fifo-abc/pipe");
  expectSingleTmuxCall(h, [
    "tmux",
    "pipe-pane",
    "-t",
    "fmark-x",
    "-o",
    "cat >> /tmp/fifo-abc/pipe",
  ]);
  h.verifyExpectationsConsumed();
}

async function startPipePaneRejectsShellMetacharacters(): Promise<void> {
  const h = createHarness();
  await expect(
    h.manager.startPipePane("fmark-x", "/tmp/with space/pipe"),
  ).rejects.toThrow(/invalid fifo path/i);
  await expect(
    h.manager.startPipePane("fmark-x", "/tmp/evil;rm -rf/pipe"),
  ).rejects.toThrow(/invalid fifo path/i);
  await expect(
    h.manager.startPipePane("fmark-x", "/tmp/$VAR/pipe"),
  ).rejects.toThrow(/invalid fifo path/i);
  await expect(
    h.manager.startPipePane("fmark-x", "/tmp/`whoami`/pipe"),
  ).rejects.toThrow(/invalid fifo path/i);
  // Allowed: only [a-zA-Z0-9_./-]
  expect(h.calls).toHaveLength(0);
  h.verifyExpectationsConsumed();
}

async function startPipePaneThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux("pipe-pane", commandResult({ stderr: "no session", exitCode: 1 }));
  await expect(
    h.manager.startPipePane("fmark-x", "/tmp/fifo/pipe"),
  ).rejects.toThrow(/tmux pipe-pane failed/);
  h.verifyExpectationsConsumed();
}

async function stopPipePaneRunsWithoutCommand(): Promise<void> {
  const h = createHarness();
  h.expectTmux("pipe-pane");
  await h.manager.stopPipePane("fmark-x");
  expectSingleTmuxCall(h, ["tmux", "pipe-pane", "-t", "fmark-x"]);
  h.verifyExpectationsConsumed();
}

async function stopPipePaneThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux("pipe-pane", commandResult({ stderr: "no session", exitCode: 1 }));
  await expect(h.manager.stopPipePane("fmark-x")).rejects.toThrow(
    /tmux pipe-pane failed/,
  );
  h.verifyExpectationsConsumed();
}
