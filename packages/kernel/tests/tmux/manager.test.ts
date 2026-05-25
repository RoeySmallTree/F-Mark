// packages/kernel/tests/tmux/manager.test.ts
import { describe, expect, it } from "vitest";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../src/tmux/manager.js";

const root = "/home/user/proj-acme";

describe("TmuxManager", () => {
  it("spawnAgent runs tmux new-session with -- separator before the runtime command and sets user options", async () => {
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

    // Exact argv assertions per call.
    expect(r.calls).toHaveLength(3);
    expect(r.calls[0]).toEqual([
      "tmux",
      "new-session",
      "-d",
      "-s",
      result.sessionName,
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
    expect(r.calls[1]).toEqual([
      "tmux",
      "set-option",
      "-t",
      result.sessionName,
      "@fmark-project",
      root,
    ]);
    expect(r.calls[2]).toEqual([
      "tmux",
      "set-option",
      "-t",
      result.sessionName,
      "@fmark-participant",
      "ag-claude",
    ]);
    r.verifyExpectationsConsumed();
  });

  it("spawnAgent throws on non-zero new-session exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "new-session"], {
      stdout: "",
      stderr: "boom",
      exitCode: 1,
    });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(
      mgr.spawnAgent({ participantId: "ag-x", executable: "claude", args: [] }),
    ).rejects.toThrow(/tmux new-session failed/);
    r.verifyExpectationsConsumed();
  });

  it("spawnTerminal runs tmux new-session for $SHELL with exact argv and sets @fmark-project", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const res = await mgr.spawnTerminal({ index: 2 });
    expect(res.sessionName).toMatch(/-term-2$/);

    const shell = process.env.SHELL ?? "/bin/sh";
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0]).toEqual([
      "tmux",
      "new-session",
      "-d",
      "-s",
      res.sessionName,
      "-c",
      root,
      "--",
      shell,
    ]);
    expect(r.calls[1]).toEqual([
      "tmux",
      "set-option",
      "-t",
      res.sessionName,
      "@fmark-project",
      root,
    ]);
    r.verifyExpectationsConsumed();
  });

  it("listFmarkSessions filters by prefix and verifies @fmark-project via exact show-options argv", async () => {
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

    // Exact argv assertions per call.
    expect(r.calls).toHaveLength(3);
    expect(r.calls[0]).toEqual(["tmux", "ls", "-F", "#{session_name}"]);
    expect(r.calls[1]).toEqual([
      "tmux",
      "show-options",
      "-t",
      "fmark-proj-acme-abcdef12-ag-ag-claude",
      "-v",
      "@fmark-project",
    ]);
    expect(r.calls[2]).toEqual([
      "tmux",
      "show-options",
      "-t",
      "fmark-other-99999999-term-1",
      "-v",
      "@fmark-project",
    ]);
    r.verifyExpectationsConsumed();
  });

  it("killSession runs tmux kill-session", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.killSession("fmark-x");
    expect(r.calls[0]).toEqual(["tmux", "kill-session", "-t", "fmark-x"]);
    r.verifyExpectationsConsumed();
  });

  it("killSession throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "kill-session"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.killSession("fmark-x")).rejects.toThrow(/tmux kill-session failed/);
    r.verifyExpectationsConsumed();
  });

  it("captureSnapshot runs tmux capture-pane with the correct flags", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "capture-pane"], { stdout: "snapshot-bytes", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    const out = await mgr.captureSnapshot("fmark-x");
    expect(out).toBe("snapshot-bytes");
    expect(r.calls[0]).toEqual(["tmux", "capture-pane", "-t", "fmark-x", "-p", "-e", "-J", "-S", "-2000"]);
    r.verifyExpectationsConsumed();
  });

  it("captureSnapshot throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "capture-pane"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.captureSnapshot("fmark-x")).rejects.toThrow(/tmux capture-pane failed/);
    r.verifyExpectationsConsumed();
  });

  it("startPipePane runs tmux pipe-pane with -o and exact argv", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "pipe-pane"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.startPipePane("fmark-x", "/tmp/fifo-abc/pipe");
    expect(r.calls[0]).toEqual([
      "tmux",
      "pipe-pane",
      "-t",
      "fmark-x",
      "-o",
      "cat >> /tmp/fifo-abc/pipe",
    ]);
    r.verifyExpectationsConsumed();
  });

  it("startPipePane rejects FIFO paths containing shell metacharacters", async () => {
    const r = fakeCommandRunner();
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.startPipePane("fmark-x", "/tmp/with space/pipe")).rejects.toThrow(/invalid fifo path/i);
    await expect(mgr.startPipePane("fmark-x", "/tmp/evil;rm -rf/pipe")).rejects.toThrow(/invalid fifo path/i);
    await expect(mgr.startPipePane("fmark-x", "/tmp/$VAR/pipe")).rejects.toThrow(/invalid fifo path/i);
    await expect(mgr.startPipePane("fmark-x", "/tmp/`whoami`/pipe")).rejects.toThrow(/invalid fifo path/i);
    // Allowed: only [a-zA-Z0-9_./-]
    expect(r.calls).toHaveLength(0);
    r.verifyExpectationsConsumed();
  });

  it("startPipePane throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "pipe-pane"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.startPipePane("fmark-x", "/tmp/fifo/pipe")).rejects.toThrow(/tmux pipe-pane failed/);
    r.verifyExpectationsConsumed();
  });

  it("stopPipePane runs tmux pipe-pane with no command (default closes pipe)", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "pipe-pane"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.stopPipePane("fmark-x");
    expect(r.calls[0]).toEqual(["tmux", "pipe-pane", "-t", "fmark-x"]);
    r.verifyExpectationsConsumed();
  });

  it("stopPipePane throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "pipe-pane"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.stopPipePane("fmark-x")).rejects.toThrow(/tmux pipe-pane failed/);
    r.verifyExpectationsConsumed();
  });

  it("sendLiteralText uses send-keys -l --", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.sendLiteralText("fmark-x", "hello world");
    expect(r.calls[0]).toEqual(["tmux", "send-keys", "-t", "fmark-x", "-l", "--", "hello world"]);
    r.verifyExpectationsConsumed();
  });

  it("sendLiteralText throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.sendLiteralText("fmark-x", "x")).rejects.toThrow(/tmux send-keys failed/);
    r.verifyExpectationsConsumed();
  });

  it("sendKey uses send-keys with key names", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.sendKey("fmark-x", "C-c");
    expect(r.calls[0]).toEqual(["tmux", "send-keys", "-t", "fmark-x", "--", "C-c"]);
    r.verifyExpectationsConsumed();
  });

  it("sendKey throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "send-keys"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.sendKey("fmark-x", "C-c")).rejects.toThrow(/tmux send-keys failed/);
    r.verifyExpectationsConsumed();
  });

  it("resize runs tmux resize-window with -x and -y", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "resize-window"], { stdout: "", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await mgr.resize("fmark-x", 120, 40);
    expect(r.calls[0]).toEqual(["tmux", "resize-window", "-t", "fmark-x", "-x", "120", "-y", "40"]);
    r.verifyExpectationsConsumed();
  });

  it("resize throws on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "resize-window"], { stdout: "", stderr: "no session", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    await expect(mgr.resize("fmark-x", 80, 24)).rejects.toThrow(/tmux resize-window failed/);
    r.verifyExpectationsConsumed();
  });

  it("paneAlive uses display-message + pane_dead", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "display-message"], { stdout: "0\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.paneAlive("fmark-x")).toBe(true);
    r.verifyExpectationsConsumed();
  });

  it("getTmuxVersion parses output", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "-V"], { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.getVersion()).toEqual({ major: 3, minor: 4, raw: "3.4" });
    r.verifyExpectationsConsumed();
  });

  it("getUserOption returns trimmed stdout or null on non-zero exit", async () => {
    const r = fakeCommandRunner();
    r.expect(["tmux", "show-options"], { stdout: "value-x\n", stderr: "", exitCode: 0 });
    r.expect(["tmux", "show-options"], { stdout: "", stderr: "missing", exitCode: 1 });
    const mgr = createTmuxManager({ runner: r, projectRoot: root });
    expect(await mgr.getUserOption("fmark-x", "@fmark-project")).toBe("value-x");
    expect(await mgr.getUserOption("fmark-x", "@fmark-project")).toBeNull();
    expect(r.calls[0]).toEqual([
      "tmux",
      "show-options",
      "-t",
      "fmark-x",
      "-v",
      "@fmark-project",
    ]);
    r.verifyExpectationsConsumed();
  });
});
