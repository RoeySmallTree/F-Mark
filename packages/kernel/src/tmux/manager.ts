// packages/kernel/src/tmux/manager.ts
import type { CommandRunner } from "./commandRunner.js";
import {
  fmarkAgentSessionName,
  fmarkTerminalSessionName,
  isFmarkSessionName,
  parseFmarkSessionName,
} from "./naming.js";

export interface TmuxManager {
  spawnAgent(input: {
    participantId: string;
    executable: string;
    args: string[];
    env?: Record<string, string>;
  }): Promise<{ sessionName: string }>;
  spawnTerminal(input: { index: number }): Promise<{ sessionName: string }>;
  listFmarkSessions(): Promise<ListedSession[]>;
  killSession(sessionName: string): Promise<void>;
  captureSnapshot(sessionName: string): Promise<string>;
  startPipePane(sessionName: string, fifo: string): Promise<void>;
  stopPipePane(sessionName: string): Promise<void>;
  sendLiteralText(sessionName: string, text: string): Promise<void>;
  sendKey(sessionName: string, key: string): Promise<void>;
  resize(sessionName: string, cols: number, rows: number): Promise<void>;
  paneAlive(sessionName: string): Promise<boolean>;
  getVersion(): Promise<{ major: number; minor: number; raw: string } | null>;
  getUserOption(sessionName: string, name: `@${string}`): Promise<string | null>;
}

export interface ListedSession {
  sessionName: string;
  kind: "agent" | "terminal";
  participantId?: string;
  index?: number;
}

export function createTmuxManager(deps: {
  runner: CommandRunner;
  projectRoot: string;
}): TmuxManager {
  const { runner, projectRoot } = deps;

  async function setUserOption(session: string, opt: `@${string}`, value: string): Promise<void> {
    await runner.run(["tmux", "set-option", "-t", session, opt, value]);
  }

  async function getUserOption(session: string, opt: `@${string}`): Promise<string | null> {
    const r = await runner.run(["tmux", "show-options", "-t", session, "-v", opt]);
    if (r.exitCode !== 0) return null;
    return r.stdout.trim() || null;
  }

  return {
    async spawnAgent({ participantId, executable, args, env }) {
      const sessionName = fmarkAgentSessionName(projectRoot, participantId);
      const envArgs: string[] = [];
      for (const [k, v] of Object.entries(env ?? {})) envArgs.push("-e", `${k}=${v}`);
      const argv = ["tmux", "new-session", "-d", "-s", sessionName, ...envArgs, "-c", projectRoot, executable, ...args];
      const r = await runner.run(argv);
      if (r.exitCode !== 0) throw new Error(`tmux new-session failed: ${r.stderr.trim()}`);
      await setUserOption(sessionName, "@fmark-project", projectRoot);
      await setUserOption(sessionName, "@fmark-participant", participantId);
      return { sessionName };
    },

    async spawnTerminal({ index }) {
      const sessionName = fmarkTerminalSessionName(projectRoot, index);
      const shell = process.env.SHELL ?? "/bin/sh";
      const r = await runner.run([
        "tmux", "new-session", "-d", "-s", sessionName, "-c", projectRoot, shell,
      ]);
      if (r.exitCode !== 0) throw new Error(`tmux new-session failed: ${r.stderr.trim()}`);
      await setUserOption(sessionName, "@fmark-project", projectRoot);
      return { sessionName };
    },

    async listFmarkSessions() {
      const r = await runner.run(["tmux", "ls", "-F", "#{session_name}"]);
      if (r.exitCode !== 0) return [];
      const candidates = r.stdout.split("\n").map((s) => s.trim()).filter(Boolean).filter(isFmarkSessionName);
      const verified: ListedSession[] = [];
      for (const name of candidates) {
        const val = await getUserOption(name, "@fmark-project");
        if (val !== projectRoot) continue;
        const parsed = parseFmarkSessionName(name);
        if (!parsed) continue;
        verified.push({ sessionName: name, ...parsed });
      }
      return verified;
    },

    async killSession(sessionName) {
      await runner.run(["tmux", "kill-session", "-t", sessionName]);
    },

    async captureSnapshot(sessionName) {
      const r = await runner.run(["tmux", "capture-pane", "-t", sessionName, "-p", "-e", "-J", "-S", "-2000"]);
      return r.stdout;
    },

    async startPipePane(sessionName, fifo) {
      // -O appends; -I would be input; default opens output pipe.
      await runner.run(["tmux", "pipe-pane", "-t", sessionName, "-o", `cat >> ${fifo}`]);
    },

    async stopPipePane(sessionName) {
      await runner.run(["tmux", "pipe-pane", "-t", sessionName]);
    },

    async sendLiteralText(sessionName, text) {
      await runner.run(["tmux", "send-keys", "-t", sessionName, "-l", "--", text]);
    },

    async sendKey(sessionName, key) {
      await runner.run(["tmux", "send-keys", "-t", sessionName, "--", key]);
    },

    async resize(sessionName, cols, rows) {
      await runner.run(["tmux", "resize-window", "-t", sessionName, "-x", String(cols), "-y", String(rows)]);
    },

    async paneAlive(sessionName) {
      const r = await runner.run(["tmux", "display-message", "-t", sessionName, "-p", "#{pane_dead}"]);
      if (r.exitCode !== 0) return false;
      return r.stdout.trim() === "0";
    },

    async getVersion() {
      const r = await runner.run(["tmux", "-V"]);
      if (r.exitCode !== 0) return null;
      const m = /^tmux\s+(\d+)\.(\d+)/.exec(r.stdout.trim());
      if (!m) return null;
      return { major: Number(m[1]), minor: Number(m[2]), raw: `${m[1]}.${m[2]}` };
    },

    async getUserOption(sessionName, name) { return getUserOption(sessionName, name); },
  };
}
