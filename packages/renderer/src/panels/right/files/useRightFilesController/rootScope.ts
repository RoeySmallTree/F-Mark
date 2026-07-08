import type { RootScope } from "../../../../api/rootScope.js";

export interface RootSelection {
  path: string | null;
  pathId: string | null;
}

export function resolveSelectedRoot(input: {
  selectedPath: string | null;
  selectedPathId: string | null;
  activePath: string | null;
  activePathId: string | null;
}): RootSelection {
  return {
    path: input.selectedPath ?? input.activePath,
    pathId: input.selectedPathId ?? input.activePathId,
  };
}

export function selectedRootScope(
  selectedPath: string | null,
  selectedPathId: string | null,
): RootScope | undefined {
  if (selectedPathId !== null) return { pathId: selectedPathId };
  if (selectedPath !== null) return { root: selectedPath };
  return undefined;
}

export function loadScopeForSelectedRoot(
  selectedRoot: RootSelection,
): RootScope | null {
  return selectedRootScope(selectedRoot.path, selectedRoot.pathId) ?? null;
}
