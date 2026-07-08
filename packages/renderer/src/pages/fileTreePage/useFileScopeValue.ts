import { useMemo } from "react";
import type { FileScope } from "../../panels/fileViewer/fileScope.js";
import { fileScopeFromPath } from "./sessionState.js";

export function useFileScopeValue(
  activePath: string | null,
  activePathId: string | null,
): FileScope {
  return useMemo(
    () => fileScopeFromPath(activePath, activePathId),
    [activePath, activePathId],
  );
}
