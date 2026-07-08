import { rename, unlink } from "node:fs/promises";
import { literalPathspec } from "../service.js";
import {
  type MutationTarget,
  resolveMutationTargetUnderRoot,
} from "../workingFile.js";
import type { GitRevertCommands } from "./commands.js";
import {
  RevertConflictError,
  RevertFailedError,
} from "./errors.js";

export class FileReverter {
  constructor(private readonly git: GitRevertCommands) {}

  async deleteWorkingFile(root: string, relPosix: string): Promise<void> {
    if (await this.git.isTracked(root, relPosix)) {
      await this.git.rmTracked(root, relPosix);
      return;
    }
    await this.unlinkUntrackedFile(root, relPosix);
  }

  async renameBack(root: string, newRel: string, oldRel: string): Promise<void> {
    if (await this.git.isTracked(root, newRel)) {
      await this.renameTracked(root, newRel, oldRel);
      return;
    }
    await this.renameUntracked(root, newRel, oldRel);
  }

  async restoreTrackedFileFromBase(
    root: string,
    relPosix: string,
    mergeBaseSha: string,
  ): Promise<void> {
    const staged = await this.git.hasStaged(root, relPosix);
    await this.git.restoreFromBase(root, relPosix, mergeBaseSha, staged);
  }

  async restoreCurrentPathFromBase(
    root: string,
    relPosix: string,
    mergeBaseSha: string,
  ): Promise<void> {
    await this.git.restoreFromBase(root, relPosix, mergeBaseSha, false);
  }

  async restoreRenameWholeFile(
    root: string,
    newRel: string,
    oldRel: string,
    mergeBaseSha: string,
  ): Promise<void> {
    if (await this.git.isTracked(root, newRel)) {
      await this.restoreStagedRenameWholeFile(root, newRel, oldRel, mergeBaseSha);
      return;
    }
    await this.restoreUnstagedRenameWholeFile(root, newRel, oldRel, mergeBaseSha);
  }

  private async unlinkUntrackedFile(root: string, relPosix: string): Promise<void> {
    const target = await resolveMutationTargetUnderRoot(root, relPosix);
    const abs = deletableTargetAbs(target);
    try {
      await unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new RevertConflictError("file no longer exists — refresh the diff");
      }
      throw new RevertFailedError((err as Error).message || "unlink failed");
    }
  }

  private async renameTracked(
    root: string,
    newRel: string,
    oldRel: string,
  ): Promise<void> {
    const r = await this.git.git(root, ["mv", "--", newRel, oldRel]);
    if (r.exitCode !== 0) {
      throw new RevertFailedError(r.stderr.trim() || "git mv failed");
    }
    await this.git.addAll(root, [oldRel, newRel]);
  }

  private async renameUntracked(
    root: string,
    newRel: string,
    oldRel: string,
  ): Promise<void> {
    const from = await resolveMutationTargetUnderRoot(root, newRel);
    const fromAbs = renameSourceAbs(from);
    const to = await resolveMutationTargetUnderRoot(root, oldRel);
    if (to.kind === "escaped") {
      throw new RevertFailedError("rename target escapes the project root");
    }
    await rename(fromAbs, to.abs);
  }

  private async restoreStagedRenameWholeFile(
    root: string,
    newRel: string,
    oldRel: string,
    mergeBaseSha: string,
  ): Promise<void> {
    await this.git.restoreFromBase(root, oldRel, mergeBaseSha, true);
    await this.removeRenamedPath(root, newRel);
    await unlinkLeftoverLeaf(root, newRel);
    await this.reconcileRenameIndex(root, oldRel, newRel);
  }

  private async restoreUnstagedRenameWholeFile(
    root: string,
    newRel: string,
    oldRel: string,
    mergeBaseSha: string,
  ): Promise<void> {
    await this.git.restoreFromBase(root, oldRel, mergeBaseSha, false);
    await this.deleteWorkingFile(root, newRel);
  }

  private async removeRenamedPath(root: string, newRel: string): Promise<void> {
    if (await this.git.gitRmTolerant(root, newRel, false)) return;
    if (await this.git.gitRmTolerant(root, newRel, true)) return;
    throw new RevertFailedError("git rm failed for the renamed path");
  }

  private async reconcileRenameIndex(
    root: string,
    oldRel: string,
    newRel: string,
  ): Promise<void> {
    const status = await this.git.statusShort(root, [oldRel, newRel]);
    if (status === null || status.trim().length === 0) return;
    await this.git.git(root, ["add", "-A", "--", literalPathspec(oldRel)]);
    await this.git.gitRmTolerant(root, newRel, false);
  }
}

function deletableTargetAbs(target: MutationTarget): string {
  if (target.kind === "escaped") {
    throw new RevertFailedError("path escapes the project root");
  }
  if (target.kind === "missing") {
    throw new RevertConflictError("file no longer exists — refresh the diff");
  }
  if (target.isDir) {
    throw new RevertFailedError("untracked path is a directory");
  }
  return target.abs;
}

function renameSourceAbs(target: MutationTarget): string {
  if (target.kind === "escaped") {
    throw new RevertFailedError("rename source escapes the project root");
  }
  if (target.kind === "missing") {
    throw new RevertConflictError("rename source no longer exists — refresh the diff");
  }
  if (target.isDir) {
    throw new RevertFailedError("rename source is a directory");
  }
  return target.abs;
}

async function unlinkLeftoverLeaf(root: string, relPosix: string): Promise<void> {
  const leftover = await resolveMutationTargetUnderRoot(root, relPosix);
  if (leftover.kind === "present" && !leftover.isDir) {
    await unlink(leftover.abs).catch(() => undefined);
  }
}
