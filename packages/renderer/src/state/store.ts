import { create } from "zustand";
import type {
  AnyEventRecord,
  ManagedAgentWsMessage,
  Participant,
} from "@f-mark/shared";
import type { SessionMeta } from "../api/client.js";
import {
  DEFAULT_FILTER,
  type LogFilter,
} from "../popovers/log-filter-types.js";
import type { CustomPreset } from "../popovers/customPresets.js";
import { createPresenceSlice, type PresenceSlice } from "./presence.js";

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
  | "log-filter"
  | "preset-editor";

/* Popover state — additive to the modal state above. Popovers anchor to a
   DOM element (the caller passes the anchor's bounding rect) so they can
   position themselves relative to it. Only one popover is open at a time. */
export type PopoverKey = null | "log-filter" | "presets" | "skills";

export interface PopoverState {
  key: PopoverKey;
  anchorRect: DOMRect | null;
}

/* Per-session view-mode persistence — when switching sessions, restore the
   previous view for that session if it was ever set. Backed by localStorage
   under `fmark.viewModeBySession`. */
export const VIEW_MODE_STORAGE_KEY = "fmark.viewModeBySession";

const VIEW_MODES: ViewMode[] = ["everything", "document", "conversation"];

function isViewMode(v: unknown): v is ViewMode {
  return typeof v === "string" && (VIEW_MODES as string[]).includes(v);
}

export function loadViewModeBySession(): Record<string, ViewMode> {
  try {
    const raw = globalThis.localStorage?.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, ViewMode> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isViewMode(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveViewModeBySession(map: Record<string, ViewMode>): void {
  try {
    globalThis.localStorage?.setItem(
      VIEW_MODE_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* swallow — running in an env without localStorage */
  }
}

interface State extends PresenceSlice {
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
  viewModeBySession: Record<string, ViewMode>;
  activeModal: ModalKey;
  /* When `activeModal === 'preset-editor'`, this holds the preset being
     edited. `null` means "create new". The popover sets this before
     opening the editor. */
  editingPreset: CustomPreset | null;
  /* Bumped whenever the custom-preset list changes so listeners (the
     popover) can re-read localStorage and re-render. */
  customPresetsVersion: number;
  activePopover: PopoverState;
  /* Activity-log filter. Lifted into the store (was previously local to
     RightLog) so applied filters survive a Right-panel tab switch — RightLog
     unmounts when the user switches to Todos/Comments/Named, and local state
     would otherwise reset to DEFAULT_FILTER on remount. */
  logFilter: LogFilter;
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
  openPresetEditor(preset: CustomPreset | null): void;
  bumpCustomPresets(): void;
  openPopover(key: PopoverKey, anchorRect: DOMRect | null): void;
  closePopover(): void;
  setLogFilter(filter: LogFilter): void;
  /* Routes a typed managed-agent / presence / env-probe WS message into the
     presence slice. Other message types (e.g. event_added) are handled by
     the existing flow in App.tsx and must be dispatched separately. */
  dispatchManagedAgentWsMessage(msg: ManagedAgentWsMessage): void;
}

export const useStore = create<State>((set, get) => ({
  ...createPresenceSlice<State>(set),
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
  viewModeBySession: loadViewModeBySession(),
  activeModal: null,
  editingPreset: null,
  customPresetsVersion: 0,
  activePopover: { key: null, anchorRect: null },
  logFilter: DEFAULT_FILTER,
  setToken: (token) => set({ token }),
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (currentSessionId) => {
    /* Preserve P4's behaviour (clear events on session switch) while
       restoring the per-session view mode if one was previously stored. */
    const state = get();
    const nextMode: ViewMode =
      currentSessionId !== null
        ? (state.viewModeBySession[currentSessionId] ?? "everything")
        : "everything";
    set({
      currentSessionId,
      events: [],
      viewMode: nextMode,
    });
  },
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
  setViewMode: (viewMode) => {
    const state = get();
    /* Mirror the chosen mode into the per-session map (if we have an
       active session) and persist the map. */
    if (state.currentSessionId !== null) {
      const next = {
        ...state.viewModeBySession,
        [state.currentSessionId]: viewMode,
      };
      saveViewModeBySession(next);
      set({ viewMode, viewModeBySession: next });
    } else {
      set({ viewMode });
    }
  },
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null, editingPreset: null }),
  openPresetEditor: (editingPreset) =>
    set({ activeModal: "preset-editor", editingPreset }),
  bumpCustomPresets: () =>
    set((s) => ({ customPresetsVersion: s.customPresetsVersion + 1 })),
  openPopover: (key, anchorRect) =>
    set({ activePopover: { key, anchorRect } }),
  closePopover: () =>
    set({ activePopover: { key: null, anchorRect: null } }),
  setLogFilter: (logFilter) => set({ logFilter }),
  dispatchManagedAgentWsMessage: (msg) => {
    const s = get();
    if (msg.type === "presence") {
      s.setPresence(msg.participant_id, {
        state: msg.state,
        last_hook_at: msg.last_hook_at,
      });
    } else if (msg.type === "managed-agent.spawned") {
      s.addManagedAgent({
        participant_id: msg.participant_id,
        tmux_session: msg.tmux_session,
        runtime_id: msg.runtime_id,
      });
    } else if (msg.type === "managed-agent.killed") {
      s.removeManagedAgent(msg.participant_id);
      s.removePresence(msg.participant_id);
    } else if (msg.type === "managed-agent.terminal-spawned") {
      s.addManagedTerminal({
        tmux_session: msg.tmux_session,
        label: msg.label,
      });
    } else if (msg.type === "env-probe.updated") {
      s.setEnvProbe(msg.result);
    }
  },
}));
