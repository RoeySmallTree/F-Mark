/**
 * Shell placement engine — lets the user arrange the three movable panes
 * (`leftPanel`, `chat`, `rightPanel`) in any of 36 "guillotine" layouts:
 * columns, rows, a full-height side pane with the other two stacked, or a
 * full-width band pane with the other two side-by-side.
 *
 * The `LeftRail` (48px icon nav) is pinned to the physical left edge in every
 * layout — only the three content panes move.
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

export const RAIL_TRACK = "48px";

export const PANE_IDS: PaneId[] = ["leftPanel", "chat", "rightPanel"];

export const DEFAULT_PLACEMENT: ShellPlacement = {
  kind: "columns",
  slots: ["leftPanel", "chat", "rightPanel"],
};

/** Picker metadata — the four split patterns the user chooses between. */
export const SHELL_LAYOUT_KINDS: {
  kind: ShellPlacement["kind"];
  label: string;
  description: string;
}[] = [
  {
    kind: "columns",
    label: "Columns",
    description: "Three panes side by side (the classic layout).",
  },
  {
    kind: "rows",
    label: "Rows",
    description: "Three panes stacked top to bottom.",
  },
  {
    kind: "side-stack",
    label: "Side stack",
    description: "One full-height pane beside the other two, stacked.",
  },
  {
    kind: "band-split",
    label: "Top / bottom split",
    description: "One full-width pane above or below the other two.",
  },
];

/* ------------------------------------------------------------------ */
/* Size CSS variables (set per-session by the store)                   */
/* ------------------------------------------------------------------ */

const DEFAULT_WIDTH: Record<Exclude<PaneId, "chat">, number> = {
  leftPanel: 288,
  rightPanel: 340,
};
const DEFAULT_HEIGHT: Record<Exclude<PaneId, "chat">, number> = {
  leftPanel: 260,
  rightPanel: 300,
};

export function widthVar(pane: PaneId): string {
  return `--pane-w-${pane}`;
}
export function heightVar(pane: PaneId): string {
  return `--pane-h-${pane}`;
}

function colTrack(pane: PaneId): string {
  if (pane === "chat") return "minmax(0, 1fr)";
  return `var(${widthVar(pane)}, ${DEFAULT_WIDTH[pane]}px)`;
}
function rowTrack(pane: PaneId): string {
  if (pane === "chat") return "minmax(0, 1fr)";
  return `var(${heightVar(pane)}, ${DEFAULT_HEIGHT[pane]}px)`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function isPaneId(v: unknown): v is PaneId {
  return v === "leftPanel" || v === "chat" || v === "rightPanel";
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
    case "columns":
    case "rows":
      return Array.isArray(p.slots) && isExactPaneSet(p.slots);
    case "side-stack":
      return (
        (p.side === "left" || p.side === "right") &&
        isPaneId(p.full) &&
        Array.isArray(p.stack) &&
        isExactPaneSet([p.full, ...p.stack])
      );
    case "band-split":
      return (
        (p.band === "top" || p.band === "bottom") &&
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
    case "columns":
      return `columns:${p.slots.join("-")}`;
    case "rows":
      return `rows:${p.slots.join("-")}`;
    case "side-stack":
      return `side-stack:${p.side}:${p.full}:${p.stack.join("-")}`;
    case "band-split":
      return `band-split:${p.band}:${p.full}:${p.split.join("-")}`;
  }
}

/** Index of the stack/split member that absorbs free space (chat if present,
 *  otherwise the second member). */
function flexIndex(pair: [PaneId, PaneId]): number {
  const chatIdx = pair.indexOf("chat");
  return chatIdx === -1 ? 1 : chatIdx;
}

interface Grid {
  columns: string;
  rows: string;
  areas: string[];
}

function placementGrid(p: ShellPlacement): Grid {
  switch (p.kind) {
    case "columns": {
      const [a, b, c] = p.slots;
      return {
        columns: `${RAIL_TRACK} ${colTrack(a)} ${colTrack(b)} ${colTrack(c)}`,
        rows: "minmax(0, 1fr)",
        areas: [`"rail ${a} ${b} ${c}"`],
      };
    }
    case "rows": {
      const [a, b, c] = p.slots;
      return {
        columns: `${RAIL_TRACK} minmax(0, 1fr)`,
        rows: `${rowTrack(a)} ${rowTrack(b)} ${rowTrack(c)}`,
        areas: [`"rail ${a}"`, `"rail ${b}"`, `"rail ${c}"`],
      };
    }
    case "side-stack": {
      const [s0, s1] = p.stack;
      const flex = flexIndex(p.stack);
      const stackRows = p.stack
        .map((pane, i) => (i === flex ? "minmax(0, 1fr)" : rowTrack(pane)))
        .join(" ");
      // Stack column: flexible if it holds chat, else the first member's width.
      const stackHasChat = p.stack.includes("chat");
      const stackCol = stackHasChat
        ? "minmax(0, 1fr)"
        : colTrack(s0 === "chat" ? s1 : s0);
      if (p.side === "left") {
        return {
          columns: `${RAIL_TRACK} ${colTrack(p.full)} ${stackCol}`,
          rows: stackRows,
          areas: [`"rail ${p.full} ${s0}"`, `"rail ${p.full} ${s1}"`],
        };
      }
      return {
        columns: `${RAIL_TRACK} ${stackCol} ${colTrack(p.full)}`,
        rows: stackRows,
        areas: [`"rail ${s0} ${p.full}"`, `"rail ${s1} ${p.full}"`],
      };
    }
    case "band-split": {
      const [s0, s1] = p.split;
      const flex = flexIndex(p.split);
      const splitCols = p.split
        .map((pane, i) => (i === flex ? "minmax(0, 1fr)" : colTrack(pane)))
        .join(" ");
      const bandRow = rowTrack(p.full);
      const splitHasChat = p.split.includes("chat");
      const splitRow = splitHasChat
        ? "minmax(0, 1fr)"
        : rowTrack(s0 === "chat" ? s1 : s0);
      const bandArea = `"rail ${p.full} ${p.full}"`;
      const splitArea = `"rail ${s0} ${s1}"`;
      if (p.band === "top") {
        return {
          columns: `${RAIL_TRACK} ${splitCols}`,
          rows: `${bandRow} ${splitRow}`,
          areas: [bandArea, splitArea],
        };
      }
      return {
        columns: `${RAIL_TRACK} ${splitCols}`,
        rows: `${splitRow} ${bandRow}`,
        areas: [splitArea, bandArea],
      };
    }
  }
}

export function placementCss(p: ShellPlacement): string {
  const grid = placementGrid(p);
  const key = placementKey(p);
  return [
    `.main[data-shell-layout="${key}"] {`,
    `  grid-template-columns: ${grid.columns};`,
    `  grid-template-rows: ${grid.rows};`,
    `  grid-template-areas: ${grid.areas.join(" ")};`,
    `}`,
  ].join("\n");
}

/** Mini grid template (uniform tracks + thin rail) for rendering a placement
 *  diagram in the picker. Relative arrangement only, not real proportions. */
export function placementPreviewGrid(p: ShellPlacement): {
  columns: string;
  rows: string;
  areas: string;
} {
  const grid = placementGrid(p);
  const colCount = (grid.areas[0] ?? "")
    .replace(/"/g, "")
    .trim()
    .split(/\s+/).length;
  return {
    columns: ["8px", ...new Array(colCount - 1).fill("1fr")].join(" "),
    rows: grid.areas.map(() => "1fr").join(" "),
    areas: grid.areas.join(" "),
  };
}

function permutations3(items: PaneId[]): [PaneId, PaneId, PaneId][] {
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
    case "columns":
      return permutations3(PANE_IDS).map((slots) => ({ kind, slots }));
    case "rows":
      return permutations3(PANE_IDS).map((slots) => ({ kind, slots }));
    case "side-stack": {
      const out: ShellPlacement[] = [];
      for (const side of ["left", "right"] as const) {
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
    case "band-split": {
      const out: ShellPlacement[] = [];
      for (const band of ["top", "bottom"] as const) {
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
  if (pane === "chat") return null;
  switch (p.kind) {
    case "columns": {
      const idx = p.slots.indexOf(pane);
      const chatIdx = p.slots.indexOf("chat");
      const before = idx < chatIdx;
      return {
        axis: "col",
        edge: before ? "right" : "left",
        sign: before ? 1 : -1,
      };
    }
    case "rows": {
      const idx = p.slots.indexOf(pane);
      const chatIdx = p.slots.indexOf("chat");
      const before = idx < chatIdx;
      return {
        axis: "row",
        edge: before ? "bottom" : "top",
        sign: before ? 1 : -1,
      };
    }
    case "side-stack": {
      if (pane === p.full) {
        const fullLeft = p.side === "left";
        return {
          axis: "col",
          edge: fullLeft ? "right" : "left",
          sign: fullLeft ? 1 : -1,
        };
      }
      const idx = p.stack.indexOf(pane);
      const flex = flexIndex(p.stack);
      if (idx === flex) return null;
      const before = idx < flex;
      return {
        axis: "row",
        edge: before ? "bottom" : "top",
        sign: before ? 1 : -1,
      };
    }
    case "band-split": {
      if (pane === p.full) {
        const fullTop = p.band === "top";
        return {
          axis: "row",
          edge: fullTop ? "bottom" : "top",
          sign: fullTop ? 1 : -1,
        };
      }
      const idx = p.split.indexOf(pane);
      const flex = flexIndex(p.split);
      if (idx === flex) return null;
      const before = idx < flex;
      return {
        axis: "col",
        edge: before ? "right" : "left",
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

export function applyPlacement(p: ShellPlacement): void {
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
  safeStorageSet(JSON.stringify(p));
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
