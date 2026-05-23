// packages/kernel/tests/tmux/commandRunner.test.ts
import { describe, expect, it } from "vitest";
import { realCommandRunner, type CommandRunner, fakeCommandRunner } from "../../src/tmux/commandRunner.js";

describe("realCommandRunner", () => {
  const runner = realCommandRunner();

  it("runs a command and returns stdout", async () => {
    const r = await runner.run(["echo", "hello"]);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.exitCode).toBe(0);
  });

  it("reports non-zero exit code without throwing", async () => {
    const r = await runner.run(["sh", "-c", "exit 7"]);
    expect(r.exitCode).toBe(7);
  });
});

describe("fakeCommandRunner", () => {
  it("returns programmed responses by command match", async () => {
    const fake = fakeCommandRunner();
    fake.expect(["tmux", "ls"], { stdout: "session-a\nsession-b\n", exitCode: 0 });
    const r = await fake.run(["tmux", "ls"]);
    expect(r.stdout).toBe("session-a\nsession-b\n");
  });

  it("records calls in order", async () => {
    const fake = fakeCommandRunner();
    fake.expect(["tmux", "new-session"], { stdout: "", exitCode: 0 });
    await fake.run(["tmux", "new-session", "-s", "x"]);
    expect(fake.calls).toEqual([["tmux", "new-session", "-s", "x"]]);
  });

  it("throws if an unexpected command is run", async () => {
    const fake = fakeCommandRunner();
    await expect(fake.run(["tmux", "kill-session"])).rejects.toThrow(/unexpected/);
  });
});
