import { create } from "zustand";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import type { SessionMeta } from "../api/client.js";

export type LeftRailKey =
  | "sessions"
  | "named"
  | "todos"
  | "comments"
  | "search";
export type RightTabKey = "todos" | "comments" | "named" | "log";
export type ViewMode = "everything" | "document" | "conversation";

interface State {
  token: string | null;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  participants: Record<string, Participant>;
  currentUserId: string | null;
  events: AnyEventRecord[];
  composeMode: "message" | "named" | "comment";
  commentTarget: { file: string; lines?: [number, number] } | null;
  leftRail: LeftRailKey;
  rightTab: RightTabKey;
  viewMode: ViewMode;
  setToken(token: string | null): void;
  setSessions(s: SessionMeta[]): void;
  setCurrentSession(id: string | null): void;
  setParticipants(p: Record<string, Participant>): void;
  setCurrentUserId(id: string | null): void;
  setEvents(events: AnyEventRecord[]): void;
  upsertEvent(event: AnyEventRecord): void;
  setComposeMode(mode: "message" | "named" | "comment"): void;
  setCommentTarget(
    target: { file: string; lines?: [number, number] } | null,
  ): void;
  setLeftRail(v: LeftRailKey): void;
  setRightTab(v: RightTabKey): void;
  setViewMode(v: ViewMode): void;
}

export const useStore = create<State>((set) => ({
  token: null,
  sessions: [],
  currentSessionId: null,
  participants: {},
  currentUserId: null,
  events: [],
  composeMode: "message",
  commentTarget: null,
  leftRail: "sessions",
  rightTab: "log",
  viewMode: "everything",
  setToken: (token) => set({ token }),
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (currentSessionId) =>
    set({ currentSessionId, events: [] }),
  setParticipants: (participants) => {
    const userId = Object.entries(participants).find(
      ([, p]) => p.kind === "user",
    )?.[0];
    set({ participants, currentUserId: userId ?? null });
  },
  setCurrentUserId: (currentUserId) => set({ currentUserId }),
  setEvents: (events) => set({ events }),
  upsertEvent: (event) =>
    set((s) => {
      if (s.events.find((e) => e.filename === event.filename)) return s;
      const next = [...s.events, event].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      );
      return { events: next };
    }),
  setComposeMode: (composeMode) => set({ composeMode }),
  setCommentTarget: (commentTarget) =>
    set({
      commentTarget,
      composeMode: commentTarget !== null ? "comment" : "message",
    }),
  setLeftRail: (leftRail) => set({ leftRail }),
  setRightTab: (rightTab) => set({ rightTab }),
  setViewMode: (viewMode) => set({ viewMode }),
}));
