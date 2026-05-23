// packages/kernel/src/tmux/commandRunner.ts
import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandRunner {
  run(argv: string[], opts?: { cwd?: string; input?: string }): Promise<CommandResult>;
}

export function realCommandRunner(): CommandRunner {
  return {
    run(argv, opts = {}) {
      return new Promise<CommandResult>((resolve) => {
        const [cmd, ...args] = argv;
        if (!cmd) throw new Error("empty argv");
        const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const settle = (r: CommandResult) => {
          if (settled) return;
          settled = true;
          resolve(r);
        };
        child.stdout.on("data", (d) => { stdout += d.toString(); });
        child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("error", (err) => {
          // Emitted before `close` when the executable cannot be spawned
          // (ENOENT, EACCES, etc.). Return a structured 127 result so callers
          // can decide how to handle a missing binary instead of crashing.
          settle({ stdout: "", stderr: err.message, exitCode: 127 });
        });
        child.on("close", (code) => settle({ stdout, stderr, exitCode: code ?? 0 }));
        if (opts.input !== undefined) {
          child.stdin.write(opts.input);
          child.stdin.end();
        } else {
          child.stdin.end();
        }
      });
    },
  };
}

export interface FakeCommandRunner extends CommandRunner {
  expect(prefix: string[], result: CommandResult): void;
  /**
   * Throws if any queued expectation was not consumed by a `run()` call.
   * Tests should invoke this at the end to lock in that every expected tmux
   * call was actually issued.
   */
  verifyExpectationsConsumed(): void;
  readonly calls: string[][];
}

export function fakeCommandRunner(): FakeCommandRunner {
  const queue: { prefix: string[]; result: CommandResult }[] = [];
  const calls: string[][] = [];
  return {
    expect(prefix, result) { queue.push({ prefix, result }); },
    verifyExpectationsConsumed() {
      if (queue.length > 0) {
        const remaining = queue.map((q) => q.prefix.join(" ")).join("; ");
        throw new Error(`unconsumed fake-runner expectations: ${remaining}`);
      }
    },
    get calls() { return calls; },
    async run(argv) {
      calls.push(argv);
      // First entry whose prefix matches the start of argv.
      const idx = queue.findIndex((q) =>
        q.prefix.every((p, i) => argv[i] === p),
      );
      if (idx === -1) throw new Error(`unexpected command: ${argv.join(" ")}`);
      const [match] = queue.splice(idx, 1);
      return match!.result;
    },
  };
}
