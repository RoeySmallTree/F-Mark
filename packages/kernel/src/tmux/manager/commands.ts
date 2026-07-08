import type { CommandResult, CommandRunner } from "../commandRunner.js";

export interface TmuxVersion {
  major: number;
  minor: number;
  raw: string;
}

// FIFO paths embedded in a shell command must be restricted to characters that
// have no shell-special meaning. The mkdtemp + path.join callers in F-Mark
// already produce such paths, but we keep the check as a defensive boundary.
const SAFE_FIFO_PATH = /^[a-zA-Z0-9_./-]+$/;

export class TmuxCommandClient {
  constructor(private readonly runner: CommandRunner) {}

  async newSession(args: string[]): Promise<void> {
    await this.runRequired(
      ["tmux", "new-session", ...args],
      "tmux new-session failed",
    );
  }

  async setOption(
    sessionName: string,
    name: `@${string}`,
    value: string,
  ): Promise<void> {
    await this.runRequired(
      ["tmux", "set-option", "-t", sessionName, name, value],
      "tmux set-option failed",
    );
  }

  async showOption(
    sessionName: string,
    name: `@${string}`,
  ): Promise<string | null> {
    const r = await this.runner.run([
      "tmux",
      "show-options",
      "-t",
      sessionName,
      "-v",
      name,
    ]);
    if (r.exitCode !== 0) return null;
    return r.stdout.trim() || null;
  }

  async listSessions(input?: { projectHash?: string }): Promise<string> {
    // NOTE: not a tab — tmux sanitizes control characters in -F output
    // (a literal \t comes back as "_"), silently corrupting every parsed
    // session name. "|" survives verbatim and cannot appear in the
    // #{session_name} of fmark sessions ([a-z0-9-] only).
    const args = [
      "tmux",
      "ls",
      "-F",
      "#{session_name}|#{session_activity}",
    ];
    if (input?.projectHash !== undefined) {
      args.push(
        "-f",
        `#{session_name} =~ ^fmark-[a-z0-9-]+-${input.projectHash}-(ag|term)-`,
      );
    }
    const r = await this.runner.run(args);
    if (r.exitCode !== 0) {
      if (input?.projectHash !== undefined) {
        return this.listSessions();
      }
      return "";
    }
    return r.stdout;
  }

  async killSession(sessionName: string): Promise<void> {
    await this.runRequired(
      ["tmux", "kill-session", "-t", sessionName],
      "tmux kill-session failed",
    );
  }

  async captureSnapshot(sessionName: string): Promise<string> {
    const r = await this.runner.run([
      "tmux",
      "capture-pane",
      "-t",
      sessionName,
      "-p",
      "-e",
      "-J",
      "-S",
      "-2000",
    ]);
    this.throwIfFailed(r, "tmux capture-pane failed");
    return r.stdout;
  }

  async startPipePane(sessionName: string, fifo: string): Promise<void> {
    if (!SAFE_FIFO_PATH.test(fifo)) {
      throw new Error(`invalid fifo path (must match ${SAFE_FIFO_PATH}): ${fifo}`);
    }
    // -o opens the pipe only if not already piped; tmux runs the command via
    // its shell, so we keep the command string restricted to a safe fifo.
    await this.runRequired(
      ["tmux", "pipe-pane", "-t", sessionName, "-o", `cat >> ${fifo}`],
      "tmux pipe-pane failed",
    );
  }

  async stopPipePane(sessionName: string): Promise<void> {
    await this.runRequired(
      ["tmux", "pipe-pane", "-t", sessionName],
      "tmux pipe-pane failed",
    );
  }

  async sendLiteralText(sessionName: string, text: string): Promise<void> {
    await this.runRequired(
      ["tmux", "send-keys", "-t", sessionName, "-l", "--", text],
      "tmux send-keys failed",
    );
  }

  async loadBuffer(bufferName: string, text: string): Promise<void> {
    const r = await this.runner.run(
      ["tmux", "load-buffer", "-b", bufferName, "-"],
      { input: text },
    );
    this.throwIfFailed(r, "tmux load-buffer failed");
  }

  /* `-p` emits bracketed-paste markers when the pane's application enabled
     bracketed paste (all managed agent TUIs do), so the app sees one atomic
     paste instead of a keystroke burst; `-d` frees the buffer after use. */
  async pasteBuffer(sessionName: string, bufferName: string): Promise<void> {
    await this.runRequired(
      ["tmux", "paste-buffer", "-p", "-d", "-b", bufferName, "-t", sessionName],
      "tmux paste-buffer failed",
    );
  }

  async sendKey(sessionName: string, key: string): Promise<void> {
    await this.runRequired(
      ["tmux", "send-keys", "-t", sessionName, "--", key],
      "tmux send-keys failed",
    );
  }

  async resize(sessionName: string, cols: number, rows: number): Promise<void> {
    await this.runRequired(
      [
        "tmux",
        "resize-window",
        "-t",
        sessionName,
        "-x",
        String(cols),
        "-y",
        String(rows),
      ],
      "tmux resize-window failed",
    );
  }

  async paneAlive(sessionName: string): Promise<boolean> {
    const r = await this.runner.run([
      "tmux",
      "display-message",
      "-t",
      sessionName,
      "-p",
      "#{pane_dead}",
    ]);
    if (r.exitCode !== 0) return false;
    return r.stdout.trim() === "0";
  }

  async getVersion(): Promise<TmuxVersion | null> {
    const r = await this.runner.run(["tmux", "-V"]);
    if (r.exitCode !== 0) return null;
    const m = /^tmux\s+(\d+)\.(\d+)/.exec(r.stdout.trim());
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), raw: `${m[1]}.${m[2]}` };
  }

  private async runRequired(
    argv: string[],
    failureMessage: string,
  ): Promise<void> {
    const r = await this.runner.run(argv);
    this.throwIfFailed(r, failureMessage);
  }

  private throwIfFailed(result: CommandResult, failureMessage: string): void {
    if (result.exitCode !== 0) {
      throw new Error(`${failureMessage}: ${result.stderr.trim()}`);
    }
  }
}
