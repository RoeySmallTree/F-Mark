import { useCallback } from "react";
import { createClient } from "../../api/client.js";
import type { SessionMeta } from "../../api/client.js";
import { rootScopeForSession } from "../../api/rootScope.js";
import type { SessionActionBaseInput } from "./actionTypes.js";
import {
  findSessionInSameRoot,
  removeSessionFromList,
} from "./model.js";

interface UseSessionDeleteInput extends SessionActionBaseInput {
  activePathId: string | null;
  allSessions: SessionMeta[];
}

function confirmDelete(session: SessionMeta): boolean {
  return window.confirm(
    `Delete session "${session.slug}" from F-Mark? Project files are not deleted.`,
  );
}

function syncCurrentSessionAfterDelete(
  input: UseSessionDeleteInput,
  remaining: SessionMeta[],
  session: SessionMeta,
): void {
  if (session.id !== input.currentSessionId) return;
  const next = findSessionInSameRoot(remaining, session, input.activePath);
  input.setCurrentSession(next?.id ?? null, next);
}

async function refreshAfterDelete(
  input: UseSessionDeleteInput,
  session: SessionMeta,
): Promise<void> {
  if (session.path !== undefined && session.path !== input.activePath) return;
  await input.refreshSelectedRootSessions(session);
}

async function runDeleteSession(
  input: UseSessionDeleteInput,
  session: SessionMeta,
): Promise<void> {
  input.closeContextMenu();
  if (!confirmDelete(session)) return;
  const client = createClient({ baseUrl: "", token: input.token });
  try {
    const scope = rootScopeForSession(
      session,
      input.activePathId,
      input.activePath,
    );
    await client.deleteSession(session.id, scope ?? session.path);
    const remaining = removeSessionFromList(
      input.allSessions,
      session,
      input.activePath,
    );
    input.setAllSessions(remaining);
    syncCurrentSessionAfterDelete(input, remaining, session);
    await refreshAfterDelete(input, session);
  } catch (e) {
    input.setError(e instanceof Error ? e.message : String(e));
  }
}

export function useSessionDelete(
  input: UseSessionDeleteInput,
): (session: SessionMeta) => Promise<void> {
  return useCallback(
    (session: SessionMeta): Promise<void> => runDeleteSession(input, session),
    [
      input,
    ],
  );
}
