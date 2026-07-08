import { rootScopeForSession } from "../../api/rootScope.js";
import type { Client } from "../../api/client.js";
import {
  chooseFocusedSessionForPath,
  clearPersistedLastFocusedSession,
} from "../../state/store.js";
import type { State } from "../../state/storeTypes.js";
import {
  resolveTargetPathId,
  sessionsForPath,
} from "./pathModel.js";

type PathSwitchClient = Pick<
  Client,
  "registerKnownPath" | "listAllSessions" | "listParticipants"
>;

export interface PathSwitchActions {
  setCurrentSession: State["setCurrentSession"];
  setParticipants: State["setParticipants"];
  setPathsState: State["setPathsState"];
  setSelectedRoot: State["setSelectedRoot"];
  setSessions: State["setSessions"];
}

export interface PathSwitchDependencies extends PathSwitchActions {
  client: PathSwitchClient;
}

export async function switchPathSelection(
  target: string,
  deps: PathSwitchDependencies,
): Promise<void> {
  const nextPathsState = await deps.client.registerKnownPath(target);
  deps.setPathsState(nextPathsState);

  const targetPathId = resolveTargetPathId(nextPathsState, target);
  deps.setSelectedRoot(target, targetPathId);

  const allSessions = await deps.client.listAllSessions();
  const sessions = sessionsForPath(allSessions, targetPathId, target);
  deps.setSessions(sessions);

  const choice = chooseFocusedSessionForPath(
    sessions,
    targetPathId,
    target,
    null,
    false,
  );
  if (choice.savedSessionMissing) {
    clearPersistedLastFocusedSession(targetPathId, target);
  }

  const session = sessions.find((item) => item.id === choice.sessionId) ?? null;
  if (session === null) {
    deps.setCurrentSession(null);
    deps.setSelectedRoot(target, targetPathId);
    deps.setParticipants({});
    return;
  }

  deps.setCurrentSession(choice.sessionId, session);
  const scope = rootScopeForSession(session, targetPathId, target);
  deps.setParticipants(await deps.client.listParticipants(scope ?? undefined));
}
