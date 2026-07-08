import { useEffect, useMemo } from "react";
import { createClient } from "../api/client.js";
import { loadFilesTree } from "../panels/right/files/filesTreeLoader.js";
import { loadGitChangedFiles } from "../panels/right/files/loadGitChangedFiles.js";
import {
  loadScopeForSelectedRoot,
  resolveSelectedRoot,
} from "../panels/right/files/useRightFilesController/rootScope.js";
import { useStore } from "../state/store.js";

export function useFilesTreePreload(token: string | null): void {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const eventsLoadingSessionId = useStore((s) => s.eventsLoadingSessionId);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);
  const selectedPath = useStore((s) => s.selectedPath);
  const selectedPathId = useStore((s) => s.selectedPathId);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  useEffect(() => {
    if (currentSessionId === null) return;
    if (eventsLoadingSessionId === currentSessionId) return;
    const selectedRoot = resolveSelectedRoot({
      selectedPath,
      selectedPathId,
      activePath,
      activePathId,
    });
    if (selectedRoot.path === null) return;
    const scope = loadScopeForSelectedRoot(selectedRoot);
    if (scope === null) return;
    void loadFilesTree(client, selectedRoot.path, { scope });
    void loadGitChangedFiles(client, scope);
  }, [
    activePath,
    activePathId,
    client,
    currentSessionId,
    eventsLoadingSessionId,
    selectedPath,
    selectedPathId,
  ]);
}
