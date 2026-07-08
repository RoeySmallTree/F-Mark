/* Renderer-side root scope (expansion-decisions.md X2 / X4b).

   Every file read and every scoped event read/write must carry a required
   root scope — either a `pathId` (the canonical-root fingerprint) or an
   absolute `root` path. There is no active-root fallback on the wire. The
   main app derives the scope from the active project; the standalone
   /file-tree tab derives it from its selected root. */
export type RootScope = { pathId: string } | { root: string };

/** Serialize a RootScope into URLSearchParams query keys (path_id / root). */
export function appendScopeQuery(qs: URLSearchParams, scope: RootScope): void {
  if ("pathId" in scope) {
    qs.set("path_id", scope.pathId);
  } else {
    qs.set("root", scope.root);
  }
}

/** Body fragment for a scoped POST: `{ path_id }` or `{ root }`. */
export function scopeToBody(scope: RootScope): { path_id: string } | { root: string } {
  return "pathId" in scope ? { path_id: scope.pathId } : { root: scope.root };
}

/* Minimal session shape needed to derive a root scope. */
interface ScopableSession {
  path?: string;
  path_id?: string;
}

/** Derive the required root scope for a session's events/wake (X2). Prefers
    the session's path_id, then its absolute root, then the active project's
    pathId/root. Returns null when no root is known. */
export function rootScopeForSession(
  session: ScopableSession | undefined,
  activePathId: string | null,
  activePath: string | null,
): RootScope | null {
  if (session?.path_id !== undefined && session.path_id.length > 0) {
    return { pathId: session.path_id };
  }
  if (session?.path !== undefined && session.path.length > 0) {
    return { root: session.path };
  }
  if (activePathId !== null) return { pathId: activePathId };
  if (activePath !== null) return { root: activePath };
  return null;
}

/** Stable string for effect deps — avoids refetch loops when `sessions` is
    replaced with a fresh array but the scoped root is unchanged. */
export function rootScopeKey(scope: RootScope | null): string {
  if (scope === null) return "";
  return "pathId" in scope ? `path_id:${scope.pathId}` : `root:${scope.root}`;
}

/** Normalize a filesystem path: strip trailing slashes, collapse `\` → `/`
    for the comparison only (the server canonicalizes for real). */
function normalizeForCompare(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** True when a forward-slash path is absolute or carries a Windows drive/UNC
    prefix (`C:/…`, `//host/…`). Such a path can never be a safe *relative*
    path under a root. */
function isAbsoluteOrDriveLike(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:/.test(p);
}

/* Collapse `.`/`..` segments of a forward-slash relative path WITHOUT touching
   the filesystem (no symlink resolution — purely lexical, matching how the
   server canonicalizes the *literal* path). Returns null when the result would
   escape the root, i.e. a leading `..` survives normalization, or when the
   input is absolute/drive-prefixed. An empty string (the root itself) is
   returned as "". */
function normalizeRelSegments(rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/");
  if (cleaned.length === 0) return "";
  /* An absolute/drive-prefixed "relative" path is never in-root. */
  if (isAbsoluteOrDriveLike(cleaned)) return null;
  const out: string[] = [];
  for (const seg of cleaned.split("/")) {
    if (seg.length === 0 || seg === ".") continue;
    if (seg === "..") {
      /* Can't pop above the root → traversal. */
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}

/* Convert an ABSOLUTE viewer path to a root-relative path under `root`.
   The tree/viewer/tabs keep absolute paths as UI identifiers, but every
   server file-read call must send a root-relative `rel_path`. Segment-aware:
   strips the root prefix, then normalizes `.`/`..` lexically (no symlink
   follow). Returns null when `absPath` is not inside `root` OR when the
   normalized remainder escapes the root via `..` (caller should refuse the
   read rather than leak an out-of-root path). */
export function toRootRelative(root: string, absPath: string): string | null {
  const r = normalizeForCompare(root);
  const a = normalizeForCompare(absPath);
  if (a === r) return "";
  const prefix = r.endsWith("/") ? r : r + "/";
  if (!a.startsWith(prefix)) return null;
  /* Re-validate the remainder: `/project/../secret` slices to `../secret`,
     which `normalizeRelSegments` rejects (leading `..`). */
  return normalizeRelSegments(a.slice(prefix.length));
}

export { normalizeRelSegments };
