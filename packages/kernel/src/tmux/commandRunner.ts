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
        child.stdout.on("data", (d) => { stdout += d.toString(); });
        child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
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
  readonly calls: string[][];
}

export function fakeCommandRunner(): FakeCommandRunner {
  const queue: { prefix: string[]; result: CommandResult }[] = [];
  const calls: string[][] = [];
  return {
    expect(prefix, result) { queue.push({ prefix, result }); },
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
