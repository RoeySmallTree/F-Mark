/* Read-only git service facade. The public API stays anchored here while the
   implementation is split into focused command/ref/status/diff/blob helpers.
   All git invocations remain array-args and run with `-C <root>`. */

import type { CommandRunner } from "../tmux/commandRunner.js";
import { realGitCommandRunner } from "./gitRunner.js";
import { GitBlobService, windowStream } from "./service/blobs.js";
import { GitCommandExecutor } from "./service/command.js";
import { GitDiffService } from "./service/diffs.js";
import {
  GitReferenceService,
  isSafeRef,
  literalPathspec,
} from "./service/refs.js";
import { GitStatusService } from "./service/status.js";
import type { GitService } from "./service/types.js";

export type { GitService, GitResolvedBase } from "./service/types.js";
export { resolveBase } from "./service/base.js";
export { looksBinary } from "./service/binary.js";
export { windowStream };
export {
  parseHunks,
  parseNameStatus,
  parseNumstatZ,
  synthesizeNewFileDiff,
} from "./service/parsers.js";
export { isSafeRef, literalPathspec };

export function createGitService(
  runner: CommandRunner = realGitCommandRunner(),
): GitService {
  const commands = new GitCommandExecutor(runner);
  const refs = new GitReferenceService(commands);
  const status = new GitStatusService(commands);
  const diffs = new GitDiffService(commands);
  const blobs = new GitBlobService(commands);

  return {
    isGitWorktree: refs.isGitWorktree.bind(refs),
    detectBaseRef: refs.detectBaseRef.bind(refs),
    currentRef: refs.currentRef.bind(refs),
    branchRefs: refs.branchRefs.bind(refs),
    resolveCommit: refs.resolveCommit.bind(refs),
    mergeBase: refs.mergeBase.bind(refs),
    validateRef: refs.validateRef.bind(refs),
    changedFiles: status.changedFiles.bind(status),
    untrackedFiles: status.untrackedFiles.bind(status),
    fileDiff: diffs.fileDiff.bind(diffs),
    fileDiffCached: diffs.fileDiffCached.bind(diffs),
    fileDiffWorktree: diffs.fileDiffWorktree.bind(diffs),
    showBlob: blobs.showBlob.bind(blobs),
    blobInfo: blobs.blobInfo.bind(blobs),
    showBlobRange: blobs.showBlobRange.bind(blobs),
    isBinaryPath: status.isBinaryPath.bind(status),
  };
}
