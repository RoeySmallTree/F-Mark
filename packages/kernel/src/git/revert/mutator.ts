import type { GitRevertAction } from "@f-mark/shared";
import { FileReverter } from "./files.js";
import { HunkReverter } from "./hunks.js";
import type { GitMutator, RevertContext } from "./types.js";
import {
  assertSafeMergeBase,
  fileRevertKind,
  isAddedLikeStatus,
  requireHunk,
  requireRenameOldPath,
} from "./validation.js";

export class GitRevertMutator implements GitMutator {
  constructor(
    private readonly files: FileReverter,
    private readonly hunks: HunkReverter,
  ) {}

  async revert(
    ctx: RevertContext,
    action: GitRevertAction,
  ): Promise<GitRevertAction> {
    assertSafeMergeBase(ctx.mergeBaseSha);
    await this.applyAction(ctx, action);
    return action;
  }

  private async applyAction(
    ctx: RevertContext,
    action: GitRevertAction,
  ): Promise<void> {
    if (action === "rename") {
      await this.revertRename(ctx);
      return;
    }
    if (action === "file") {
      await this.revertFile(ctx);
      return;
    }
    await this.revertHunk(ctx);
  }

  private async revertRename(ctx: RevertContext): Promise<void> {
    const oldPath = requireRenameOldPath(ctx);
    await this.files.renameBack(ctx.root, ctx.relPosix, oldPath);
  }

  private async revertFile(ctx: RevertContext): Promise<void> {
    const kind = fileRevertKind(ctx.status);
    if (kind === "delete") {
      await this.files.deleteWorkingFile(ctx.root, ctx.relPosix);
      return;
    }
    if (kind === "rename") {
      await this.revertRenamedFile(ctx);
      return;
    }
    await this.files.restoreTrackedFileFromBase(
      ctx.root,
      ctx.relPosix,
      ctx.mergeBaseSha,
    );
  }

  private async revertRenamedFile(ctx: RevertContext): Promise<void> {
    if (ctx.oldPath !== undefined && ctx.oldPath.length > 0) {
      await this.files.restoreRenameWholeFile(
        ctx.root,
        ctx.relPosix,
        ctx.oldPath,
        ctx.mergeBaseSha,
      );
      return;
    }
    await this.files.restoreCurrentPathFromBase(
      ctx.root,
      ctx.relPosix,
      ctx.mergeBaseSha,
    );
  }

  private async revertHunk(ctx: RevertContext): Promise<void> {
    const hunk = requireHunk(ctx);
    await this.hunks.reverseApplyHunk(
      ctx.root,
      ctx.relPosix,
      hunk,
      ctx.status,
      ctx.mergeBaseSha,
    );
    if (isAddedLikeStatus(ctx.status)) {
      await this.hunks.reconcileAfterAddRevert(
        ctx.root,
        ctx.relPosix,
        ctx.status,
      );
    }
  }
}
