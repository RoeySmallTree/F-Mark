import type { AnyEventRecord, ManagedAgent, Participant } from "@f-mark/shared";
import type { SessionMeta } from "../../api/client.js";
import { useStore } from "../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  newSession: "new-session",
} as const;

export interface SessionStoreSnapshot {
  activePath: string | null;
  activePathId: string | null;
  currentSessionId: string | null;
  events: AnyEventRecord[];
  lastSeenBySession: Record<string, string>;
  managedAgents: ManagedAgent[];
  openNewSessionModal: () => void;
  participants: Record<string, Participant>;
  sessions: SessionMeta[];
  setCurrentSession: (
    id: string | null,
    root?: { path?: string; path_id?: string } | null,
  ) => void;
  setParticipants: (participants: Record<string, Participant>) => void;
  setSessions: (sessions: SessionMeta[]) => void;
  token: string | null;
}

export function useSessionStoreSnapshot(): SessionStoreSnapshot {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const activePath = useStore((s) => s.selectedPath);
  const activePathId = useStore((s) => s.selectedPathId);
  const participants = useStore((s) => s.participants);
  const managedAgents = useStore((s) => s.managedAgents);
  const events = useStore((s) => s.events);
  const lastSeenBySession = useStore((s) => s.lastSeenBySession);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const openModal = useStore((s) => s.openModal);
  const token = useStore((s) => s.token);

  return {
    activePath,
    activePathId,
    currentSessionId,
    events,
    lastSeenBySession,
    managedAgents,
    openNewSessionModal: () => openModal(NO_LOOSE_STRING_VALUES.newSession),
    participants,
    sessions,
    setCurrentSession,
    setParticipants,
    setSessions,
    token,
  };
}
