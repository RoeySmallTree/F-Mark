import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitFileStatus, GitHunk } from "@f-mark/shared";
import { literalPathspec } from "../service.js";
import { resolveMutationTargetUnderRoot, resolveWorkingFileUnderRoot } from "../workingFile.js";
import type { GitRevertCommands } from "./commands.js";
import { HunkConflictError } from "./errors.js";

export class HunkReverter {
  constructor(private readonly git: GitRevertCommands) {}

  async reverseApplyHunk(
    root: string,
    relPosix: string,
    hunk: GitHunk,
    status: GitFileStatus,
    mergeBaseSha: string,
  ): Promise<void> {
    const mode =
      status === "deleted"
        ? await this.git.baseFileMode(root, mergeBaseSha, relPosix)
        : "100644";
    const patch = buildHunkPatch(relPosix, hunk, status, mode);
    const extraFlags = hunk.origin === "index" ? ["--cached"] : [];
    const dir = await mkdtemp(join(tmpdir(), "fmark-revert-"));
    const patchFile = join(dir, "hunk.patch");
    try {
      await writeFile(patchFile, patch, "utf8");
      await this.checkReverseApply(root, patchFile, extraFlags);
      await this.applyReversePatch(root, patchFile, extraFlags);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async reconcileAfterAddRevert(
    root: string,
    relPosix: string,
    status: GitFileStatus,
  ): Promise<void> {
    const resolved = await resolveWorkingFileUnderRoot(root, relPosix);
    const empty = resolved.kind === "file" && resolved.size === 0;
    const tracked = await this.git.isTracked(root, relPosix);
    if (status === "added" && tracked) {
      await this.reconcileTrackedAdd(root, relPosix, empty);
      return;
    }
    if (empty) {
      await unlinkLeaf(root, relPosix);
    }
  }

  private async checkReverseApply(
    root: string,
    patchFile: string,
    extraFlags: string[],
  ): Promise<void> {
    const check = await this.git.git(root, [
      "apply",
      "--reverse",
      "--check",
      "--recount",
      ...extraFlags,
      patchFile,
    ]);
    if (check.exitCode !== 0) {
      throw new HunkConflictError(check.stderr.trim() || "git apply --check failed");
    }
  }

  private async applyReversePatch(
    root: string,
    patchFile: string,
    extraFlags: string[],
  ): Promise<void> {
    const apply = await this.git.git(root, [
      "apply",
      "--reverse",
      "--recount",
      ...extraFlags,
      patchFile,
    ]);
    if (apply.exitCode !== 0) {
      throw new HunkConflictError(apply.stderr.trim() || "git apply failed");
    }
  }

  private async reconcileTrackedAdd(
    root: string,
    relPosix: string,
    empty: boolean,
  ): Promise<void> {
    if (empty) {
      await this.git.git(root, ["rm", "--cached", "-f", "--", literalPathspec(relPosix)]);
      await unlinkLeaf(root, relPosix);
      return;
    }
    await this.git.add(root, relPosix);
  }
}

function buildHunkPatch(
  relPosix: string,
  hunk: GitHunk,
  status: GitFileStatus,
  mode: string,
): string {
  const head = `diff --git a/${relPosix} b/${relPosix}`;
  if (status === "deleted") {
    return [
      head,
      `deleted file mode ${mode}`,
      `--- a/${relPosix}`,
      "+++ /dev/null",
      hunk.header,
      hunk.patch,
      "",
    ].join("\n");
  }
  if (status === "added" || status === "untracked") {
    return [
      head,
      `new file mode ${mode}`,
      "--- /dev/null",
      `+++ b/${relPosix}`,
      hunk.header,
      hunk.patch,
      "",
    ].join("\n");
  }
  return [
    head,
    `--- a/${relPosix}`,
    `+++ b/${relPosix}`,
    hunk.header,
    hunk.patch,
    "",
  ].join("\n");
}

async function unlinkLeaf(root: string, relPosix: string): Promise<void> {
  const target = await resolveMutationTargetUnderRoot(root, relPosix);
  if (target.kind === "present" && !target.isDir) {
    await unlink(target.abs).catch(() => undefined);
  }
}
