import { useEffect } from "react";
import type { Client } from "../../api/client.js";
import { type RootScope } from "../../api/rootScope.js";
import { connectWs } from "../../api/ws.js";
import { loadFilesTree } from "../../panels/right/files/filesTreeLoader.js";
import { loadGitChangedFiles } from "../../panels/right/files/loadGitChangedFiles.js";
import { useStore } from "../../state/store.js";
import type { BusMessage, FilesChangedBusMessage } from "../../types.js";
import { scopeFromPath } from "./sessionState.js";

const NO_LOOSE_STRING_VALUES = {
  eventAdded: "event_added",
  eventSuperseded: "event_superseded",
} as const;

interface ScopedFileTreeSocketInput {
  client: Client;
  token: string | null;
}

interface FileTreeSocketStoreSnapshot {
  activePath: string | null;
  activePathId: string | null;
  currentSessionId: string | null;
}

export function useScopedFileTreeSocket({
  client,
  token,
}: ScopedFileTreeSocketInput): void {
  useEffect(() => {
    const ws = connectWs({ baseUrl: "", token }, (message) => {
      const snapshot = getSocketStoreSnapshot();
      if (!messageMatchesTabPath(message, snapshot.activePathId)) return;

      const scope = scopeFromPath(snapshot.activePath, snapshot.activePathId);
      if (scope === null) return;

      if (message.type === "files.changed") {
        refreshFilesForMessage(message, snapshot.activePath, client, scope);
        return;
      }
      if (
        message.type === NO_LOOSE_STRING_VALUES.eventAdded ||
        message.type === NO_LOOSE_STRING_VALUES.eventSuperseded
      ) {
        refreshEventsForMessage(message, snapshot.currentSessionId, {
          client,
          scope,
        });
      }
    });
    return () => ws.close();
  }, [client, token]);
}

function getSocketStoreSnapshot(): FileTreeSocketStoreSnapshot {
  const store = useStore.getState();
  return {
    activePath: store.activePath,
    activePathId: store.activePathId,
    currentSessionId: store.currentSessionId,
  };
}

function messageMatchesTabPath(
  message: BusMessage,
  tabPathId: string | null,
): boolean {
  if (tabPathId === null) return true;
  return (
    "pathId" in message &&
    message.pathId != null &&
    message.pathId === tabPathId
  );
}

function refreshFilesForMessage(
  message: FilesChangedBusMessage,
  tabRoot: string | null,
  client: Client,
  scope: RootScope,
): void {
  if (tabRoot === null || message.root !== tabRoot) return;
  void loadFilesTree(client, tabRoot, { force: true, scope });
  void loadGitChangedFiles(client, scope);
}

function refreshEventsForMessage(
  message: Extract<BusMessage, { type: "event_added" | "event_superseded" }>,
  sessionId: string | null,
  input: {
    client: Client;
    scope: RootScope;
  },
): void {
  if (sessionId === null || message.session_id !== sessionId) return;
  void (async () => {
    try {
      const fresh = await input.client.listEvents(sessionId, input.scope);
      const next = useStore.getState();
      if (next.currentSessionId !== sessionId) return;
      for (const event of fresh) next.upsertEvent(event);
    } catch {
      /* stale fetch; a later refresh catches up */
    }
  })();
}
