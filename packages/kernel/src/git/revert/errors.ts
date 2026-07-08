/** Raised when `git apply --reverse --check` fails because the hunk no longer
    matches the working tree or index. The route maps this to 409. */
export class HunkConflictError extends Error {
  constructor(public readonly detail: string) {
    super("hunk no longer applies");
    this.name = "HunkConflictError";
  }
}

/** Raised when a revert is attempted that the status matrix forbids. */
export class RevertNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevertNotAllowedError";
  }
}

/** Raised when a git mutation exits non-zero for a reason other than a hunk
    conflict or a refreshable stale-file race. */
export class RevertFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevertFailedError";
  }
}

/** Raised when a file-level revert is stale because the repo moved under us. */
export class RevertConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevertConflictError";
  }
}

/* Heuristic: does a git stderr indicate the path is no longer where the diff
   expected it rather than a real fault? */
export function looksLikeStalePath(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return (
    s.includes("did not match") ||
    s.includes("does not exist") ||
    s.includes("no such file") ||
    s.includes("pathspec") ||
    s.includes("needs merge") ||
    s.includes("did not match any file")
  );
}
