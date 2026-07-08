import { expect, it } from "vitest";
import { expectSingleTmuxCall } from "./assertions.js";
import { commandResult, createHarness } from "./harness.js";

export function registerTmuxInputTests(): void {
  it("sendLiteralText uses send-keys -l --", sendLiteralTextUsesLiteralMode);
  it("sendLiteralText throws on non-zero exit", sendLiteralTextThrowsOnFailure);
  it("sendKey uses send-keys with key names", sendKeyUsesKeyNames);
  it("sendKey throws on non-zero exit", sendKeyThrowsOnFailure);
  it(
    "deliverPrompt bracket-pastes then submits with confirm Enter",
    deliverPromptPastesAndSubmits,
  );
  it("deliverPrompt throws on paste failure", deliverPromptThrowsOnPasteFailure);
  it("resize runs tmux resize-window with -x and -y", resizeUsesWindowSize);
  it("resize throws on non-zero exit", resizeThrowsOnFailure);
}

async function deliverPromptPastesAndSubmits(): Promise<void> {
  const h = createHarness();
  h.expectTmux("load-buffer");
  h.expectTmux("paste-buffer");
  h.expectTmux("send-keys");
  h.expectTmux("send-keys");
  await h.manager.deliverPrompt("fmark-x", "line one\nline two");

  expect(h.calls).toHaveLength(4);
  const [load, paste, enter, confirm] = h.calls;
  expect(load!.slice(0, 3)).toEqual(["tmux", "load-buffer", "-b"]);
  expect(load!.at(-1)).toBe("-");
  // Prompt text travels via stdin, not argv.
  expect(h.runner.inputs[0]).toBe("line one\nline two");
  expect(paste).toEqual([
    "tmux",
    "paste-buffer",
    "-p",
    "-d",
    "-b",
    load![3]!,
    "-t",
    "fmark-x",
  ]);
  expect(enter).toEqual(["tmux", "send-keys", "-t", "fmark-x", "--", "C-m"]);
  expect(confirm).toEqual(["tmux", "send-keys", "-t", "fmark-x", "--", "C-m"]);
  h.verifyExpectationsConsumed();
}

async function deliverPromptThrowsOnPasteFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux("load-buffer");
  h.expectTmux(
    "paste-buffer",
    commandResult({ stderr: "no session", exitCode: 1 }),
  );
  await expect(h.manager.deliverPrompt("fmark-x", "x")).rejects.toThrow(
    /tmux paste-buffer failed/,
  );
  h.verifyExpectationsConsumed();
}

async function sendLiteralTextUsesLiteralMode(): Promise<void> {
  const h = createHarness();
  h.expectTmux("send-keys");
  await h.manager.sendLiteralText("fmark-x", "hello world");
  expectSingleTmuxCall(h, [
    "tmux",
    "send-keys",
    "-t",
    "fmark-x",
    "-l",
    "--",
    "hello world",
  ]);
  h.verifyExpectationsConsumed();
}

async function sendLiteralTextThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux("send-keys", commandResult({ stderr: "no session", exitCode: 1 }));
  await expect(h.manager.sendLiteralText("fmark-x", "x")).rejects.toThrow(
    /tmux send-keys failed/,
  );
  h.verifyExpectationsConsumed();
}

async function sendKeyUsesKeyNames(): Promise<void> {
  const h = createHarness();
  h.expectTmux("send-keys");
  await h.manager.sendKey("fmark-x", "C-c");
  expectSingleTmuxCall(h, [
    "tmux",
    "send-keys",
    "-t",
    "fmark-x",
    "--",
    "C-c",
  ]);
  h.verifyExpectationsConsumed();
}

async function sendKeyThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux("send-keys", commandResult({ stderr: "no session", exitCode: 1 }));
  await expect(h.manager.sendKey("fmark-x", "C-c")).rejects.toThrow(
    /tmux send-keys failed/,
  );
  h.verifyExpectationsConsumed();
}

async function resizeUsesWindowSize(): Promise<void> {
  const h = createHarness();
  h.expectTmux("resize-window");
  await h.manager.resize("fmark-x", 120, 40);
  expectSingleTmuxCall(h, [
    "tmux",
    "resize-window",
    "-t",
    "fmark-x",
    "-x",
    "120",
    "-y",
    "40",
  ]);
  h.verifyExpectationsConsumed();
}

async function resizeThrowsOnFailure(): Promise<void> {
  const h = createHarness();
  h.expectTmux(
    "resize-window",
    commandResult({ stderr: "no session", exitCode: 1 }),
  );
  await expect(h.manager.resize("fmark-x", 80, 24)).rejects.toThrow(
    /tmux resize-window failed/,
  );
  h.verifyExpectationsConsumed();
}
