import type { ReactNode } from "react";
import {
  Bot,
  Eye,
  FileText,
  Folder,
  FolderTree,
  GitCompareArrows,
  ListChecks,
  MessageSquare,
  MessageSquareReply,
  Search,
  SquareTerminal,
  Terminal,
} from "lucide-react";
import { clearDragSource, setCircularDragImage } from "../drag/dragPreview.js";

export type DockPaneId =
  | "messages"
  | "sessions"
  | "todos"
  | "comments"
  | "named"
  | "agents"
  | "log"
  | "files"
  | "diffTree"
  | "terminal"
  | "search"
  | "filesDisplay";

export type DockArea = "left" | "center" | "right" | "bottom" | "toolbar";

export interface DockPaneMeta {
  label: string;
  short: string;
  icon: ReactNode;
}

export interface DockLayout {
  areas: Record<DockArea, DockPaneId[]>;
  active: Partial<Record<Exclude<DockArea, "toolbar">, DockPaneId>>;
}

const dockAreaIds = {
  left: "left",
  center: "center",
  right: "right",
  bottom: "bottom",
  toolbar: "toolbar",
} as const satisfies Record<string, DockArea>;

const dockPaneIds = {
  messages: "messages",
  sessions: "sessions",
  todos: "todos",
  comments: "comments",
  named: "named",
  agents: "agents",
  log: "log",
  files: "files",
  diffTree: "diffTree",
  terminal: "terminal",
  search: "search",
  filesDisplay: "filesDisplay",
} as const satisfies Record<string, DockPaneId>;

const DOCK_AREAS: DockArea[] = [
  dockAreaIds.left,
  dockAreaIds.center,
  dockAreaIds.right,
  dockAreaIds.bottom,
  dockAreaIds.toolbar,
];

export const DOCK_PANES: DockPaneId[] = [
  dockPaneIds.messages,
  dockPaneIds.sessions,
  dockPaneIds.todos,
  dockPaneIds.comments,
  dockPaneIds.named,
  dockPaneIds.agents,
  dockPaneIds.log,
  dockPaneIds.files,
  dockPaneIds.diffTree,
  dockPaneIds.terminal,
  dockPaneIds.search,
  dockPaneIds.filesDisplay,
];

const DOCK_DRAG_MIME = "application/x-fmark-dock-pane";
const visibleDockAreas: Array<Exclude<DockArea, "toolbar">> = [
  dockAreaIds.left,
  dockAreaIds.center,
  dockAreaIds.right,
  dockAreaIds.bottom,
];

const dragEffects = {
  move: "move",
} as const;

export const DOCK_META: Record<DockPaneId, DockPaneMeta> = {
  messages: {
    label: "Messages",
    short: "Msg",
    icon: <MessageSquare size={13} aria-hidden="true" />,
  },
  sessions: {
    label: "Sessions",
    short: "Sess",
    icon: <Folder size={13} aria-hidden="true" />,
  },
  todos: {
    label: "Todos",
    short: "Todo",
    icon: <ListChecks size={13} aria-hidden="true" />,
  },
  comments: {
    label: "Comments",
    short: "Com",
    icon: <MessageSquareReply size={13} aria-hidden="true" />,
  },
  named: {
    label: "Named",
    short: "Name",
    icon: <FileText size={13} aria-hidden="true" />,
  },
  agents: {
    label: "Agents",
    short: "Ag",
    icon: <Bot size={13} aria-hidden="true" />,
  },
  log: {
    label: "Log",
    short: "Log",
    icon: <Terminal size={13} aria-hidden="true" />,
  },
  files: {
    label: "Files tree",
    short: "Tree",
    icon: <FolderTree size={13} aria-hidden="true" />,
  },
  diffTree: {
    label: "Diff tree",
    short: "Diff",
    icon: <GitCompareArrows size={13} aria-hidden="true" />,
  },
  terminal: {
    label: "Terminal",
    short: "Term",
    icon: <SquareTerminal size={13} aria-hidden="true" />,
  },
  search: {
    label: "Search",
    short: "Find",
    icon: <Search size={13} aria-hidden="true" />,
  },
  filesDisplay: {
    label: "File display",
    short: "File",
    icon: <Eye size={13} aria-hidden="true" />,
  },
};

const STORAGE_KEY = "fmark.dockLayout";
/* Bump when the DEFAULT layout changes in a way existing stored layouts should
   migrate toward. v2: File display ("filesDisplay") moved from the stowed
   toolbar into the center area beside Messages, so the file viewer shows as a
   top-bar Msg|File tab by default (see migrateDockLayoutOnce). v3: the Terminal
   pane was added; existing stored layouts get it appended to the right pane
   (normalizeLayout would otherwise park a brand-new pane in the toolbar). v4:
   Diff tree was added and should surface beside Files. v5 (Ledger redesign):
   the "toolbar" stow area is no longer surfaced — the strip that revealed it
   was one of five competing tablists. Search moves to the right rail so it
   keeps a home; nothing is stowed by default. */
export const CURRENT_DOCK_LAYOUT_VERSION = 5;

export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  areas: {
    left: ["sessions"],
    center: ["messages", "filesDisplay"],
    right: [
      "todos",
      "comments",
      "named",
      "agents",
      "log",
      "files",
      "diffTree",
      "terminal",
      "search",
    ],
    bottom: [],
    toolbar: [],
  },
  active: {
    left: "sessions",
    center: "messages",
    right: "log",
  },
};

const subscribers = new Set<(layout: DockLayout) => void>();
const dragSubscribers = new Set<(pane: DockPaneId | null) => void>();
let dockDragPane: DockPaneId | null = null;

function isDockPaneId(value: unknown): value is DockPaneId {
  return (
    typeof value === "string" && DOCK_PANES.includes(value as DockPaneId)
  );
}

export function dockPaneFromDataTransfer(
  dataTransfer: DataTransfer,
): DockPaneId | null {
  const raw = dataTransfer.getData(DOCK_DRAG_MIME);
  return isDockPaneId(raw) ? raw : null;
}

export function hasDockPaneDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(DOCK_DRAG_MIME);
}

function notifyDockDrag(pane: DockPaneId | null): void {
  dockDragPane = pane;
  if (typeof document !== "undefined") {
    if (pane === null) {
      delete document.body.dataset.fmarkDockDragging;
      delete document.body.dataset.fmarkDockDraggingLabel;
    } else {
      document.body.dataset.fmarkDockDragging = pane;
      document.body.dataset.fmarkDockDraggingLabel = DOCK_META[pane].label;
    }
  }
  for (const cb of dragSubscribers) {
    try {
      cb(pane);
    } catch {
      /* no-op */
    }
  }
}

export function getCurrentDockPaneDrag(): DockPaneId | null {
  return dockDragPane;
}

export function subscribeDockPaneDrag(
  cb: (pane: DockPaneId | null) => void,
): () => void {
  dragSubscribers.add(cb);
  return () => {
    dragSubscribers.delete(cb);
  };
}

export function clearDockPaneDrag(): void {
  notifyDockDrag(null);
  clearDragSource();
}

export function writeDockPaneData(
  dataTransfer: DataTransfer,
  pane: DockPaneId,
  source?: HTMLElement | null,
  opts: { globalDropHints?: boolean } = {},
): void {
  dataTransfer.effectAllowed = dragEffects.move;
  dataTransfer.setData(DOCK_DRAG_MIME, pane);
  setCircularDragImage(dataTransfer, source, {
    label: DOCK_META[pane].label,
    fallbackText: DOCK_META[pane].short,
  });
  if (opts.globalDropHints !== false) notifyDockDrag(pane);
}

function emptyAreas(): Record<DockArea, DockPaneId[]> {
  return {
    left: [],
    center: [],
    right: [],
    bottom: [],
    toolbar: [],
  };
}

function cloneDockLayout(layout: DockLayout): DockLayout {
  return {
    areas: {
      left: [...layout.areas.left],
      center: [...layout.areas.center],
      right: [...layout.areas.right],
      bottom: [...layout.areas.bottom],
      toolbar: [...layout.areas.toolbar],
    },
    active: { ...layout.active },
  };
}

function adjacentPaneAfterRemoval(
  previousList: DockPaneId[],
  movedPane: DockPaneId,
  remainingList: DockPaneId[],
): DockPaneId {
  const previousIndex = previousList.indexOf(movedPane);
  if (previousIndex < 0) return remainingList[0]!;
  return remainingList[Math.min(previousIndex, remainingList.length - 1)]!;
}

function normalizeLayout(value: unknown): DockLayout {
  if (value === null || typeof value !== "object") {
    return cloneDockLayout(DEFAULT_DOCK_LAYOUT);
  }
  const raw = value as Record<string, unknown>;
  const rawAreas = raw.areas;
  if (rawAreas === null || typeof rawAreas !== "object") {
    return cloneDockLayout(DEFAULT_DOCK_LAYOUT);
  }

  const areas = emptyAreas();
  const used = new Set<DockPaneId>();
  for (const area of DOCK_AREAS) {
    const rawList = (rawAreas as Record<string, unknown>)[area];
    if (!Array.isArray(rawList)) continue;
    for (const pane of rawList) {
      if (!isDockPaneId(pane) || used.has(pane)) continue;
      areas[area].push(pane);
      used.add(pane);
    }
  }
  for (const pane of DOCK_PANES) {
    if (!used.has(pane)) areas.toolbar.push(pane);
  }

  const active: DockLayout["active"] = {};
  const rawActive = raw.active;
  for (const area of ["left", "center", "right", "bottom"] as const) {
    const candidate =
      rawActive !== null && typeof rawActive === "object"
        ? (rawActive as Record<string, unknown>)[area]
        : undefined;
    active[area] =
      isDockPaneId(candidate) && areas[area].includes(candidate)
        ? candidate
        : areas[area][0];
  }

  return { areas, active };
}

function safeStorageGet(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function hasStoredDockLayout(): boolean {
  return safeStorageGet() !== null;
}

function safeStorageSet(layout: DockLayout): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: CURRENT_DOCK_LAYOUT_VERSION, ...layout }),
    );
  } catch {
    /* no-op */
  }
}

export function getCurrentDockLayout(): DockLayout {
  const raw = safeStorageGet();
  if (raw === null) return cloneDockLayout(DEFAULT_DOCK_LAYOUT);
  try {
    return normalizeLayout(JSON.parse(raw) as unknown);
  } catch {
    return cloneDockLayout(DEFAULT_DOCK_LAYOUT);
  }
}

function readStoredDockVersion(value: unknown): number {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { version?: unknown }).version === "number"
  ) {
    return (value as { version: number }).version;
  }
  return 1; /* unversioned storage predates the version field → treat as v1 */
}

function isPanePlacedVisibly(layout: DockLayout, pane: DockPaneId): boolean {
  return visibleDockAreas.some((area) =>
    layout.areas[area].includes(pane),
  );
}

/* v1 → v2: re-home a stowed/missing `filesDisplay` into the center area beside
   Messages. A `filesDisplay` the user already moved into ANY visible area is left
   exactly where it is — the v1 shape carries no intent bit, so the least-bad rule
   is to relocate only an invisible (toolbar/absent) pane. */
function migrateLayoutToV2(layout: DockLayout): DockLayout {
  if (isPanePlacedVisibly(layout, dockPaneIds.filesDisplay)) return layout;
  const next = cloneDockLayout(layout);
  for (const area of DOCK_AREAS) {
    next.areas[area] = next.areas[area].filter(
      (p) => p !== dockPaneIds.filesDisplay,
    );
  }
  const center = next.areas.center;
  const afterMessages = center.indexOf(dockPaneIds.messages);
  if (afterMessages >= 0) {
    center.splice(afterMessages + 1, 0, dockPaneIds.filesDisplay);
  } else {
    center.push(dockPaneIds.filesDisplay);
  }
  if (next.active.center === undefined || !center.includes(next.active.center)) {
    next.active.center = center.includes(dockPaneIds.messages)
      ? dockPaneIds.messages
      : center[0];
  }
  return next;
}

/* v2 → v3: surface the new Terminal pane in the right dock. A `terminal` the
   user has already placed in any visible area is left where it is; otherwise it
   is appended to the right pane (normalizeLayout would park an unknown-but-now-
   known pane in the toolbar, hiding it). Active selection is untouched. */
function migrateLayoutToV3(layout: DockLayout): DockLayout {
  if (isPanePlacedVisibly(layout, dockPaneIds.terminal)) return layout;
  const next = cloneDockLayout(layout);
  for (const area of DOCK_AREAS) {
    next.areas[area] = next.areas[area].filter(
      (p) => p !== dockPaneIds.terminal,
    );
  }
  next.areas.right.push(dockPaneIds.terminal);
  return next;
}

/* v3 → v4: surface the new Diff tree pane immediately after Files. Existing
   visible placements win; otherwise keep it on the right near the normal tree. */
function migrateLayoutToV4(layout: DockLayout): DockLayout {
  if (isPanePlacedVisibly(layout, dockPaneIds.diffTree)) return layout;
  const next = cloneDockLayout(layout);
  for (const area of DOCK_AREAS) {
    next.areas[area] = next.areas[area].filter(
      (p) => p !== dockPaneIds.diffTree,
    );
  }
  const filesIndex = next.areas.right.indexOf(dockPaneIds.files);
  if (filesIndex >= 0) {
    next.areas.right.splice(filesIndex + 1, 0, dockPaneIds.diffTree);
  } else {
    next.areas.right.push(dockPaneIds.diffTree);
  }
  return next;
}

/* Run ONCE at main-app startup, BEFORE any getCurrentDockLayout read, main app
   only — the standalone /file-tree page must not mutate the global dock. Fresh
   installs need nothing (the current default already places filesDisplay and
   terminal visibly); only older stored layouts are upgraded, and the upgrade is
   persisted (stamping the current version) so it never repeats. */
export function migrateDockLayoutOnce(): void {
  const raw = safeStorageGet();
  if (raw === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const version = readStoredDockVersion(parsed);
  if (version >= CURRENT_DOCK_LAYOUT_VERSION) return;
  let layout = normalizeLayout(parsed);
  if (version < 2) layout = migrateLayoutToV2(layout);
  if (version < 3) layout = migrateLayoutToV3(layout);
  if (version < 4) layout = migrateLayoutToV4(layout);
  safeStorageSet(layout);
}

export function activateDockPaneIfPlaced(pane: DockPaneId): boolean {
  const layout = getCurrentDockLayout();
  for (const area of ["left", "center", "right", "bottom"] as const) {
    if (!layout.areas[area].includes(pane)) continue;
    applyDockLayout(setDockActive(layout, area, pane));
    return true;
  }
  return false;
}

/* Reveal the file viewer in the dock: activate `filesDisplay` where it lives, or
   — if it's parked in the toolbar / absent — re-home it into the center beside
   Messages and activate it there. Main-app only; callers reach it through the
   FileDisplaySurface context so the standalone page can opt out (no-op). */
export function surfaceFileDisplayInDock(): void {
  if (activateDockPaneIfPlaced(dockPaneIds.filesDisplay)) return;
  applyDockLayout(
    moveDockPane(
      getCurrentDockLayout(),
      dockPaneIds.filesDisplay,
      dockAreaIds.center,
    ),
  );
}

export function applyDockLayout(
  layout: DockLayout,
  opts: { persist?: boolean } = {},
): void {
  const next = normalizeLayout(layout);
  if (opts.persist !== false) {
    // Idempotent no-op guard: if the normalized layout is unchanged, don't
    // persist or re-notify. Re-notifying hands every subscriber a fresh object
    // identity for an unchanged layout, which can drive an infinite render loop
    // — e.g. the "focus a comment → selectTab('comments')" effect re-fires
    // forever because `dockLayout`/`rightPanes`/`selectTab` identities keep
    // churning even though the active pane never actually changes.
    if (JSON.stringify(getCurrentDockLayout()) === JSON.stringify(next)) return;
    safeStorageSet(next);
  }
  for (const cb of subscribers) {
    try {
      cb(next);
    } catch {
      /* no-op */
    }
  }
}

export function subscribeDockLayout(
  cb: (layout: DockLayout) => void,
): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function setDockActive(
  layout: DockLayout,
  area: Exclude<DockArea, "toolbar">,
  pane: DockPaneId,
): DockLayout {
  const next = cloneDockLayout(layout);
  if (!next.areas[area].includes(pane)) return next;
  next.active[area] = pane;
  return next;
}

export function moveDockPane(
  layout: DockLayout,
  pane: DockPaneId,
  area: DockArea,
  beforePane?: DockPaneId,
): DockLayout {
  if (beforePane === pane) return cloneDockLayout(layout);
  const next = cloneDockLayout(layout);
  const sourceArea = DOCK_AREAS.find((dockArea) =>
    layout.areas[dockArea].includes(pane),
  );
  const sourceListBefore =
    sourceArea !== undefined ? [...layout.areas[sourceArea]] : [];
  for (const dockArea of DOCK_AREAS) {
    next.areas[dockArea] = next.areas[dockArea].filter((p) => p !== pane);
  }

  const target = next.areas[area];
  const before = beforePane !== undefined ? target.indexOf(beforePane) : -1;
  if (before >= 0) {
    target.splice(before, 0, pane);
  } else {
    target.push(pane);
  }

  for (const dockArea of ["left", "center", "right", "bottom"] as const) {
    const list = next.areas[dockArea];
    if (list.length === 0) {
      delete next.active[dockArea];
      continue;
    }
    if (dockArea === area) {
      next.active[dockArea] = pane;
      continue;
    }
    if (list.includes(next.active[dockArea]!)) continue;
    if (dockArea === sourceArea && layout.active[dockArea] === pane) {
      next.active[dockArea] = adjacentPaneAfterRemoval(
        sourceListBefore,
        pane,
        list,
      );
    } else {
      next.active[dockArea] = list[0];
    }
  }
  return next;
}

export function resetDockLayout(): void {
  applyDockLayout(cloneDockLayout(DEFAULT_DOCK_LAYOUT));
}
