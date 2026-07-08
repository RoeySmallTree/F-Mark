import { useCallback, useMemo, useState } from "react";
import type { SessionMeta } from "../../api/client.js";
import {
  buildRepoGroups,
  loadSessionOrderByRepo,
  reorderSessionIds,
  saveSessionOrderByRepo,
  type RepoGroup,
} from "./model.js";

interface UseSessionRepoGroupsInput {
  activePath: string | null;
  allSessions: SessionMeta[];
  query: string;
}

export interface SessionRepoGroupsState {
  moveSessionInRepo: (repoKey: string, fromId: string, toId: string) => void;
  repoGroups: RepoGroup[];
}

export function useSessionRepoGroups(
  input: UseSessionRepoGroupsInput,
): SessionRepoGroupsState {
  const { activePath, allSessions, query } = input;
  const [sessionOrderByRepo, setSessionOrderByRepo] = useState(() =>
    loadSessionOrderByRepo(),
  );
  const repoGroups = useMemo(
    () =>
      buildRepoGroups({
        sessions: allSessions,
        activePath,
        query,
        sessionOrderByRepo,
      }),
    [allSessions, activePath, query, sessionOrderByRepo],
  );

  const moveSessionInRepo = useCallback(
    (repoKey: string, fromId: string, toId: string): void => {
      const repo = repoGroups.find((group) => group.key === repoKey);
      if (repo === undefined) return;
      const currentOrder = repo.sessions.map((session) => session.id);
      const nextOrder = reorderSessionIds(currentOrder, fromId, toId);
      if (nextOrder === null) return;
      const next = { ...sessionOrderByRepo, [repoKey]: nextOrder };
      saveSessionOrderByRepo(next);
      setSessionOrderByRepo(next);
    },
    [repoGroups, sessionOrderByRepo],
  );

  return {
    moveSessionInRepo,
    repoGroups,
  };
}
