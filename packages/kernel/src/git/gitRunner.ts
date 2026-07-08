/* Git-specific subprocess runner (design §8, X6 oversized-repo guard).

   The shared tmux CommandRunner has no timeout and accumulates stdout/stderr
   without bound — fine for short tmux control commands, dangerous for `git
   diff` on a pathological repo (a hung pack or a multi-GB blob can hang the
   process or exhaust memory). This wrapper adds:
     • a hard timeout that SIGKILLs the child on expiry, and
     • stdout/stderr byte caps that kill the child once exceeded.

   It is intentionally separate from CommandRunner so tmux behavior is
   unchanged. Tests inject a CommandRunner-shaped fake via `createGitService`;
   real callers get this spawn-based runner. */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CommandResult, CommandRunner } from "../tmux/commandRunner.js";

/** Group-SIGKILL a detached child by its process group (`-pid`), falling back
    to a direct kill. Mirrors `gitRun`'s `hardKill` so the WHOLE group dies
    (e.g. a pager/grandchild git spawned), not just the leader. Safe to call
    multiple times. */
function killProcessGroup(child: { pid?: number; kill: (sig: NodeJS.Signals) => boolean }): void {
  const pid = child.pid;
  if (pid === undefined) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/** Spawn a `git` subprocess detached (its own process group) with a hard
    timeout that group-SIGKILLs on expiry — the SAME group-kill + timeout
    posture `gitRun` uses, but exposing the raw streaming child so binary blob
    reads (`git show` / `git cat-file blob`) can stream/window stdout instead of
    buffering text. The timeout is cleared on close/error; callers may also call
    the returned `kill()` early (e.g. once a Range has been emitted) so a huge
    blob is not consumed to the end. */
export function spawnGitDetached(
  argv: string[],
  opts: { timeoutMs: number; stderr: boolean },
): { child: ChildProcessWithoutNullStreams; kill: () => void } {
  const [cmd, ...args] = argv;
  const child = spawn(cmd ?? "git", args, {
    stdio: ["ignore", "pipe", opts.stderr ? "pipe" : "ignore"],
    detached: true,
  }) as ChildProcessWithoutNullStreams;
  const kill = (): void => killProcessGroup(child);
  const timer = setTimeout(kill, opts.timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  child.on("close", () => clearTimeout(timer));
  child.on("error", () => clearTimeout(timer));
  return { child, kill };
}

export interface GitRunnerOptions {
  /** Kill the child after this many ms (SIGKILL). */
  timeoutMs: number;
  /** Cap captured stdout bytes; kill + flag `truncated` past this. */
  maxStdoutBytes: number;
  /** Cap captured stderr bytes (stderr is only used for diagnostics). */
  maxStderrBytes: number;
}

const DEFAULT_GIT_RUNNER_OPTIONS: GitRunnerOptions = {
  timeoutMs: 15_000,
  maxStdoutBytes: 48 * 1024 * 1024,
  maxStderrBytes: 256 * 1024,
};

/** A CommandResult plus the runner's safety flags. `git()` in the service
    discards the extra flags via structural typing, so the CommandRunner
    contract is preserved. */
export interface GitCommandResult extends CommandResult {
  /** True when stdout was capped (and the child killed). */
  stdoutTruncated: boolean;
  /** True when the child was killed for exceeding the timeout. */
  timedOut: boolean;
}

/** Spawn `argv` with a timeout + stdout/stderr caps, returning captured text.
    On timeout or stdout-cap the child is SIGKILLed and the partial stdout is
    returned with the relevant flag set (exitCode 124 for a timeout). */
export function gitRun(
  argv: string[],
  opts: GitRunnerOptions = DEFAULT_GIT_RUNNER_OPTIONS,
): Promise<GitCommandResult> {
  return new Promise<GitCommandResult>((resolve) => {
    const [cmd, ...args] = argv;
    if (cmd === undefined) {
      resolve({
        stdout: "",
        stderr: "empty argv",
        exitCode: 127,
        stdoutTruncated: false,
        timedOut: false,
      });
      return;
    }
    /* `detached` puts the child in its own process group so we can SIGKILL the
       WHOLE group (`-pid`) on timeout/cap — killing only the leader can leave a
       grandchild (e.g. a pager git spawns) holding the pipe open. */
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let timedOut = false;
    let settled = false;

    const hardKill = (): void => {
      const pid = child.pid;
      if (pid === undefined) {
        child.kill("SIGKILL");
        return;
      }
      try {
        /* Negative pid → the process group. */
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
    };

    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
        stdoutTruncated,
        timedOut,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      hardKill();
      /* Resolve immediately rather than waiting on `close` — a wedged child
         might never emit it. The group kill still cleans up the process. */
      settle(124);
    }, opts.timeoutMs);
    /* Don't keep the event loop alive solely for this timer. */
    if (typeof timer.unref === "function") timer.unref();

    child.stdout.on("data", (d: Buffer) => {
      if (stdoutBytes >= opts.maxStdoutBytes) return;
      const remaining = opts.maxStdoutBytes - stdoutBytes;
      if (d.length > remaining) {
        stdoutChunks.push(d.subarray(0, remaining));
        stdoutBytes += remaining;
        stdoutTruncated = true;
        hardKill();
      } else {
        stdoutChunks.push(d);
        stdoutBytes += d.length;
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderrBytes >= opts.maxStderrBytes) return;
      const remaining = opts.maxStderrBytes - stderrBytes;
      stderrChunks.push(d.subarray(0, remaining));
      stderrBytes += Math.min(d.length, remaining);
    });
    child.on("error", (err) => {
      /* Surface the spawn error in stderr for diagnostics, then settle. */
      stderrChunks.push(Buffer.from(err.message));
      settle(127);
    });
    child.on("close", (code) => settle(timedOut ? 124 : (code ?? 0)));
  });
}

/** Adapt `gitRun` to the CommandRunner interface so `createGitService` can
    consume either a real spawn runner or a test fake transparently. */
export function realGitCommandRunner(
  opts: GitRunnerOptions = DEFAULT_GIT_RUNNER_OPTIONS,
): CommandRunner {
  return {
    run: (argv) => gitRun(argv, opts),
  };
}
