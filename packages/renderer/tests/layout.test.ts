import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_PLACEMENT,
  STORAGE_KEY,
  SHELL_LAYOUT_KINDS,
  applyPlacement,
  enumeratePlacements,
  getCurrentPlacement,
  isShellPlacement,
  paneGeometry,
  placementCss,
  placementKey,
  subscribePlacement,
  type ShellPlacement,
} from "../src/themes/layout.js";

/** Parse a `grid-template-areas: "..." "..."` declaration back into a matrix of
 *  area names, then assert every area occupies a contiguous rectangle (the rule
 *  CSS grid enforces — a malformed template silently drops the rule). */
function areasMatrix(css: string): string[][] {
  const decl = /grid-template-areas:\s*([^;]+);/.exec(css)?.[1] ?? "";
  return [...decl.matchAll(/"([^"]+)"/g)].map((m) =>
    (m[1] ?? "").trim().split(/\s+/),
  );
}
function assertRectangularAreas(css: string, label: string): void {
  const rows = areasMatrix(css);
  const width = rows[0]?.length ?? 0;
  expect(rows.every((r) => r.length === width), `${label}: ragged`).toBe(true);
  const names = new Set(rows.flat());
  for (const name of names) {
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;
    let count = 0;
    rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell !== name) return;
        count++;
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }),
    );
    const area = (maxR - minR + 1) * (maxC - minC + 1);
    expect(count, `${label}: area "${name}" not a filled rectangle`).toBe(area);
  }
}

const STYLE_ID = "fmark-shell-layout";

function styleText(): string {
  return document.getElementById(STYLE_ID)?.textContent ?? "";
}

const COLUMNS: ShellPlacement = {
  kind: "columns",
  slots: ["leftPanel", "chat", "rightPanel"],
};
const ROWS: ShellPlacement = {
  kind: "rows",
  slots: ["leftPanel", "chat", "rightPanel"],
};
const SIDE_STACK: ShellPlacement = {
  kind: "side-stack",
  side: "left",
  full: "leftPanel",
  stack: ["chat", "rightPanel"],
};
const BAND_SPLIT: ShellPlacement = {
  kind: "band-split",
  band: "top",
  full: "chat",
  split: ["leftPanel", "rightPanel"],
};

describe("shell layout engine", () => {
  beforeEach(() => {
    localStorage.clear();
    document.getElementById(STYLE_ID)?.remove();
  });
  afterEach(() => {
    localStorage.clear();
    document.getElementById(STYLE_ID)?.remove();
  });

  test("DEFAULT_PLACEMENT reproduces today's layout (leftPanel | chat | rightPanel)", () => {
    expect(DEFAULT_PLACEMENT).toEqual(COLUMNS);
  });

  test("SHELL_LAYOUT_KINDS lists the four split patterns with labels", () => {
    expect(SHELL_LAYOUT_KINDS.map((k) => k.kind)).toEqual([
      "columns",
      "rows",
      "side-stack",
      "band-split",
    ]);
    for (const k of SHELL_LAYOUT_KINDS) {
      expect(k.label.length).toBeGreaterThan(0);
    }
  });

  test("placementKey is deterministic per family", () => {
    expect(placementKey(COLUMNS)).toBe("columns:leftPanel-chat-rightPanel");
    expect(placementKey(ROWS)).toBe("rows:leftPanel-chat-rightPanel");
    expect(placementKey(SIDE_STACK)).toBe(
      "side-stack:left:leftPanel:chat-rightPanel",
    );
    expect(placementKey(BAND_SPLIT)).toBe(
      "band-split:top:chat:leftPanel-rightPanel",
    );
  });

  test("placementCss(columns) puts chat on the flexible track and orders areas", () => {
    const css = placementCss(COLUMNS);
    expect(css).toContain(`[data-shell-layout="columns:leftPanel-chat-rightPanel"]`);
    expect(css).toContain(`grid-template-areas: "leftPanel chat rightPanel"`);
    expect(css).toContain("minmax(0, 1fr)");
    expect(css).not.toContain("rail");
  });

  test("placementCss(rows) stacks the three panes as rows", () => {
    const css = placementCss(ROWS);
    expect(css).toContain(`"leftPanel"`);
    expect(css).toContain(`"chat"`);
    expect(css).toContain(`"rightPanel"`);
    expect(css).toContain("minmax(0, 1fr)");
    expect(css).not.toContain("rail");
  });

  test("placementCss(side-stack) gives the full pane both rows", () => {
    const css = placementCss(SIDE_STACK);
    expect(css).toContain(`"leftPanel chat"`);
    expect(css).toContain(`"leftPanel rightPanel"`);
    expect(css).not.toContain("rail");
  });

  test("placementCss(band-split) spans the band pane across the content columns", () => {
    const css = placementCss(BAND_SPLIT);
    expect(css).toContain(`"chat chat"`);
    expect(css).toContain(`"leftPanel rightPanel"`);
    expect(css).not.toContain("rail");
  });

  test("paneGeometry: columns places resizers on the edge facing chat", () => {
    expect(paneGeometry(COLUMNS, "leftPanel")).toEqual({
      axis: "col",
      edge: "right",
      sign: 1,
    });
    expect(paneGeometry(COLUMNS, "rightPanel")).toEqual({
      axis: "col",
      edge: "left",
      sign: -1,
    });
    expect(paneGeometry(COLUMNS, "chat")).toBeNull();
  });

  test("paneGeometry: a panel placed to the RIGHT of chat resizes from its left edge", () => {
    const swapped: ShellPlacement = {
      kind: "columns",
      slots: ["chat", "rightPanel", "leftPanel"],
    };
    // rightPanel and leftPanel are both right of chat → left-edge, negative sign
    expect(paneGeometry(swapped, "rightPanel")?.edge).toBe("left");
    expect(paneGeometry(swapped, "rightPanel")?.sign).toBe(-1);
    expect(paneGeometry(swapped, "leftPanel")?.edge).toBe("left");
  });

  test("paneGeometry: rows uses row axis and top/bottom edges", () => {
    expect(paneGeometry(ROWS, "leftPanel")).toEqual({
      axis: "row",
      edge: "bottom",
      sign: 1,
    });
    expect(paneGeometry(ROWS, "rightPanel")).toEqual({
      axis: "row",
      edge: "top",
      sign: -1,
    });
  });

  test("isShellPlacement validates structure and pane uniqueness", () => {
    expect(isShellPlacement(COLUMNS)).toBe(true);
    expect(isShellPlacement(ROWS)).toBe(true);
    expect(isShellPlacement(SIDE_STACK)).toBe(true);
    expect(isShellPlacement(BAND_SPLIT)).toBe(true);
    expect(isShellPlacement(null)).toBe(false);
    expect(isShellPlacement({ kind: "columns", slots: ["chat", "chat", "x"] })).toBe(
      false,
    );
    expect(isShellPlacement({ kind: "nope" })).toBe(false);
    expect(
      isShellPlacement({ kind: "columns", slots: ["leftPanel", "chat"] }),
    ).toBe(false);
  });

  test("getCurrentPlacement returns DEFAULT when storage empty or corrupt", () => {
    expect(getCurrentPlacement()).toEqual(DEFAULT_PLACEMENT);
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(getCurrentPlacement()).toEqual(DEFAULT_PLACEMENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: "bogus" }));
    expect(getCurrentPlacement()).toEqual(DEFAULT_PLACEMENT);
  });

  test("getCurrentPlacement round-trips a stored placement", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ROWS));
    expect(getCurrentPlacement()).toEqual(ROWS);
  });

  test("applyPlacement injects the style rule, persists, and notifies", () => {
    const cb = vi.fn();
    const unsub = subscribePlacement(cb);

    applyPlacement(ROWS);
    expect(styleText()).toContain(placementKey(ROWS));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual(ROWS);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(ROWS);

    applyPlacement(SIDE_STACK);
    expect(styleText()).toContain(placementKey(SIDE_STACK));
    expect(cb).toHaveBeenCalledTimes(2);

    unsub();
    applyPlacement(COLUMNS);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test("applyPlacement emits the base grid rule (no extra-pane variant)", () => {
    applyPlacement(COLUMNS);
    const text = styleText();
    expect(text).toContain(
      `.main[data-shell-layout="columns:leftPanel-chat-rightPanel"] {`,
    );
    expect(text).not.toContain("data-has-extra");
  });

  test("every one of the 36 placements emits well-formed rectangular areas", () => {
    const kinds = SHELL_LAYOUT_KINDS.map((k) => k.kind);
    const all = kinds.flatMap((kind) => enumeratePlacements(kind));
    expect(all.length).toBe(36);
    for (const p of all) {
      const key = placementKey(p);
      assertRectangularAreas(placementCss(p), key);
      const cells = areasMatrix(placementCss(p)).flat();
      expect(cells, `${key}: chat dropped`).toContain("chat");
      // Chat keeps a flexible track on its axis.
      expect(placementCss(p), `${key}: chat not flexible`).toContain(
        "minmax(0, 1fr)",
      );
    }
  });
});
