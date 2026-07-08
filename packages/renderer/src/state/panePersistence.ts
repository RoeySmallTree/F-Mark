import {
  isRightTabKey,
  type RightTabKey,
} from "./rightTabsConfig.js";
import {
  loadMap,
  loadNumberMap,
  saveJson,
  storageGet,
  storageRemove,
} from "./storagePersistence.js";

const NO_LOOSE_STRING_VALUES = {
  width: "width",
} as const;

const LEFT_PANEL_WIDTH_STORAGE_KEY = "fmark.leftPanelWidthBySession";
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "fmark.rightPanelWidthBySession";
const RIGHT_TAB_STORAGE_KEY = "fmark.rightTabBySession";
const RIGHT_SCROLL_STORAGE_KEY = "fmark.rightScrollBySession";

export const PANE_MIN_WIDTH = 200;
export const PANE_MAX_WIDTH = 600;
const LEFT_PANEL_DEFAULT_WIDTH = 288;
const RIGHT_PANEL_DEFAULT_WIDTH = 340;
/* Heights matter once a pane can be stacked vertically (rows / side-stack /
   band-split placements - see themes/layout.ts). */
export const PANE_MIN_HEIGHT = 120;
export const PANE_MAX_HEIGHT = 900;
const LEFT_PANEL_DEFAULT_HEIGHT = 260;
const RIGHT_PANEL_DEFAULT_HEIGHT = 300;

/* Unified per-session pane sizes. Replaces the old width-only maps
   (`fmark.leftPanelWidthBySession` / `...right...`) - those are migrated once
   on first load then deleted, since pane placement can now require heights. */
const PANEL_SIZE_STORAGE_KEY = "fmark.panelSizeBySession";

export type PanelId = "leftPanel" | "rightPanel";
export interface PaneSize {
  width: number;
  height: number;
}
export type SessionPaneSizes = Record<PanelId, PaneSize>;

export function defaultPaneSizes(): SessionPaneSizes {
  return {
    leftPanel: {
      width: LEFT_PANEL_DEFAULT_WIDTH,
      height: LEFT_PANEL_DEFAULT_HEIGHT,
    },
    rightPanel: {
      width: RIGHT_PANEL_DEFAULT_WIDTH,
      height: RIGHT_PANEL_DEFAULT_HEIGHT,
    },
  };
}

export function loadRightTabBySession(): Record<string, RightTabKey> {
  return loadMap(RIGHT_TAB_STORAGE_KEY, (value) =>
    isRightTabKey(value) ? value : undefined,
  );
}

export function saveRightTabBySession(map: Record<string, RightTabKey>): void {
  saveJson(RIGHT_TAB_STORAGE_KEY, map);
}

function isPaneSize(value: unknown): value is PaneSize {
  if (value === null || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  return (
    typeof object.width === "number" &&
    Number.isFinite(object.width) &&
    typeof object.height === "number" &&
    Number.isFinite(object.height)
  );
}

export function savePanelSizeBySession(
  map: Record<string, SessionPaneSizes>,
): void {
  saveJson(PANEL_SIZE_STORAGE_KEY, map);
}

function normalizeSessionPaneSizes(value: unknown): SessionPaneSizes | undefined {
  const object = (value ?? {}) as Record<string, unknown>;
  if (!isPaneSize(object.leftPanel) || !isPaneSize(object.rightPanel)) {
    return undefined;
  }
  return {
    leftPanel: object.leftPanel,
    rightPanel: object.rightPanel,
  };
}

function loadMigratedPanelSizes(): Record<string, SessionPaneSizes> {
  const leftWidths = loadNumberMap(LEFT_PANEL_WIDTH_STORAGE_KEY);
  const rightWidths = loadNumberMap(RIGHT_PANEL_WIDTH_STORAGE_KEY);
  const out: Record<string, SessionPaneSizes> = {};
  for (const sid of new Set([
    ...Object.keys(leftWidths),
    ...Object.keys(rightWidths),
  ])) {
    const base = defaultPaneSizes();
    out[sid] = {
      leftPanel: {
        ...base.leftPanel,
        width: leftWidths[sid] ?? base.leftPanel.width,
      },
      rightPanel: {
        ...base.rightPanel,
        width: rightWidths[sid] ?? base.rightPanel.width,
      },
    };
  }
  if (Object.keys(out).length > 0) savePanelSizeBySession(out);
  storageRemove(LEFT_PANEL_WIDTH_STORAGE_KEY);
  storageRemove(RIGHT_PANEL_WIDTH_STORAGE_KEY);
  return out;
}

/* Load unified pane sizes. If the new key is absent, migrate the legacy
   width maps once and remove them. */
export function loadPanelSizeBySession(): Record<string, SessionPaneSizes> {
  try {
    const raw = storageGet(PANEL_SIZE_STORAGE_KEY);
    if (raw !== null && raw !== undefined) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        const out: Record<string, SessionPaneSizes> = {};
        for (const [sid, value] of Object.entries(
          parsed as Record<string, unknown>,
        )) {
          const sizes = normalizeSessionPaneSizes(value);
          if (sizes !== undefined) out[sid] = sizes;
        }
        return out;
      }
    }
  } catch {
    /* fall through to migration */
  }
  return loadMigratedPanelSizes();
}

export const loadRightScrollBySession = (): Record<string, number> =>
  loadNumberMap(RIGHT_SCROLL_STORAGE_KEY);

export function saveRightScrollBySession(map: Record<string, number>): void {
  saveJson(RIGHT_SCROLL_STORAGE_KEY, map);
}

export function clampPaneSize(
  axis: "width" | "height",
  value: number,
): number {
  const min = axis === NO_LOOSE_STRING_VALUES.width ? PANE_MIN_WIDTH : PANE_MIN_HEIGHT;
  const max = axis === NO_LOOSE_STRING_VALUES.width ? PANE_MAX_WIDTH : PANE_MAX_HEIGHT;
  return Math.min(max, Math.max(min, value));
}
