import type { GitCommandExecutor } from "./command.js";
import { literalPathspecs } from "./refs.js";

export class GitDiffService {
  constructor(private readonly git: GitCommandExecutor) {}

  async fileDiff(
    root: string,
    mergeBaseSha: string,
    relPath: string,
    oldPath?: string,
  ): Promise<string> {
    const r = await this.git.run(root, [
      "diff",
      "--find-renames",
      "--end-of-options",
      mergeBaseSha,
      "--",
      ...literalPathspecs(relPath, oldPath),
    ]);
    return r.stdout;
  }

  async fileDiffCached(
    root: string,
    mergeBaseSha: string,
    relPath: string,
    oldPath?: string,
  ): Promise<string> {
    const r = await this.git.run(root, [
      "diff",
      "--cached",
      "--find-renames",
      "--end-of-options",
      mergeBaseSha,
      "--",
      ...literalPathspecs(relPath, oldPath),
    ]);
    return r.stdout;
  }

  async fileDiffWorktree(
    root: string,
    relPath: string,
    oldPath?: string,
  ): Promise<string> {
    const r = await this.git.run(root, [
      "diff",
      "--find-renames",
      "--",
      ...literalPathspecs(relPath, oldPath),
    ]);
    return r.stdout;
  }
}
