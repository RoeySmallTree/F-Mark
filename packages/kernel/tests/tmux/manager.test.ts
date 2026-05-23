// packages/kernel/tests/tmux/manager.test.ts
import { describe, expect, it } from "vitest";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../src/tmux/manager.js";

const root = "/home/user/proj-acme";

describe("TmuxManager", () => {
  it("spawnAgent runs tmux new-session detached with executable+args and sets user options", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const result = await mgr.spawnAgent({
      participantId: "ag-claude",
      executable: "claude",
      args: ["--model", "haiku"],
      env: { CLAUDE_TEST: "1" },
    });
    expect(result.sessionName).toMatch(/^fmark-proj-acme-[0-9a-f]{8}-ag-ag-claude$/);
    // First call must be new-session detached:
    const news = r.calls[0]!;
    expect(news).toContain("-d");
    expect(news).toContain("-s");
    expect(news.at(-3)).toBe("claude");
    expect(news.at(-2)).toBe("--model");
    expect(news.at(-1)).toBe("haiku");
  });

  it("spawnTerminal runs tmux new-session for $SHELL", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const res = await mgr.spawnTerminal({ index: 2 });
    expect(res.sessionName).toMatch(/-term-2$/);
  });

  it("listFmarkSessions filters by prefix and verifies @fmark-project", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "ls"], {
      stdout: "fmark-proj-acme-abcdef12-ag-ag-claude\nother-session\nfmark-other-99999999-term-1\n",
      stderr: "",
      exitCode: 0,
    });
    r.expect(["tmux", "show-options"], { stdout: root + "\n", stderr: "", exitCode: 0 });
    r.expect(["tmux", "show-options"], { stdout: "/somewhere/else\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const sessions = await mgr.listFmarkSessions();
    expect(sessions.map((s) => s.sessionName)).toEqual(["fmark-proj-acme-abcdef12-ag-ag-claude"]);
  });

  it("killSession runs tmux kill-session", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.killSession("fmark-x");
    expect(r.calls[0]).toEqual(["tmux", "kill-session", "-t", "fmark-x"]);
  });

  it("captureSnapshot runs tmux capture-pane with the correct flags", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "capture-pane"], { stdout: "snapshot-bytes", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const out = await mgr.captureSnapshot("fmark-x");
    expect(out).toBe("snapshot-bytes");
    expect(r.calls[0]).toEqual(["tmux", "capture-pane", "-t", "fmark-x", "-p", "-e", "-J", "-S", "-2000"]);
  });

  it("sendLiteralText uses send-keys -l --", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.sendLiteralText("fmark-x", "hello world");
    expect(r.calls[0]).toEqual(["tmux", "send-keys", "-t", "fmark-x", "-l", "--", "hello world"]);
  });

  it("sendKey uses send-keys with key names", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.sendKey("fmark-x", "C-c");
    expect(r.calls[0]).toEqual(["tmux", "send-keys", "-t", "fmark-x", "--", "C-c"]);
  });

  it("paneAlive uses display-message + pane_dead", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "display-message"], { stdout: "0\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.paneAlive("fmark-x")).toBe(true);
  });

  it("getTmuxVersion parses output", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "-V"], { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.getVersion()).toEqual({ major: 3, minor: 4, raw: "3.4" });
  });
});
