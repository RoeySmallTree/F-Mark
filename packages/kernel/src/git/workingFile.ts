/* Centralized, symlink-safe resolution for EVERY working-tree byte read in the
   git feature (review blocker 1). Both the /git routes (/git/diff untracked
   text, /git/file-version, /git/blob-version working side) AND the service-side
   untracked count/binary probe go through this ONE guard so there is a single
   place where "is this working byte inside the scoped root?" is decided.

   It uses `realpath` (collapses every symlink segment) + the SAME parameterized
   `projectRootGuard` the route scope layer uses, then `stat`s the canonical
   target. An in-repo symlink pointing outside the root resolves to `escaped`
   and is NEVER read. `relPosix` is expected to already be lexically guarded
   (no `..` escape) by the caller. */

import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { lstat, realpath, stat } from "node:fs/promises";
import { projectRootGuard } from "../routes/rootScope.js";

/* Outcome of resolving a working-tree path for a byte read. `escaped` means a
   symlink (or the path itself) resolves OUTSIDE the known root — callers must
   treat it as binary/metadata and never read the target bytes. */
export type WorkingFile =
  | { kind: "file"; abs: string; size: number }
  | { kind: "missing" }
  | { kind: "escaped" }
  | { kind: "not-file" };

export async function resolveWorkingFileUnderRoot(
  root: string,
  relPosix: string,
): Promise<WorkingFile> {
  const abs = join(root, relPosix);
  let canonical: string;
  try {
    /* realpath resolves every symlink segment; the guard then rejects any
       target outside the root. */
    canonical = await realpath(abs);
  } catch {
    return { kind: "missing" };
  }
  const guard = projectRootGuard(root, canonical);
  if (!guard.ok) return { kind: "escaped" };
  let info;
  try {
    info = await stat(canonical);
  } catch {
    return { kind: "missing" };
  }
  if (!info.isFile()) return { kind: "not-file" };
  return { kind: "file", abs: canonical, size: info.size };
}

/* ── mutating-path guard (review blocker 1) ───────────────────────────────

   `resolveWorkingFileUnderRoot` realpaths the FINAL path, which is correct for
   READS but catastrophic for MUTATIONS: deleting an untracked `link.txt ->
   /etc/victim` would `realpath` to `/etc/victim` and unlink the *target*, not
   the link. Every unlink/rename target must instead operate on the path ITSELF.

   The guard here:
     1. lexically rejects `..`-escape / absolute `relPosix` (defends a not-yet-
        existing path before any fs call);
     2. `realpath`s the PARENT directory (so symlinked *intermediate* dirs are
        still resolved + confirmed under the known root — you can't smuggle a
        path out via a symlinked subdir), and confirms it is inside root;
     3. `lstat`s `join(parentReal, basename)` WITHOUT following the final
        component, so callers unlink/rename the link itself.

   It never returns `realpath(relPosix)` — the absolute path it yields is the
   real parent joined to the literal basename, i.e. the link node, not its
   target. */
export type MutationTarget =
  | { kind: "present"; abs: string; isSymlink: boolean; isFile: boolean; isDir: boolean }
  | { kind: "missing"; abs: string }
  | { kind: "escaped" };

/** Lexically guard `relPosix`, then resolve its PARENT under `root` and lstat
    the final component without following it. `abs` is always parentReal +
    basename — safe to unlink/rename as the path itself. `missing` still returns
    a guarded `abs` (the parent exists, the leaf does not) so a rename
    DESTINATION can be validated. `escaped` means the lexical path or the real
    parent falls outside the root and the caller must refuse to mutate. */
export async function resolveMutationTargetUnderRoot(
  root: string,
  relPosix: string,
): Promise<MutationTarget> {
  /* (1) lexical guard — reject absolute + `..` escape before touching fs. */
  if (relPosix.length === 0 || isAbsolute(relPosix)) return { kind: "escaped" };
  const lexAbs = join(root, relPosix);
  const lexRel = relative(root, lexAbs);
  if (lexRel === ".." || lexRel.startsWith(`..${sep}`) || isAbsolute(lexRel)) {
    return { kind: "escaped" };
  }

  /* (2) realpath the PARENT dir and confirm it is inside the root. A symlinked
     intermediate directory is resolved here, so it can't redirect the leaf
     outside root; the leaf component itself is NOT followed. */
  const parent = dirname(lexAbs);
  let parentReal: string;
  try {
    parentReal = await realpath(parent);
  } catch {
    /* Parent doesn't exist → nothing to mutate at that path (and no dir to
       rename into). Report the lexical abs as missing. */
    return { kind: "missing", abs: lexAbs };
  }
  const guard = projectRootGuard(root, parentReal);
  if (!guard.ok) return { kind: "escaped" };

  /* basename of the lexical path (POSIX/OS separators already normalized by
     join → use the OS-sep tail). */
  const base = lexAbs.slice(dirname(lexAbs).length + 1);
  const abs = join(parentReal, base);

  /* (3) lstat the leaf WITHOUT following it. */
  try {
    const info = await lstat(abs);
    return {
      kind: "present",
      abs,
      isSymlink: info.isSymbolicLink(),
      isFile: info.isFile(),
      isDir: info.isDirectory(),
    };
  } catch {
    return { kind: "missing", abs };
  }
}
