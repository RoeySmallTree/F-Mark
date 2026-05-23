import { describe, expect, it } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTmuxManager } from "../../src/tmux/manager.js";
import { realCommandRunner } from "../../src/tmux/commandRunner.js";

const execp = promisify(exec);

async function haveTmux(): Promise<boolean> {
  try {
    const { stdout } = await execp("tmux -V");
    const m = /tmux\s+(\d+)\.(\d+)/.exec(stdout);
    if (!m) return false;
    const major = Number(m[1]);
    return major >= 3;
  } catch {
    return false;
  }
}

const tmuxAvailable = await haveTmux();

describe.skipIf(!tmuxAvailable)("tmux smoke (real tmux >= 3.0)", () => {
  it("spawns a tmux session, sends literal text, captures output, kills cleanly", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-smoke-tmux-"));
    try {
      const mgr = createTmuxManager({ runner: realCommandRunner(), projectRoot: root });

      // Spawn a session running `cat` so we can echo back what we send
      const { sessionName } = await mgr.spawnAgent({
        participantId: "ag-smoke",
        executable: "cat",
        args: [],
      });
      try {
        // Give cat a moment to attach to its stdin
        await new Promise((r) => setTimeout(r, 250));

        // Send literal text + Enter
        await mgr.sendLiteralText(sessionName, "hello smoke");
        await mgr.sendKey(sessionName, "C-m");

        // Wait for cat to echo
        await new Promise((r) => setTimeout(r, 250));

        // Capture pane and assert
        const snap = await mgr.captureSnapshot(sessionName);
        expect(snap).toMatch(/hello smoke/);

        // Pane should still be alive prior to kill
        expect(await mgr.paneAlive(sessionName)).toBe(true);
      } finally {
        await mgr.killSession(sessionName);
      }

      // After kill, session must no longer appear in listFmarkSessions
      const remaining = await mgr.listFmarkSessions();
      expect(remaining.some((s) => s.sessionName === sessionName)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000); // generous timeout for real tmux work

  it("listFmarkSessions filters by @fmark-project user option", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-smoke-list-"));
    try {
      const mgr = createTmuxManager({ runner: realCommandRunner(), projectRoot: root });
      const { sessionName: a } = await mgr.spawnAgent({
        participantId: "ag-smoke-list",
        executable: "cat",
        args: [],
      });
      try {
        const listed = await mgr.listFmarkSessions();
        expect(listed.some((s) => s.sessionName === a)).toBe(true);
      } finally {
        await mgr.killSession(a);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("send-keys literal mode preserves quotes and special chars", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-smoke-quotes-"));
    try {
      const mgr = createTmuxManager({ runner: realCommandRunner(), projectRoot: root });
      const { sessionName } = await mgr.spawnAgent({
        participantId: "ag-quotes",
        executable: "cat",
        args: [],
      });
      try {
        await new Promise((r) => setTimeout(r, 250));
        const tricky = `say "hi" 'world' --flag`;
        await mgr.sendLiteralText(sessionName, tricky);
        await mgr.sendKey(sessionName, "C-m");
        await new Promise((r) => setTimeout(r, 250));
        const snap = await mgr.captureSnapshot(sessionName);
        expect(snap).toContain(tricky);
      } finally {
        await mgr.killSession(sessionName);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("pipe-pane writes the same data the pane displays to the target file", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-smoke-pipe-"));
    // pipe-pane requires a fifo-safe path; mkdtemp gives us a safe one.
    const fifoDir = await mkdtemp(join(tmpdir(), "fmark-smoke-fifo-"));
    await mkdir(fifoDir, { recursive: true });
    const fifoPath = join(fifoDir, "pipe");
    try {
      const mgr = createTmuxManager({ runner: realCommandRunner(), projectRoot: root });
      const { sessionName } = await mgr.spawnAgent({
        participantId: "ag-pipe",
        executable: "cat",
        args: [],
      });
      try {
        await new Promise((r) => setTimeout(r, 250));

        // Start piping the pane to a regular file (cat >> path works either way)
        await mgr.startPipePane(sessionName, fifoPath);

        const marker = "smoke-pipe-marker";
        await mgr.sendLiteralText(sessionName, marker);
        await mgr.sendKey(sessionName, "C-m");

        // Allow cat (in the pane) to echo, and tmux to flush the pipe
        await new Promise((r) => setTimeout(r, 500));

        await mgr.stopPipePane(sessionName);

        const piped = await readFile(fifoPath, "utf8");
        expect(piped).toContain(marker);

        const snap = await mgr.captureSnapshot(sessionName);
        expect(snap).toContain(marker);
      } finally {
        await mgr.killSession(sessionName);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(fifoDir, { recursive: true, force: true });
    }
  }, 30_000);
});
