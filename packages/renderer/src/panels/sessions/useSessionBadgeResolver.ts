import { useCallback } from "react";
import type { AnyEventRecord, ManagedAgent, Participant } from "@f-mark/shared";
import type { SessionMeta } from "../../api/client.js";
import type { SessionBadge } from "../../lib/sessionBadge.js";
import { resolveSessionBadge } from "./badges.js";

interface UseSessionBadgeResolverInput {
  activePath: string | null;
  currentSessionId: string | null;
  events: AnyEventRecord[];
  lastSeenBySession: Record<string, string>;
  managedAgents: ManagedAgent[];
  participants: Record<string, Participant>;
}

export function useSessionBadgeResolver(
  input: UseSessionBadgeResolverInput,
): (session: SessionMeta) => SessionBadge {
  const {
    activePath,
    currentSessionId,
    events,
    lastSeenBySession,
    managedAgents,
    participants,
  } = input;

  return useCallback(
    (session: SessionMeta): SessionBadge =>
      resolveSessionBadge(session, {
        activePath,
        currentSessionId,
        events,
        lastSeenBySession,
        managedAgents,
        participants,
      }),
    [
      activePath,
      currentSessionId,
      events,
      lastSeenBySession,
      managedAgents,
      participants,
    ],
  );
}
