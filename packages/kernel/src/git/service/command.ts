import type { CommandRunner } from "../../tmux/commandRunner.js";

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitCommandExecutor {
  constructor(private readonly runner: CommandRunner) {}

  run(root: string, args: string[]): Promise<GitCommandResult> {
    return this.runner.run(["git", "-C", root, ...args]);
  }
}
