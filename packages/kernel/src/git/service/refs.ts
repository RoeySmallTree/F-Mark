import type { GitCommandExecutor } from "./command.js";

/** Reject refs that could be parsed as a git option or contain control chars. */
export function isSafeRef(ref: string): boolean {
  if (ref.length === 0) return false;
  if (ref.startsWith("-")) return false;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return false;
  }
  return true;
}

/** Wrap a root-relative path as a literal pathspec. Always used after `--`. */
export function literalPathspec(relPath: string): string {
  return `:(literal)${relPath}`;
}

export function literalPathspecs(relPath: string, oldPath?: string): string[] {
  return oldPath !== undefined && oldPath !== relPath
    ? [literalPathspec(oldPath), literalPathspec(relPath)]
    : [literalPathspec(relPath)];
}

export class GitReferenceService {
  constructor(private readonly git: GitCommandExecutor) {}

  async isGitWorktree(root: string): Promise<boolean> {
    const r = await this.git.run(root, ["rev-parse", "--is-inside-work-tree"]);
    return r.exitCode === 0 && r.stdout.trim() === "true";
  }

  async resolveCommit(root: string, ref: string): Promise<string | null> {
    if (!isSafeRef(ref)) return null;
    const r = await this.git.run(root, [
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      `${ref}^{commit}`,
    ]);
    if (r.exitCode !== 0) return null;
    const sha = r.stdout.trim();
    return sha.length > 0 ? sha : null;
  }

  async detectBaseRef(root: string): Promise<string | null> {
    const head = await this.git.run(root, [
      "rev-parse",
      "--abbrev-ref",
      "--verify",
      "--quiet",
      "origin/HEAD",
    ]);
    if (head.exitCode === 0) {
      const ref = head.stdout.trim();
      if (ref.length > 0 && ref !== "origin/HEAD") return ref;
    }
    for (const candidate of ["main", "master"]) {
      if ((await this.resolveCommit(root, candidate)) !== null) return candidate;
    }
    return null;
  }

  async currentRef(root: string): Promise<string | null> {
    const r = await this.git.run(root, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ]);
    if (r.exitCode !== 0) return null;
    const ref = r.stdout.trim();
    return ref.length > 0 ? ref : null;
  }

  async branchRefs(root: string): Promise<string[]> {
    const r = await this.git.run(root, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      "refs/remotes",
    ]);
    if (r.exitCode !== 0) return [];
    const seen = new Set<string>();
    for (const raw of r.stdout.split(/\r?\n/)) {
      const ref = raw.trim();
      if (ref.length === 0) continue;
      if (ref.endsWith("/HEAD")) continue;
      if (!isSafeRef(ref)) continue;
      seen.add(ref);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  async mergeBase(root: string, baseRef: string): Promise<string | null> {
    if (!isSafeRef(baseRef)) return null;
    const r = await this.git.run(root, [
      "merge-base",
      "--end-of-options",
      baseRef,
      "HEAD",
    ]);
    if (r.exitCode !== 0) return null;
    const sha = r.stdout.trim();
    return sha.length > 0 ? sha : null;
  }

  async validateRef(root: string, ref: string): Promise<boolean> {
    if (!isSafeRef(ref)) return false;
    const fmt = await this.git.run(root, [
      "check-ref-format",
      "--allow-onelevel",
      ref,
    ]);
    if (fmt.exitCode !== 0) return false;
    return (await this.resolveCommit(root, ref)) !== null;
  }
}
