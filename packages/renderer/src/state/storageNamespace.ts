/* ── localStorage namespacing (expansion-decisions.md X6 / P3) ────────────
   The standalone /file-tree tab reuses store-backed components (RightFiles,
   FileViewer) but MUST NOT clobber the main app's shared localStorage keys
   (fileViewerTabsBySession, lastSeenBySession, etc.). The standalone tab sets
   a namespace so every persisted key is prefixed into an isolated namespace.
   The main app leaves the namespace empty and keeps writing the original keys.

   CRITICAL: this state lives in its OWN module (not store.ts) so the bootstrap
   can set the namespace BEFORE the store module is first imported. store.ts
   computes its initial state at module-eval time via lazy loaders that read
   localStorage through nsKey(); if the namespace were set after that eval (as
   it was when setStorageNamespace lived in store.ts and FileTreePage imported
   useStore + called it), the initial reads would use the default namespace and
   the isolation would be too late. Keeping the namespace here means main.tsx
   can `import { setStorageNamespace }` and set it without pulling in the store.

   The standalone namespace also folds in the launch `path_id` so equal session
   ids across different roots persist under different prefixes — i.e. the keyed
   maps (selected session, open tabs, active file, diff state, focused file)
   are effectively keyed by (path_id, sessionId). */
let storageNamespace = "";

export function setStorageNamespace(ns: string): void {
  storageNamespace = ns.length > 0 ? `${ns}.` : "";
}

export function getStorageNamespace(): string {
  return storageNamespace;
}

export function nsKey(key: string): string {
  return `${storageNamespace}${key}`;
}

/** Build the standalone /file-tree namespace, folding in the path_id so the
    session-keyed persistence cannot collide across roots that share a session
    id. When path_id is unknown we still produce an ISOLATED sub-namespace
    (`…v1._nopath`) rather than the bare prefix — a bare prefix would be shared
    by every root that happens to launch without a path_id, reintroducing the
    cross-root collision the path_id keying exists to prevent. */
export function fileTreeNamespace(pathId: string | null | undefined): string {
  const base = "fmark.fileTreePage.v1";
  return pathId !== null && pathId !== undefined && pathId.length > 0
    ? `${base}.${pathId}`
    : `${base}._nopath`;
}
