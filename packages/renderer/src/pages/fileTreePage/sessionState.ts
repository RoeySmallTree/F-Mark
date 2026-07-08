import type { SessionMeta } from "@f-mark/shared";
import type { Client } from "../../api/client.js";
import { rootScopeForSession, type RootScope } from "../../api/rootScope.js";
import type { FileScope } from "../../panels/fileViewer/fileScope.js";
import { loadFilesTree } from "../../panels/right/files/filesTreeLoader.js";
import { loadGitChangedFiles } from "../../panels/right/files/loadGitChangedFiles.js";
import {
  fileTreeNamespace,
  getStorageNamespace,
  setStorageNamespace,
} from "../../state/storageNamespace.js";
import { useStore } from "../../state/store.js";
import type { State } from "../../state/storeTypes.js";

export function applyNamespaceForSession(
  session: SessionMeta,
  rehydrateNamespacedSlices: State["rehydrateNamespacedSlices"],
): void {
  const nextNs = fileTreeNamespace(session.path_id ?? null);
  const nextNsPrefixed = nextNs.length > 0 ? `${nextNs}.` : "";
  if (getStorageNamespace() === nextNsPrefixed) return;
  setStorageNamespace(nextNs);
  rehydrateNamespacedSlices();
}

export function fileScopeFromPath(
  activePath: string | null,
  activePathId: string | null,
): FileScope {
  return {
    root: activePath,
    scope: scopeFromPath(activePath, activePathId),
  };
}

export function scopeFromPath(
  activePath: string | null,
  activePathId: string | null,
): RootScope | null {
  if (activePathId !== null) return { pathId: activePathId };
  if (activePath !== null) return { root: activePath };
  return null;
}

export interface SeedSessionInput {
  client: Client;
  session: SessionMeta;
  setPathsState: State["setPathsState"];
  setSessions: State["setSessions"];
  setCurrentSession: State["setCurrentSession"];
  setEvents: State["setEvents"];
}

/* Seed the store for a resolved session without flipping the kernel's active
   path. The in-memory store is per-tab, so this only re-scopes this tab. */
export function seedSession(input: SeedSessionInput): void {
  const {
    client,
    session,
    setPathsState,
    setSessions,
    setCurrentSession,
    setEvents,
  } = input;

  setPathsState({
    activePath: session.path ?? null,
    activePathId: session.path_id ?? null,
    activeRevision: 0,
    knownPaths: session.path !== undefined ? [session.path] : [],
    favorites: [],
  });
  setSessions([session]);
  setCurrentSession(session.id);
  setEvents([]);

  const scope = rootScopeForSession(session, null, session.path ?? null);
  if (session.path !== undefined && scope !== null) {
    void loadFilesTree(client, session.path, { scope });
    void loadGitChangedFiles(client, scope);
  }
  if (scope !== null) {
    loadSessionEvents(client, session.id, scope, setEvents);
  }
}

function loadSessionEvents(
  client: Client,
  sessionId: string,
  scope: RootScope,
  setEvents: State["setEvents"],
): void {
  void (async () => {
    try {
      const events = await client.listEvents(sessionId, scope);
      if (useStore.getState().currentSessionId === sessionId) {
        setEvents(events);
      }
    } catch {
      /* A failed fetch leaves events empty; the WS refresh or a later switch
         repopulates. */
    }
  })();
}
