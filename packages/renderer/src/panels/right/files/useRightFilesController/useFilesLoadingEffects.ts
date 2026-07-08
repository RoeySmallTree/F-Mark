import { useEffect } from "react";
import type { Client } from "../../../../api/client.js";
import type { RootScope } from "../../../../api/rootScope.js";
import { loadFilesTree } from "../filesTreeLoader.js";
import { loadGitChangedFiles } from "../loadGitChangedFiles.js";
import {
  loadScopeForSelectedRoot,
  type RootSelection,
} from "./rootScope.js";

const NO_LOOSE_STRING_VALUES = {
  project: "project",
  session: "session",
} as const;

export function useFilesTreeLoad(
  client: Pick<Client, "fetchFilesTree" | "gitChangedFiles">,
  selectedRoot: RootSelection,
): void {
  const selectedPath = selectedRoot.path;
  const selectedPathId = selectedRoot.pathId;

  useEffect(() => {
    if (selectedPath === null) return;
    const scope = loadScopeForSelectedRoot({
      path: selectedPath,
      pathId: selectedPathId,
    });
    if (scope === null) return;
    void loadFilesTree(client, selectedPath, { scope });
    void loadGitChangedFiles(client, scope);
  }, [client, selectedPath, selectedPathId]);
}

export function useProjectFavoritesLoad(input: {
  client: Pick<Client, "fetchFilesFavorites">;
  favScope: RootScope | undefined;
  selectedRoot: RootSelection;
  setFilesFavoritesProject(path: string, paths: string[]): void;
}): void {
  const {
    client,
    favScope,
    selectedRoot,
    setFilesFavoritesProject,
  } = input;
  const selectedPath = selectedRoot.path;

  useEffect(() => {
    if (selectedPath === null) return;
    let cancelled = false;
    client
      .fetchFilesFavorites(NO_LOOSE_STRING_VALUES.project, undefined, favScope)
      .then((res) => {
        if (!cancelled) setFilesFavoritesProject(selectedPath, res.paths);
      })
      .catch((err) => {
        if (!cancelled) console.error("fetchFilesFavorites(project) failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    favScope,
    selectedPath,
    setFilesFavoritesProject,
  ]);
}

export function useSessionFavoritesLoad(input: {
  client: Pick<Client, "fetchFilesFavorites">;
  currentSessionId: string | null;
  favScope: RootScope | undefined;
  setFilesFavoritesSession(sessionId: string, paths: string[]): void;
}): void {
  const {
    client,
    currentSessionId,
    favScope,
    setFilesFavoritesSession,
  } = input;

  useEffect(() => {
    if (currentSessionId === null) return;
    let cancelled = false;
    client
      .fetchFilesFavorites(NO_LOOSE_STRING_VALUES.session, currentSessionId, favScope)
      .then((res) => {
        if (!cancelled) {
          setFilesFavoritesSession(currentSessionId, res.paths);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("fetchFilesFavorites(session) failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    currentSessionId,
    favScope,
    setFilesFavoritesSession,
  ]);
}
