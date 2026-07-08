import type { CommandResult, CommandRunner } from "../../tmux/commandRunner.js";
import { literalPathspec } from "../service.js";
import {
  RevertConflictError,
  RevertFailedError,
  looksLikeStalePath,
} from "./errors.js";

export class GitRevertCommands {
  constructor(private readonly runner: CommandRunner) {}

  git(
    root: string,
    args: string[],
    input?: string,
  ): Promise<CommandResult> {
    return this.runner.run(
      ["git", "-C", root, ...args],
      input !== undefined ? { input } : undefined,
    );
  }

  async isTracked(root: string, relPosix: string): Promise<boolean> {
    const r = await this.git(root, [
      "ls-files",
      "--error-unmatch",
      "-z",
      "--",
      literalPathspec(relPosix),
    ]);
    return r.exitCode === 0;
  }

  async hasStaged(root: string, relPosix: string): Promise<boolean> {
    const r = await this.git(root, [
      "diff",
      "--cached",
      "--quiet",
      "--",
      literalPathspec(relPosix),
    ]);
    return r.exitCode === 1;
  }

  async baseFileMode(
    root: string,
    sha: string,
    relPosix: string,
  ): Promise<string> {
    const r = await this.git(root, [
      "ls-tree",
      "--end-of-options",
      sha,
      "--",
      literalPathspec(relPosix),
    ]);
    if (r.exitCode === 0) {
      const mode = r.stdout.trim().split(/\s+/)[0];
      if (mode !== undefined && /^\d{6}$/.test(mode)) return mode;
    }
    return "100644";
  }

  async restoreFromBase(
    root: string,
    relPosix: string,
    mergeBaseSha: string,
    staged: boolean,
  ): Promise<void> {
    const args = [
      "restore",
      `--source=${mergeBaseSha}`,
      "--worktree",
      ...(staged ? ["--staged"] : []),
      "--",
      literalPathspec(relPosix),
    ];
    const r = await this.git(root, args);
    if (r.exitCode === 0) return;

    const stderr = r.stderr.trim();
    if (looksLikeStalePath(stderr)) {
      throw new RevertConflictError(stderr || "file no longer matches the diff");
    }
    throw new RevertFailedError(stderr || "git restore failed");
  }

  async gitRmTolerant(
    root: string,
    relPosix: string,
    cached: boolean,
  ): Promise<boolean> {
    const args = cached
      ? ["rm", "--cached", "-f", "--", literalPathspec(relPosix)]
      : ["rm", "-f", "--", literalPathspec(relPosix)];
    const r = await this.git(root, args);
    return r.exitCode === 0 || /did not match/i.test(r.stderr);
  }

  async addAll(root: string, relPosixPaths: string[]): Promise<void> {
    await this.git(root, [
      "add",
      "-A",
      "--",
      ...relPosixPaths.map((relPosix) => literalPathspec(relPosix)),
    ]);
  }

  async add(root: string, relPosix: string): Promise<void> {
    await this.git(root, ["add", "--", literalPathspec(relPosix)]);
  }

  async rmTracked(root: string, relPosix: string): Promise<void> {
    const r = await this.git(root, ["rm", "-f", "--", literalPathspec(relPosix)]);
    if (r.exitCode !== 0) {
      throw new RevertFailedError(r.stderr.trim() || "git rm failed");
    }
  }

  async statusShort(root: string, relPosixPaths: string[]): Promise<string | null> {
    const r = await this.git(root, [
      "status",
      "--short",
      "--",
      ...relPosixPaths.map((relPosix) => literalPathspec(relPosix)),
    ]);
    return r.exitCode === 0 ? r.stdout : null;
  }
}
