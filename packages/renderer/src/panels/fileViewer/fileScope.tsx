import { createContext, useContext, type ReactNode } from "react";
import { toRootRelative, type RootScope } from "../../api/rootScope.js";
import { useStore } from "../../state/store.js";

/* The file viewer + its renderers work in ABSOLUTE paths as UI identifiers,
   but every server file-read call needs a required root scope (X4b) plus the
   absolute root to convert the open file to a root-relative `rel_path`.

   This context carries both:
     - `root`  — the absolute project root the open file lives under,
     - `scope` — the wire scope ({pathId} | {root}) sent to the server.

   The main app derives both from the active project; the standalone
   /file-tree tab provides its own via <FileScopeProvider>. */
export interface FileScope {
  root: string | null;
  scope: RootScope | null;
}

const FileScopeContext = createContext<FileScope | null>(null);

export function FileScopeProvider({
  value,
  children,
}: {
  value: FileScope;
  children: ReactNode;
}): JSX.Element {
  return (
    <FileScopeContext.Provider value={value}>
      {children}
    </FileScopeContext.Provider>
  );
}

/* Resolve the active file scope. When an explicit provider is present (the
   standalone tab) it wins; otherwise follow the selected session/root first
   and fall back to the kernel active project. */
export function useFileScope(): FileScope {
  const ctx = useContext(FileScopeContext);
  const rootPath = useStore((s) => s.selectedPath ?? s.activePath);
  const rootPathId = useStore((s) => s.selectedPathId ?? s.activePathId);
  if (ctx !== null) return ctx;
  return {
    root: rootPath,
    scope:
      rootPathId !== null
        ? { pathId: rootPathId }
        : rootPath !== null
          ? { root: rootPath }
          : null,
  };
}

/* Resolve the wire scope + root-relative path for an absolute viewer path.
   Returns null when no root scope is known or the path escapes the root —
   the caller should refuse the file read rather than leak an out-of-root
   absolute path to the server. */
export function useScopedFile(
  absPath: string,
): { scope: RootScope; relPath: string } | null {
  const { root, scope } = useFileScope();
  if (scope === null || root === null) return null;
  const relPath = toRootRelative(root, absPath);
  if (relPath === null) return null;
  return { scope, relPath };
}
