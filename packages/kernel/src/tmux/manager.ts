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
  /* Update the project-root the manager scopes to. New spawns and listFmark
     filtering switch over; existing sessions keep their original @fmark-project
     tag so they remain visible from the old projectRoot only. Called from
     /paths/active after a multi-path switch. */
  rebind(input: { projectRoot: string }): void;
  /* Current projectRoot — exposed for tests and for diagnostic logging. */
  currentProjectRoot(): string;
}

export interface ListedSession {
  sessionName: string;
  kind: "agent" | "terminal";
  participantId?: string;
  index?: number;
}

// FIFO paths embedded in a shell command must be restricted to characters that
// have no shell-special meaning. The mkdtemp + path.join callers in F-Mark
// already produce such paths, but we keep the check as a defensive boundary.
const SAFE_FIFO_PATH = /^[a-zA-Z0-9_./-]+$/;

export function createTmuxManager(deps: {
  runner: CommandRunner;
  projectRoot: string;
}): TmuxManager {
  const { runner } = deps;
  // projectRoot is mutable so the manager survives a path switch without
  // being torn down/recreated. New spawns and listFmark scope to the latest
  // value; pre-rebind sessions retain their original @fmark-project tag.
  let projectRoot = deps.projectRoot;

  async function setUserOption(session: string, opt: `@${string}`, value: string): Promise<void> {
    const r = await runner.run(["tmux", "set-option", "-t", session, opt, value]);
    if (r.exitCode !== 0) throw new Error(`tmux set-option failed: ${r.stderr.trim()}`);
  }

  async function getUserOption(session: string, opt: `@${string}`): Promise<string | null> {
    const r = await runner.run(["tmux", "show-options", "-t", session, "-v", opt]);
    if (r.exitCode !== 0) return null;
    return r.stdout.trim() || null;
  }

  return {
    async spawnAgent({ participantId, executable, args, env }) {
      const sessionName = fmarkAgentSessionName(projectRoot, participantId);
      // Inject F-Mark context so generic hooks can resolve the agent/session
      // without hard-coded participant ids in the user's runtime settings.
      const effectiveEnv: Record<string, string> = {
        ...(env ?? {}),
        F_MARK_PATH: env?.F_MARK_PATH ?? projectRoot,
        F_MARK_AGENT_ID: participantId,
      };
      const envArgs: string[] = [];
      for (const [k, v] of Object.entries(effectiveEnv)) envArgs.push("-e", `${k}=${v}`);
      // `--` separates tmux's own flags from the runtime command argv so that
      // executable/args with leading dashes are never reinterpreted as tmux
      // options.
      const argv = [
        "tmux",
        "new-session",
        "-d",
        "-s",
        sessionName,
        ...envArgs,
        "-c",
        projectRoot,
        "--",
        executable,
        ...args,
      ];
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
        "tmux",
        "new-session",
        "-d",
        "-s",
        sessionName,
        "-c",
        projectRoot,
        "--",
        shell,
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
      const r = await runner.run(["tmux", "kill-session", "-t", sessionName]);
      if (r.exitCode !== 0) throw new Error(`tmux kill-session failed: ${r.stderr.trim()}`);
    },

    async captureSnapshot(sessionName) {
      const r = await runner.run(["tmux", "capture-pane", "-t", sessionName, "-p", "-e", "-J", "-S", "-2000"]);
      if (r.exitCode !== 0) throw new Error(`tmux capture-pane failed: ${r.stderr.trim()}`);
      return r.stdout;
    },

    async startPipePane(sessionName, fifo) {
      if (!SAFE_FIFO_PATH.test(fifo)) {
        throw new Error(`invalid fifo path (must match ${SAFE_FIFO_PATH}): ${fifo}`);
      }
      // -o opens the pipe only if not already piped; tmux runs the command via
      // its shell, so we keep the command string restricted to a safe fifo.
      const r = await runner.run(["tmux", "pipe-pane", "-t", sessionName, "-o", `cat >> ${fifo}`]);
      if (r.exitCode !== 0) throw new Error(`tmux pipe-pane failed: ${r.stderr.trim()}`);
    },

    async stopPipePane(sessionName) {
      const r = await runner.run(["tmux", "pipe-pane", "-t", sessionName]);
      if (r.exitCode !== 0) throw new Error(`tmux pipe-pane failed: ${r.stderr.trim()}`);
    },

    async sendLiteralText(sessionName, text) {
      const r = await runner.run(["tmux", "send-keys", "-t", sessionName, "-l", "--", text]);
      if (r.exitCode !== 0) throw new Error(`tmux send-keys failed: ${r.stderr.trim()}`);
    },

    async sendKey(sessionName, key) {
      const r = await runner.run(["tmux", "send-keys", "-t", sessionName, "--", key]);
      if (r.exitCode !== 0) throw new Error(`tmux send-keys failed: ${r.stderr.trim()}`);
    },

    async resize(sessionName, cols, rows) {
      const r = await runner.run(["tmux", "resize-window", "-t", sessionName, "-x", String(cols), "-y", String(rows)]);
      if (r.exitCode !== 0) throw new Error(`tmux resize-window failed: ${r.stderr.trim()}`);
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

    rebind({ projectRoot: next }) { projectRoot = next; },
    currentProjectRoot() { return projectRoot; },
  };
}
