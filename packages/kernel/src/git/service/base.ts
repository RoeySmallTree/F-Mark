import type { GitResolvedBase, GitService } from "./types.js";

export async function resolveBase(
  git: GitService,
  root: string,
  opts: { override?: string | null; preview?: string | null },
): Promise<GitResolvedBase> {
  if (!(await git.isGitWorktree(root))) {
    return { status: "not-git", baseRef: null, mergeBaseSha: null };
  }
  const explicit =
    typeof opts.preview === "string" && opts.preview.length > 0
      ? opts.preview
      : typeof opts.override === "string" && opts.override.length > 0
        ? opts.override
        : null;
  let baseRef: string | null;
  if (explicit !== null) {
    baseRef = (await git.validateRef(root, explicit)) ? explicit : null;
    if (baseRef === null) {
      return { status: "base-not-found", baseRef: null, mergeBaseSha: null };
    }
  } else {
    baseRef = await git.detectBaseRef(root);
  }
  if (baseRef === null) {
    return { status: "base-not-found", baseRef: null, mergeBaseSha: null };
  }
  const mergeBaseSha = await git.mergeBase(root, baseRef);
  if (mergeBaseSha === null) {
    return { status: "base-not-found", baseRef, mergeBaseSha: null };
  }
  return { status: "ok", baseRef, mergeBaseSha };
}
