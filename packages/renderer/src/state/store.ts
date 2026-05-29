import { create } from "zustand";
import type {
  AnyEventRecord,
  ManagedAgentWsMessage,
  Participant,
} from "@f-mark/shared";
import type {
  FilesTreeResponse,
  PathFavorite,
  SessionMeta,
} from "../api/client.js";
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
export type RightTabKey =
  | "todos"
  | "comments"
  | "named"
  | "agents"
  | "log"
  | "files";
/* The right pane can also show the Layout settings tab. That key is
   intentionally NOT in RightTabKey so it stays out of persistence /
   reorder configs — only `rightTab` and `setRightTab` accept it. */
export type RightPanelView = RightTabKey | "layout";

/* Per-tab config used by the Layout settings tab. The order of the array
   IS the order of buttons in the right-tab strip. Layout itself is never
   in this array — it's rendered separately at the end of the strip. */
export interface RightTabConfigEntry {
  key: RightTabKey;
  enabled: boolean;
}
export type RightTabConfig = ReadonlyArray<RightTabConfigEntry>;

export interface FilesSearchState {
  q: string;
  whole: boolean;
  regex: boolean;
  caseSensitive: boolean;
  exts: string[];
}

export const DEFAULT_FILES_SEARCH: FilesSearchState = {
  q: "",
  whole: false,
  regex: false,
  caseSensitive: false,
  exts: [],
};
export type ViewMode = "everything" | "document" | "conversation";
export type SettingsSectionKey =
  | "profile"
  | "agents"
  | "runtimes"
  | "hooks"
  | "appearance"
  | "shortcuts"
  | "about";

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
export type PopoverKey = null | "log-filter" | "presets" | "skills" | "compose-settings";

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

/* Per-session read-position persistence — tracks the highest-timestamp
   event filename the user has actually seen (had in viewport) in each
   session. Used by the Feed to (a) restore scroll on session return and
   (b) compute an "X unread" floater for items beyond the last-seen point. */
export const LAST_SEEN_STORAGE_KEY = "fmark.lastSeenBySession";

export function loadLastSeenBySession(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_SEEN_STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveLastSeenBySession(map: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(
      LAST_SEEN_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* swallow — running in an env without localStorage */
  }
}

/* Per-session pane state — width of the left/right panels, which right tab is
   selected, and scroll position of the right panel. Each lives in its own
   localStorage key and follows the same load/save shape as the maps above.
   Width bounds (MIN/MAX) are enforced at write time in the resize hook; load
   helpers clamp defensively in case storage was hand-edited or corrupted. */
export const LEFT_PANEL_WIDTH_STORAGE_KEY = "fmark.leftPanelWidthBySession";
export const RIGHT_PANEL_WIDTH_STORAGE_KEY = "fmark.rightPanelWidthBySession";
export const RIGHT_TAB_STORAGE_KEY = "fmark.rightTabBySession";
export const RIGHT_SCROLL_STORAGE_KEY = "fmark.rightScrollBySession";

export const PANE_MIN_WIDTH = 200;
export const PANE_MAX_WIDTH = 600;
export const LEFT_PANEL_DEFAULT_WIDTH = 288;
export const RIGHT_PANEL_DEFAULT_WIDTH = 340;

function loadNumberMap(key: string): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveNumberMap(key: string, map: Record<string, number>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(map));
  } catch {
    /* swallow */
  }
}

const RIGHT_TAB_KEYS: RightTabKey[] = [
  "todos",
  "comments",
  "named",
  "agents",
  "log",
  "files",
];
function isRightTabKey(v: unknown): v is RightTabKey {
  return typeof v === "string" && (RIGHT_TAB_KEYS as string[]).includes(v);
}

export function loadRightTabBySession(): Record<string, RightTabKey> {
  try {
    const raw = globalThis.localStorage?.getItem(RIGHT_TAB_STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, RightTabKey> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRightTabKey(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveRightTabBySession(map: Record<string, RightTabKey>): void {
  try {
    globalThis.localStorage?.setItem(RIGHT_TAB_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* swallow */
  }
}

export const loadLeftPanelWidthBySession = (): Record<string, number> =>
  loadNumberMap(LEFT_PANEL_WIDTH_STORAGE_KEY);
export const loadRightPanelWidthBySession = (): Record<string, number> =>
  loadNumberMap(RIGHT_PANEL_WIDTH_STORAGE_KEY);
export const loadRightScrollBySession = (): Record<string, number> =>
  loadNumberMap(RIGHT_SCROLL_STORAGE_KEY);

/* Right-tab layout (order + enabled) persistence. Two localStorage keys:
   one for the global default and one for per-session overrides. Resolution
   prefers the per-session override when one exists for the current session. */
export const RIGHT_TABS_CONFIG_STORAGE_KEY = "fmark.rightTabsConfig";
export const RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY =
  "fmark.rightTabsConfigBySession";

export const DEFAULT_RIGHT_TABS_CONFIG: RightTabConfig = [
  { key: "todos", enabled: true },
  { key: "comments", enabled: true },
  { key: "named", enabled: true },
  { key: "agents", enabled: true },
  { key: "log", enabled: true },
  { key: "files", enabled: true },
];

/* Reconcile a stored config against the current set of known tab keys:
   - drop entries with unknown keys (e.g. tab removed in a future release),
   - dedupe by key (keep first occurrence),
   - append any missing keys at the end as enabled (so a newly-added tab is
     immediately visible for existing users).
   Returns a fresh array; never mutates the input. */
function reconcileRightTabsConfig(input: unknown): RightTabConfig {
  if (!Array.isArray(input)) return DEFAULT_RIGHT_TABS_CONFIG;
  const seen = new Set<RightTabKey>();
  const out: RightTabConfigEntry[] = [];
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") continue;
    const k = (raw as { key?: unknown }).key;
    const e = (raw as { enabled?: unknown }).enabled;
    if (!isRightTabKey(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, enabled: e !== false });
  }
  for (const def of DEFAULT_RIGHT_TABS_CONFIG) {
    if (!seen.has(def.key)) out.push({ key: def.key, enabled: true });
  }
  return out;
}

export function loadRightTabsConfig(): RightTabConfig {
  try {
    const raw = globalThis.localStorage?.getItem(RIGHT_TABS_CONFIG_STORAGE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_RIGHT_TABS_CONFIG;
    return reconcileRightTabsConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_RIGHT_TABS_CONFIG;
  }
}

function saveRightTabsConfig(cfg: RightTabConfig): void {
  try {
    globalThis.localStorage?.setItem(
      RIGHT_TABS_CONFIG_STORAGE_KEY,
      JSON.stringify(cfg),
    );
  } catch {
    /* swallow */
  }
}

export function loadRightTabsConfigBySession(): Record<string, RightTabConfig> {
  try {
    const raw = globalThis.localStorage?.getItem(
      RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY,
    );
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, RightTabConfig> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = reconcileRightTabsConfig(v);
    }
    return out;
  } catch {
    return {};
  }
}

function saveRightTabsConfigBySession(
  map: Record<string, RightTabConfig>,
): void {
  try {
    globalThis.localStorage?.setItem(
      RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* swallow */
  }
}

/* Pick the effective config for the current session: per-session override
   when one exists, otherwise the global config. */
export function resolveRightTabsConfig(
  global: RightTabConfig,
  bySession: Record<string, RightTabConfig>,
  sid: string | null,
): RightTabConfig {
  if (sid !== null) {
    const override = bySession[sid];
    if (override !== undefined) return override;
  }
  return global;
}

/* Move `fromKey` so it sits at the position currently occupied by `toKey`.
   No-op when from === to or either key is absent. Pure. */
export function reorderRightTabsConfig(
  cfg: RightTabConfig,
  fromKey: RightTabKey,
  toKey: RightTabKey,
): RightTabConfig {
  if (fromKey === toKey) return cfg;
  const fromIdx = cfg.findIndex((e) => e.key === fromKey);
  const toIdx = cfg.findIndex((e) => e.key === toKey);
  if (fromIdx < 0 || toIdx < 0) return cfg;
  const next = cfg.slice();
  const [moved] = next.splice(fromIdx, 1);
  if (moved === undefined) return cfg;
  next.splice(toIdx, 0, moved);
  return next;
}

/* Toggle the enabled flag for `key`. Refuses to toggle the last enabled
   entry off so the strip is never empty. */
export function toggleRightTabsConfig(
  cfg: RightTabConfig,
  key: RightTabKey,
): RightTabConfig {
  const idx = cfg.findIndex((e) => e.key === key);
  if (idx < 0) return cfg;
  const current = cfg[idx]!;
  if (current.enabled) {
    const enabledCount = cfg.reduce((n, e) => (e.enabled ? n + 1 : n), 0);
    if (enabledCount <= 1) return cfg;
  }
  const next = cfg.slice();
  next[idx] = { key: current.key, enabled: !current.enabled };
  return next;
}

/* True when `key` is the sole enabled entry — used by the Layout UI to
   disable that row's checkbox. */
export function isOnlyEnabledRightTab(
  cfg: RightTabConfig,
  key: RightTabKey,
): boolean {
  let enabledCount = 0;
  let target: RightTabConfigEntry | undefined;
  for (const e of cfg) {
    if (e.enabled) enabledCount++;
    if (e.key === key) target = e;
  }
  return target?.enabled === true && enabledCount === 1;
}

interface State extends PresenceSlice {
  token: string | null;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  participants: Record<string, Participant>;
  currentUserId: string | null;
  events: AnyEventRecord[];
  /* Multi-path state. activePath null → renderer shows the empty
     "pick a folder to begin" affordance. activeRevision is a monotonic
     counter mirrored from the kernel's state.json — used to discard
     stale WS messages once the WS envelope lands. */
  activePath: string | null;
  activePathId: string | null;
  activeRevision: number;
  knownPaths: string[];
  favorites: PathFavorite[];
  composeMode: "message" | "named" | "comment";
  commentTarget: { file: string; lines?: [number, number] } | null;
  /* composeDraft — text the compose textarea should adopt when next mounted
     or when this value flips from null to a string. P8 (presets) sets this
     to the chosen preset body; Compose appends or replaces, then clears. */
  composeDraft: string | null;
  leftRail: LeftRailKey;
  rightTab: RightPanelView;
  /* Global tab ordering + visibility. Per-session overrides live in
     rightTabsConfigBySession; resolveRightTabsConfig picks one. */
  rightTabsConfig: RightTabConfig;
  rightTabsConfigBySession: Record<string, RightTabConfig>;
  viewMode: ViewMode;
  viewModeBySession: Record<string, ViewMode>;
  /* Map sessionId → highest filename the user has scrolled past. Used by
     the Feed's read-position restore + "X unread" floater. */
  lastSeenBySession: Record<string, string>;
  /* Follow mode — when on, new feed items scroll their top into the
     viewport. In-memory only (no persistence); driven by user scroll
     position (auto-on when scrolled to bottom, auto-off when scrolled
     away) and the nav-cluster's follow toggle. */
  followMode: boolean;
  /* Monotonic tick the Compose component bumps on submit, signalling
     the Feed to scroll to the bottom of the scroll container. */
  scrollToBottomTick: number;
  /* Per-session pane state. Widths default to LEFT/RIGHT_PANEL_DEFAULT_WIDTH
     when a session has no entry. rightScrollBySession holds scrollTop of the
     right panel's content scroller. */
  leftPanelWidthBySession: Record<string, number>;
  rightPanelWidthBySession: Record<string, number>;
  rightTabBySession: Record<string, RightTabKey>;
  rightScrollBySession: Record<string, number>;
  activeModal: ModalKey;
  settingsSection: SettingsSectionKey;
  /* When `activeModal === 'preset-editor'`, this holds the preset being
     edited. `null` means "create new". The popover sets this before
     opening the editor. */
  editingPreset: CustomPreset | null;
  /* Bumped whenever the custom-preset list changes so listeners (the
     popover) can re-read localStorage and re-render. */
  customPresetsVersion: number;
  /* Same pattern for custom categories (renderer-local; see
     popovers/customCategories.ts). */
  customCategoriesVersion: number;
  activePopover: PopoverState;
  /* Activity-log filter. Lifted into the store (was previously local to
     RightLog) so applied filters survive a Right-panel tab switch — RightLog
     unmounts when the user switches to Todos/Comments/Named, and local state
     would otherwise reset to DEFAULT_FILTER on remount. */
  logFilter: LogFilter;
  managedAgentsDisabledReason: string | null;
  /* Files pane state. Trees + favorites are cached keyed by activePath
     (project root) so switching paths doesn't drop the cache for the
     previous one. filesExpandedByPath tracks which folder relPaths are
     currently expanded per project. filesSearch is a single in-memory
     slice that resets when the current session changes. */
  filesTreeByPath: Record<string, FilesTreeResponse | null>;
  filesTreeLoadingByPath: Record<string, boolean>;
  filesExpandedByPath: Record<string, Record<string, true>>;
  filesFavoritesProjectByPath: Record<string, string[]>;
  filesFavoritesSession: Record<string, string[]>;
  filesSearch: FilesSearchState;
  setToken(token: string | null): void;
  setSessions(s: SessionMeta[]): void;
  setPathsState(p: {
    activePath: string | null;
    activePathId: string | null;
    activeRevision: number;
    knownPaths: string[];
    favorites: PathFavorite[];
  }): void;
  setKnownPaths(p: string[]): void;
  setFavorites(f: PathFavorite[]): void;
  setCurrentSession(id: string | null): void;
  setParticipants(p: Record<string, Participant>): void;
  upsertParticipant(id: string, p: Participant): void;
  setCurrentUserId(id: string | null): void;
  setEvents(events: AnyEventRecord[]): void;
  upsertEvent(event: AnyEventRecord): void;
  setComposeMode(mode: "message" | "named" | "comment"): void;
  setCommentTarget(
    target: { file: string; lines?: [number, number] } | null,
  ): void;
  setComposeDraft(draft: string | null): void;
  setLeftRail(v: LeftRailKey): void;
  setRightTab(v: RightPanelView): void;
  setRightTabsConfig(cfg: RightTabConfig): void;
  setRightTabsConfigForSession(cfg: RightTabConfig): void;
  clearRightTabsConfigForSessionOverride(): void;
  setViewMode(v: ViewMode): void;
  setLeftPanelWidth(px: number): void;
  setRightPanelWidth(px: number): void;
  setRightScroll(scrollTop: number): void;
  /* Advance the lastSeen anchor for the current session to `filename`
     iff it is later than the existing anchor. No-op when there's no
     current session. */
  markSeen(filename: string): void;
  setFollowMode(v: boolean): void;
  /* Signal the Feed to scroll to the bottom on next render — Compose
     calls this immediately after a successful submit. */
  requestScrollToBottom(): void;
  openModal(key: ModalKey): void;
  openSettings(section?: SettingsSectionKey): void;
  setSettingsSection(section: SettingsSectionKey): void;
  closeModal(): void;
  openPresetEditor(preset: CustomPreset | null): void;
  bumpCustomPresets(): void;
  bumpCustomCategories(): void;
  openPopover(key: PopoverKey, anchorRect: DOMRect | null): void;
  closePopover(): void;
  setLogFilter(filter: LogFilter): void;
  setManagedAgentsDisabledReason(reason: string | null): void;
  setFilesTree(path: string, tree: FilesTreeResponse | null): void;
  setFilesTreeLoading(path: string, loading: boolean): void;
  toggleFilesFolder(path: string, relPath: string): void;
  setFilesFavoritesProject(path: string, list: string[]): void;
  setFilesFavoritesSession(sessionId: string, list: string[]): void;
  setFilesSearch(patch: Partial<FilesSearchState>): void;
  resetFilesSearch(): void;
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
  rightTabsConfig: loadRightTabsConfig(),
  rightTabsConfigBySession: loadRightTabsConfigBySession(),
  viewMode: "everything",
  viewModeBySession: loadViewModeBySession(),
  lastSeenBySession: loadLastSeenBySession(),
  followMode: true,
  scrollToBottomTick: 0,
  leftPanelWidthBySession: loadLeftPanelWidthBySession(),
  rightPanelWidthBySession: loadRightPanelWidthBySession(),
  rightTabBySession: loadRightTabBySession(),
  rightScrollBySession: loadRightScrollBySession(),
  activeModal: null,
  settingsSection: "profile",
  editingPreset: null,
  customPresetsVersion: 0,
  customCategoriesVersion: 0,
  activePopover: { key: null, anchorRect: null },
  logFilter: DEFAULT_FILTER,
  managedAgentsDisabledReason: null,
  activePath: null,
  activePathId: null,
  activeRevision: 0,
  knownPaths: [],
  favorites: [],
  filesTreeByPath: {},
  filesTreeLoadingByPath: {},
  filesExpandedByPath: {},
  filesFavoritesProjectByPath: {},
  filesFavoritesSession: {},
  filesSearch: DEFAULT_FILES_SEARCH,
  setToken: (token) => set({ token }),
  setSessions: (sessions) => set({ sessions }),
  setPathsState: (p) =>
    set({
      activePath: p.activePath,
      activePathId: p.activePathId,
      activeRevision: p.activeRevision,
      knownPaths: p.knownPaths,
      favorites: p.favorites,
    }),
  setKnownPaths: (knownPaths) => set({ knownPaths }),
  setFavorites: (favorites) => set({ favorites }),
  setCurrentSession: (currentSessionId) => {
    /* Preserve P4's behaviour (clear events on session switch) while
       restoring the per-session view mode if one was previously stored.
       No-op when the id hasn't changed: redundant calls (e.g. from the
       path-switched WS handler firing after Sessions.tsx already picked
       the same session) would otherwise wipe `events: []` after the
       events-fetch useEffect already populated them — and that useEffect
       won't refire because currentSessionId didn't change. */
    const state = get();
    if (state.currentSessionId === currentSessionId) return;
    const nextMode: ViewMode =
      currentSessionId !== null
        ? (state.viewModeBySession[currentSessionId] ?? "everything")
        : "everything";
    /* Restore the per-session right-tab selection. Sessions with no
       stored preference fall back to "log" — the prior global default. */
    const nextRightTab: RightTabKey =
      currentSessionId !== null
        ? (state.rightTabBySession[currentSessionId] ?? "log")
        : "log";
    set({
      currentSessionId,
      events: [],
      viewMode: nextMode,
      rightTab: nextRightTab,
      followMode: true,
      filesSearch: DEFAULT_FILES_SEARCH,
    });
  },
  setParticipants: (participants) => {
    const userId = Object.entries(participants).find(
      ([, p]) => p.kind === "user",
    )?.[0];
    set({ participants, currentUserId: userId ?? null });
  },
  upsertParticipant: (id, p) =>
    set((s) => ({ participants: { ...s.participants, [id]: p } })),
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
  setCommentTarget: (commentTarget) => set({ commentTarget }),
  setComposeDraft: (composeDraft) => set({ composeDraft }),
  setLeftRail: (leftRail) => set({ leftRail }),
  setRightTab: (rightTab) => {
    const state = get();
    /* The Layout view is ephemeral chrome — don't persist it as the
       session's selected tab. When the user later returns to the session
       we want them to land back on a content tab. */
    if (rightTab === "layout" || state.currentSessionId === null) {
      set({ rightTab });
      return;
    }
    const next = {
      ...state.rightTabBySession,
      [state.currentSessionId]: rightTab,
    };
    saveRightTabBySession(next);
    set({ rightTab, rightTabBySession: next });
  },
  setRightTabsConfig: (cfg) => {
    saveRightTabsConfig(cfg);
    set({ rightTabsConfig: cfg });
  },
  setRightTabsConfigForSession: (cfg) => {
    const state = get();
    const sid = state.currentSessionId;
    if (sid === null) return;
    const next = { ...state.rightTabsConfigBySession, [sid]: cfg };
    saveRightTabsConfigBySession(next);
    set({ rightTabsConfigBySession: next });
  },
  clearRightTabsConfigForSessionOverride: () => {
    const state = get();
    const sid = state.currentSessionId;
    if (sid === null) return;
    if (state.rightTabsConfigBySession[sid] === undefined) return;
    const next = { ...state.rightTabsConfigBySession };
    delete next[sid];
    saveRightTabsConfigBySession(next);
    set({ rightTabsConfigBySession: next });
  },
  setLeftPanelWidth: (px) => {
    const state = get();
    const clamped = Math.min(PANE_MAX_WIDTH, Math.max(PANE_MIN_WIDTH, px));
    if (state.currentSessionId === null) return;
    const next = {
      ...state.leftPanelWidthBySession,
      [state.currentSessionId]: clamped,
    };
    saveNumberMap(LEFT_PANEL_WIDTH_STORAGE_KEY, next);
    set({ leftPanelWidthBySession: next });
  },
  setRightPanelWidth: (px) => {
    const state = get();
    const clamped = Math.min(PANE_MAX_WIDTH, Math.max(PANE_MIN_WIDTH, px));
    if (state.currentSessionId === null) return;
    const next = {
      ...state.rightPanelWidthBySession,
      [state.currentSessionId]: clamped,
    };
    saveNumberMap(RIGHT_PANEL_WIDTH_STORAGE_KEY, next);
    set({ rightPanelWidthBySession: next });
  },
  setRightScroll: (scrollTop) => {
    const state = get();
    if (state.currentSessionId === null) return;
    const next = {
      ...state.rightScrollBySession,
      [state.currentSessionId]: Math.max(0, Math.round(scrollTop)),
    };
    saveNumberMap(RIGHT_SCROLL_STORAGE_KEY, next);
    set({ rightScrollBySession: next });
  },
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
  markSeen: (filename) => {
    const state = get();
    const sid = state.currentSessionId;
    if (sid === null) return;
    const prev = state.lastSeenBySession[sid];
    if (prev !== undefined && prev >= filename) return;
    const next = { ...state.lastSeenBySession, [sid]: filename };
    saveLastSeenBySession(next);
    set({ lastSeenBySession: next });
  },
  setFollowMode: (followMode) => set({ followMode }),
  requestScrollToBottom: () =>
    set((s) => ({ scrollToBottomTick: s.scrollToBottomTick + 1 })),
  openModal: (activeModal) =>
    set(
      activeModal === "settings"
        ? { activeModal, settingsSection: "profile" }
        : { activeModal },
    ),
  openSettings: (settingsSection = "profile") =>
    set({ activeModal: "settings", settingsSection }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  closeModal: () => set({ activeModal: null, editingPreset: null }),
  openPresetEditor: (editingPreset) =>
    set({ activeModal: "preset-editor", editingPreset }),
  bumpCustomPresets: () =>
    set((s) => ({ customPresetsVersion: s.customPresetsVersion + 1 })),
  bumpCustomCategories: () =>
    set((s) => ({ customCategoriesVersion: s.customCategoriesVersion + 1 })),
  openPopover: (key, anchorRect) =>
    set({ activePopover: { key, anchorRect } }),
  closePopover: () =>
    set({ activePopover: { key: null, anchorRect: null } }),
  setLogFilter: (logFilter) => set({ logFilter }),
  setManagedAgentsDisabledReason: (managedAgentsDisabledReason) =>
    set({ managedAgentsDisabledReason }),
  setFilesTree: (path, tree) =>
    set((s) => ({
      filesTreeByPath: { ...s.filesTreeByPath, [path]: tree },
    })),
  setFilesTreeLoading: (path, loading) =>
    set((s) => ({
      filesTreeLoadingByPath: { ...s.filesTreeLoadingByPath, [path]: loading },
    })),
  toggleFilesFolder: (path, relPath) =>
    set((s) => {
      const cur = s.filesExpandedByPath[path] ?? {};
      const next = { ...cur };
      if (next[relPath] === true) {
        delete next[relPath];
      } else {
        next[relPath] = true;
      }
      return {
        filesExpandedByPath: { ...s.filesExpandedByPath, [path]: next },
      };
    }),
  setFilesFavoritesProject: (path, list) =>
    set((s) => ({
      filesFavoritesProjectByPath: {
        ...s.filesFavoritesProjectByPath,
        [path]: list,
      },
    })),
  setFilesFavoritesSession: (sessionId, list) =>
    set((s) => ({
      filesFavoritesSession: { ...s.filesFavoritesSession, [sessionId]: list },
    })),
  setFilesSearch: (patch) =>
    set((s) => ({ filesSearch: { ...s.filesSearch, ...patch } })),
  resetFilesSearch: () => set({ filesSearch: DEFAULT_FILES_SEARCH }),
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
      const participant = s.participants[msg.participant_id];
      if (participant !== undefined && participant.kind === "agent") {
        s.upsertParticipant(msg.participant_id, {
          ...participant,
          runtime_id: msg.runtime_id,
          active_session: msg.active_session,
        });
      }
    } else if (msg.type === "managed-agent.killed") {
      s.removeManagedAgent(msg.participant_id);
      s.removePresence(msg.participant_id);
    } else if (msg.type === "managed-agent.updated") {
      s.addManagedAgent({
        participant_id: msg.agent.participant_id,
        tmux_session: msg.agent.tmux_session,
        runtime_id: msg.agent.runtime_id,
        runtime_session: msg.agent.runtime_session,
        alive: msg.agent.connection_state === "connected",
        runtime_state: msg.agent.runtime_state,
      });
      const participant = s.participants[msg.agent.participant_id];
      if (participant !== undefined && participant.kind === "agent") {
        s.upsertParticipant(msg.agent.participant_id, {
          ...participant,
          runtime_id: msg.agent.runtime_id ?? participant.runtime_id,
          active_session: msg.agent.active_session,
        });
      }
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
