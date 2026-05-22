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

export type ModalKey =
  | null
  | "new-session"
  | "settings"
  | "cmdk"
  | "presets"
  | "skills"
  | "log-filter";

/* Popover state — additive to the modal state above. Popovers anchor to a
   DOM element (the caller passes the anchor's bounding rect) so they can
   position themselves relative to it. Only one popover is open at a time. */
export type PopoverKey = null | "log-filter" | "presets" | "skills";

export interface PopoverState {
  key: PopoverKey;
  anchorRect: DOMRect | null;
}

interface State {
  token: string | null;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  participants: Record<string, Participant>;
  currentUserId: string | null;
  events: AnyEventRecord[];
  composeMode: "message" | "named" | "comment";
  commentTarget: { file: string; lines?: [number, number] } | null;
  /* composeDraft — text the compose textarea should adopt when next mounted
     or when this value flips from null to a string. P8 (presets) sets this
     to the chosen preset body; Compose appends or replaces, then clears. */
  composeDraft: string | null;
  leftRail: LeftRailKey;
  rightTab: RightTabKey;
  viewMode: ViewMode;
  activeModal: ModalKey;
  activePopover: PopoverState;
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
  setComposeDraft(draft: string | null): void;
  setLeftRail(v: LeftRailKey): void;
  setRightTab(v: RightTabKey): void;
  setViewMode(v: ViewMode): void;
  openModal(key: ModalKey): void;
  closeModal(): void;
  openPopover(key: PopoverKey, anchorRect: DOMRect | null): void;
  closePopover(): void;
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
  composeDraft: null,
  leftRail: "sessions",
  rightTab: "log",
  viewMode: "everything",
  activeModal: null,
  activePopover: { key: null, anchorRect: null },
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
  setComposeDraft: (composeDraft) => set({ composeDraft }),
  setLeftRail: (leftRail) => set({ leftRail }),
  setRightTab: (rightTab) => set({ rightTab }),
  setViewMode: (viewMode) => set({ viewMode }),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
  openPopover: (key, anchorRect) =>
    set({ activePopover: { key, anchorRect } }),
  closePopover: () =>
    set({ activePopover: { key: null, anchorRect: null } }),
}));
