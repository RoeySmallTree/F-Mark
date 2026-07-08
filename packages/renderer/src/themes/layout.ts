/**
 * Shell placement engine — lets the user arrange the three movable panes
 * (`leftPanel`, `chat`, `rightPanel`) in any of 36 "guillotine" layouts:
 * columns, rows, a full-height side pane with the other two stacked, or a
 * full-width band pane with the other two side-by-side.
 *
 * Mirrors the theme/density pattern (`themes/index.ts`, `themes/density.ts`):
 * a single localStorage key, a `getCurrent` / `apply` / `subscribe` trio, and
 * application before first paint in `main.tsx` to avoid FOUC. Unlike
 * theme/density (which swap a `<body>` class), placement is realised by
 * generating a CSS grid rule for the active placement and injecting it into a
 * `<style>` element; `App` stamps `data-shell-layout="<key>"` on `.main` so the
 * generated rule takes effect. Pane SIZES are CSS variables set per-session by
 * the store, so the generator is size-agnostic.
 */

export type PaneId = "leftPanel" | "chat" | "rightPanel";

/** One of 36 guillotine arrangements of the three movable panes. */
export type ShellPlacement =
  | { kind: "columns"; slots: [PaneId, PaneId, PaneId] }
  | { kind: "rows"; slots: [PaneId, PaneId, PaneId] }
  | {
      kind: "side-stack";
      side: "left" | "right";
      full: PaneId;
      stack: [PaneId, PaneId];
    }
  | {
      kind: "band-split";
      band: "top" | "bottom";
      full: PaneId;
      split: [PaneId, PaneId];
    };

/** Geometry of a pane's resize handle in the active placement. */
export interface PaneGeometry {
  axis: "col" | "row";
  edge: "left" | "right" | "top" | "bottom";
  /** +1 if dragging toward `edge` grows the pane, -1 if it shrinks it. */
  sign: 1 | -1;
}

export const STORAGE_KEY = "fmark.shellPlacement";

const paneIds = {
  leftPanel: "leftPanel",
  chat: "chat",
  rightPanel: "rightPanel",
} as const satisfies Record<string, PaneId>;

const layoutKinds = {
  columns: "columns",
  rows: "rows",
  sideStack: "side-stack",
  bandSplit: "band-split",
} as const satisfies Record<string, ShellPlacement["kind"]>;

const sides = {
  left: "left",
  right: "right",
} as const;

const bands = {
  top: "top",
  bottom: "bottom",
} as const;

const geometryAxes = {
  col: "col",
  row: "row",
} as const satisfies Record<string, PaneGeometry["axis"]>;

const geometryEdges = {
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
} as const satisfies Record<string, PaneGeometry["edge"]>;

const gridTracks = {
  flexible: "minmax(0, 1fr)",
  unit: "1fr",
} as const;

const PANE_IDS = [paneIds.leftPanel, paneIds.chat, paneIds.rightPanel] as const;
const SIDE_VALUES = [sides.left, sides.right] as const;
const BAND_VALUES = [bands.top, bands.bottom] as const;

export const DEFAULT_PLACEMENT: ShellPlacement = {
  kind: layoutKinds.columns,
  slots: [paneIds.leftPanel, paneIds.chat, paneIds.rightPanel],
};

/** Picker metadata — the four split patterns the user chooses between. */
export const SHELL_LAYOUT_KINDS: {
  kind: ShellPlacement["kind"];
  label: string;
  description: string;
}[] = [
  {
    kind: layoutKinds.columns,
    label: "Columns",
    description: "Three panes side by side (the classic layout).",
  },
  {
    kind: layoutKinds.rows,
    label: "Rows",
    description: "Three panes stacked top to bottom.",
  },
  {
    kind: layoutKinds.sideStack,
    label: "Side stack",
    description: "One full-height pane beside the other two, stacked.",
  },
  {
    kind: layoutKinds.bandSplit,
    label: "Top / bottom split",
    description: "One full-width pane above or below the other two.",
  },
];

/* ------------------------------------------------------------------ */
/* Size CSS variables (set per-session by the store)                   */
/* ------------------------------------------------------------------ */

const DEFAULT_WIDTH: Record<Exclude<PaneId, "chat">, number> = {
  [paneIds.leftPanel]: 288,
  [paneIds.rightPanel]: 340,
};
const DEFAULT_HEIGHT: Record<Exclude<PaneId, "chat">, number> = {
  [paneIds.leftPanel]: 260,
  [paneIds.rightPanel]: 300,
};

export function widthVar(pane: PaneId): string {
  return `--pane-w-${pane}`;
}
export function heightVar(pane: PaneId): string {
  return `--pane-h-${pane}`;
}

function colTrack(pane: PaneId): string {
  if (pane === paneIds.chat) return gridTracks.flexible;
  return `var(${widthVar(pane)}, ${DEFAULT_WIDTH[pane]}px)`;
}
function rowTrack(pane: PaneId): string {
  if (pane === paneIds.chat) return gridTracks.flexible;
  return `var(${heightVar(pane)}, ${DEFAULT_HEIGHT[pane]}px)`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isPaneId(v: unknown): v is PaneId {
  return typeof v === "string" && PANE_IDS.includes(v as PaneId);
}

function isExactPaneSet(panes: unknown[]): boolean {
  if (panes.length !== 3) return false;
  if (!panes.every(isPaneId)) return false;
  return new Set(panes).size === 3;
}

export function isShellPlacement(v: unknown): v is ShellPlacement {
  if (v === null || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  switch (p.kind) {
    case layoutKinds.columns:
    case layoutKinds.rows:
      return Array.isArray(p.slots) && isExactPaneSet(p.slots);
    case layoutKinds.sideStack:
      return (
        (p.side === sides.left || p.side === sides.right) &&
        isPaneId(p.full) &&
        Array.isArray(p.stack) &&
        isExactPaneSet([p.full, ...p.stack])
      );
    case layoutKinds.bandSplit:
      return (
        (p.band === bands.top || p.band === bands.bottom) &&
        isPaneId(p.full) &&
        Array.isArray(p.split) &&
        isExactPaneSet([p.full, ...p.split])
      );
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Key + CSS generation                                                */
/* ------------------------------------------------------------------ */

export function placementKey(p: ShellPlacement): string {
  switch (p.kind) {
    case layoutKinds.columns:
      return `columns:${p.slots.join("-")}`;
    case layoutKinds.rows:
      return `rows:${p.slots.join("-")}`;
    case layoutKinds.sideStack:
      return `side-stack:${p.side}:${p.full}:${p.stack.join("-")}`;
    case layoutKinds.bandSplit:
      return `band-split:${p.band}:${p.full}:${p.split.join("-")}`;
  }
}

/** Index of the stack/split member that absorbs free space (chat if present,
 *  otherwise the second member). */
function flexIndex(pair: [PaneId, PaneId]): number {
  const chatIdx = pair.indexOf(paneIds.chat);
  return chatIdx === -1 ? 1 : chatIdx;
}

/** A grid as an explicit track model: column/row track sizes plus a row-major
 *  matrix of grid-area names. Serialized to CSS by {@link serializeGrid}; built
 *  this way so the `extra` satellite can be injected uniformly (split chat's
 *  column or row) across all 36 placements instead of hand-editing each. */
interface GridModel {
  cols: string[];
  rows: string[];
  /** `cells[r][c]` = grid-area name. */
  cells: string[][];
}

function placementGrid(p: ShellPlacement): GridModel {
  switch (p.kind) {
    case layoutKinds.columns: {
      const [a, b, c] = p.slots;
      return {
        cols: [colTrack(a), colTrack(b), colTrack(c)],
        rows: [gridTracks.flexible],
        cells: [[a, b, c]],
      };
    }
    case layoutKinds.rows: {
      const [a, b, c] = p.slots;
      return {
        cols: [gridTracks.flexible],
        rows: [rowTrack(a), rowTrack(b), rowTrack(c)],
        cells: [[a], [b], [c]],
      };
    }
    case layoutKinds.sideStack: {
      const [s0, s1] = p.stack;
      const flex = flexIndex(p.stack);
      const stackRows = p.stack.map((pane, i) =>
        i === flex ? gridTracks.flexible : rowTrack(pane),
      );
      // Stack column: flexible if it holds chat, else the first member's width.
      const stackHasChat = p.stack.includes(paneIds.chat);
      const stackCol = stackHasChat
        ? gridTracks.flexible
        : colTrack(s0 === paneIds.chat ? s1 : s0);
      if (p.side === sides.left) {
        return {
          cols: [colTrack(p.full), stackCol],
          rows: stackRows,
          cells: [
            [p.full, s0],
            [p.full, s1],
          ],
        };
      }
      return {
        cols: [stackCol, colTrack(p.full)],
        rows: stackRows,
        cells: [
          [s0, p.full],
          [s1, p.full],
        ],
      };
    }
    case layoutKinds.bandSplit: {
      const [s0, s1] = p.split;
      const flex = flexIndex(p.split);
      const splitCols = p.split.map((pane, i) =>
        i === flex ? gridTracks.flexible : colTrack(pane),
      );
      const bandRow = rowTrack(p.full);
      const splitHasChat = p.split.includes(paneIds.chat);
      const splitRow = splitHasChat
        ? gridTracks.flexible
        : rowTrack(s0 === paneIds.chat ? s1 : s0);
      const bandRowCells = [p.full, p.full];
      const splitRowCells = [s0, s1];
      if (p.band === bands.top) {
        return {
          cols: splitCols,
          rows: [bandRow, splitRow],
          cells: [bandRowCells, splitRowCells],
        };
      }
      return {
        cols: splitCols,
        rows: [splitRow, bandRow],
        cells: [splitRowCells, bandRowCells],
      };
    }
  }
}

function serializeGrid(g: GridModel): {
  columns: string;
  rows: string;
  areas: string[];
} {
  return {
    columns: g.cols.join(" "),
    rows: g.rows.join(" "),
    areas: g.cells.map((row) => `"${row.join(" ")}"`),
  };
}

export function placementCss(p: ShellPlacement): string {
  const grid = serializeGrid(placementGrid(p));
  const key = placementKey(p);
  const selector = `.main[data-shell-layout="${key}"]`;
  return [
    `${selector} {`,
    `  grid-template-columns: ${grid.columns};`,
    `  grid-template-rows: ${grid.rows};`,
    `  grid-template-areas: ${grid.areas.join(" ")};`,
    `}`,
  ].join("\n");
}

/** Mini grid template for rendering a placement diagram in the picker.
 *  Relative arrangement only, not real proportions. */
function placementPreviewGrid(p: ShellPlacement): {
  columns: string;
  rows: string;
  areas: string;
} {
  const grid = serializeGrid(placementGrid(p));
  const colCount = (grid.areas[0] ?? "")
    .replace(/"/g, "")
    .trim()
    .split(/\s+/).length;
  return {
    columns: new Array(colCount).fill(gridTracks.unit).join(" "),
    rows: grid.areas.map(() => gridTracks.unit).join(" "),
    areas: grid.areas.join(" "),
  };
}

function permutations3(items: readonly PaneId[]): [PaneId, PaneId, PaneId][] {
  const out: [PaneId, PaneId, PaneId][] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        if (i === j || i === k || j === k) continue;
        const a = items[i];
        const b = items[j];
        const c = items[k];
        if (a === undefined || b === undefined || c === undefined) continue;
        out.push([a, b, c]);
      }
    }
  }
  return out;
}

/** All concrete placements for a split pattern (6 columns, 6 rows, 12 side-
 *  stack, 12 band-split → 36 total). Drives the picker's diagram grid. */
export function enumeratePlacements(
  kind: ShellPlacement["kind"],
): ShellPlacement[] {
  switch (kind) {
    case layoutKinds.columns:
      return permutations3(PANE_IDS).map((slots) => ({ kind, slots }));
    case layoutKinds.rows:
      return permutations3(PANE_IDS).map((slots) => ({ kind, slots }));
    case layoutKinds.sideStack: {
      const out: ShellPlacement[] = [];
      for (const side of SIDE_VALUES) {
        for (const full of PANE_IDS) {
          const [r0, r1] = PANE_IDS.filter((x) => x !== full);
          if (r0 === undefined || r1 === undefined) continue;
          for (const stack of [
            [r0, r1],
            [r1, r0],
          ] as [PaneId, PaneId][]) {
            out.push({ kind, side, full, stack });
          }
        }
      }
      return out;
    }
    case layoutKinds.bandSplit: {
      const out: ShellPlacement[] = [];
      for (const band of BAND_VALUES) {
        for (const full of PANE_IDS) {
          const [r0, r1] = PANE_IDS.filter((x) => x !== full);
          if (r0 === undefined || r1 === undefined) continue;
          for (const split of [
            [r0, r1],
            [r1, r0],
          ] as [PaneId, PaneId][]) {
            out.push({ kind, band, full, split });
          }
        }
      }
      return out;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Resizer geometry                                                    */
/* ------------------------------------------------------------------ */

export function paneGeometry(
  p: ShellPlacement,
  pane: PaneId,
): PaneGeometry | null {
  if (pane === paneIds.chat) return null;
  switch (p.kind) {
    case layoutKinds.columns: {
      const idx = p.slots.indexOf(pane);
      const chatIdx = p.slots.indexOf(paneIds.chat);
      const before = idx < chatIdx;
      return {
        axis: geometryAxes.col,
        edge: before ? geometryEdges.right : geometryEdges.left,
        sign: before ? 1 : -1,
      };
    }
    case layoutKinds.rows: {
      const idx = p.slots.indexOf(pane);
      const chatIdx = p.slots.indexOf(paneIds.chat);
      const before = idx < chatIdx;
      return {
        axis: geometryAxes.row,
        edge: before ? geometryEdges.bottom : geometryEdges.top,
        sign: before ? 1 : -1,
      };
    }
    case layoutKinds.sideStack: {
      if (pane === p.full) {
        const fullLeft = p.side === sides.left;
        return {
          axis: geometryAxes.col,
          edge: fullLeft ? geometryEdges.right : geometryEdges.left,
          sign: fullLeft ? 1 : -1,
        };
      }
      const idx = p.stack.indexOf(pane);
      const flex = flexIndex(p.stack);
      if (idx === flex) return null;
      const before = idx < flex;
      return {
        axis: geometryAxes.row,
        edge: before ? geometryEdges.bottom : geometryEdges.top,
        sign: before ? 1 : -1,
      };
    }
    case layoutKinds.bandSplit: {
      if (pane === p.full) {
        const fullTop = p.band === bands.top;
        return {
          axis: geometryAxes.row,
          edge: fullTop ? geometryEdges.bottom : geometryEdges.top,
          sign: fullTop ? 1 : -1,
        };
      }
      const idx = p.split.indexOf(pane);
      const flex = flexIndex(p.split);
      if (idx === flex) return null;
      const before = idx < flex;
      return {
        axis: geometryAxes.col,
        edge: before ? geometryEdges.right : geometryEdges.left,
        sign: before ? 1 : -1,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Persistence + live application                                      */
/* ------------------------------------------------------------------ */

const STYLE_ELEMENT_ID = "fmark-shell-layout";
const subscribers = new Set<(p: ShellPlacement) => void>();

function safeStorageGet(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
function safeStorageSet(value: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    /* swallow */
  }
}

export function getCurrentPlacement(): ShellPlacement {
  const raw = safeStorageGet();
  if (raw === null) return DEFAULT_PLACEMENT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isShellPlacement(parsed) ? parsed : DEFAULT_PLACEMENT;
  } catch {
    return DEFAULT_PLACEMENT;
  }
}

export function applyPlacement(
  p: ShellPlacement,
  opts: { persist?: boolean } = {},
): void {
  const doc = globalThis.document;
  if (doc !== undefined) {
    let style = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (style === null) {
      style = doc.createElement("style");
      style.id = STYLE_ELEMENT_ID;
      doc.head.appendChild(style);
    }
    style.textContent = placementCss(p);
  }
  if (opts.persist !== false) safeStorageSet(JSON.stringify(p));
  for (const cb of subscribers) {
    try {
      cb(p);
    } catch {
      /* swallow */
    }
  }
}

export function subscribePlacement(
  cb: (p: ShellPlacement) => void,
): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Live-apply pane-arrangement changes from OTHER tabs (X6). Re-injects the
 *  generated grid rule + notifies subscribers (useShellPlacement, Appearance)
 *  without re-persisting (the value is already in localStorage). */
let placementStorageListening = false;
export function startPlacementStorageSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (placementStorageListening) return () => {};
  placementStorageListening = true;
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    applyPlacement(getCurrentPlacement(), { persist: false });
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    placementStorageListening = false;
  };
}
