import { describe, it, expect, beforeEach } from "vitest";
import {
  CURRENT_DOCK_LAYOUT_VERSION,
  DEFAULT_DOCK_LAYOUT,
  DOCK_PANES,
  getCurrentDockLayout,
  migrateDockLayoutOnce,
  moveDockPane,
  surfaceFileDisplayInDock,
  type DockLayout,
} from "./dockLayout.js";

const KEY = "fmark.dockLayout";

function readStored(): { version?: number } & DockLayout {
  return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
}

function storeV1(
  areas: Record<string, string[]>,
  active: Record<string, string>,
): void {
  // v1 = no `version` field.
  window.localStorage.setItem(KEY, JSON.stringify({ areas, active }));
}

const RIGHT_DEFAULT = ["todos", "comments", "named", "agents", "log", "files"];

beforeEach(() => {
  window.localStorage.clear();
});

describe("dock layout v4 default", () => {
  it("places filesDisplay in center beside messages, search stowed in toolbar", () => {
    expect(CURRENT_DOCK_LAYOUT_VERSION).toBe(4);
    expect(DEFAULT_DOCK_LAYOUT.areas.right).toContain("terminal");
    expect(DEFAULT_DOCK_LAYOUT.areas.center).toEqual([
      "messages",
      "filesDisplay",
    ]);
    expect(DEFAULT_DOCK_LAYOUT.areas.toolbar).toEqual(["search"]);
    expect(DEFAULT_DOCK_LAYOUT.active.center).toBe("messages");
  });

  it("getCurrentDockLayout returns the v3 default on a fresh install", () => {
    const layout = getCurrentDockLayout();
    expect(layout.areas.center).toContain("filesDisplay");
    expect(layout.areas.right).toContain("terminal");
    expect(layout.active.center).toBe("messages");
  });
});

describe("migrateDockLayoutOnce", () => {
  it("re-homes a toolbar-parked filesDisplay into center after messages, stamps v3", () => {
    storeV1(
      {
        left: ["sessions"],
        center: ["messages"],
        right: RIGHT_DEFAULT,
        bottom: [],
        toolbar: ["search", "filesDisplay"],
      },
      { left: "sessions", center: "messages", right: "log" },
    );
    migrateDockLayoutOnce();
    const stored = readStored();
    expect(stored.version).toBe(4);
    expect(stored.areas.center).toEqual(["messages", "filesDisplay"]);
    expect(stored.areas.toolbar).not.toContain("filesDisplay");
    expect(stored.active.center).toBe("messages");
    // v3 step also surfaces the Terminal pane in the right dock.
    expect(stored.areas.right).toContain("terminal");
  });

  it("v2 → v3 appends the Terminal pane to the right dock", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        areas: {
          left: ["sessions"],
          center: ["messages", "filesDisplay"],
          right: RIGHT_DEFAULT,
          bottom: [],
          toolbar: ["search"],
        },
        active: { left: "sessions", center: "messages", right: "log" },
      }),
    );
    migrateDockLayoutOnce();
    const stored = readStored();
    expect(stored.version).toBe(4);
    expect(stored.areas.right).toContain("terminal");
    // filesDisplay was already placed → untouched.
    expect(stored.areas.center).toEqual(["messages", "filesDisplay"]);
  });

  it("does NOT move a filesDisplay the user already placed in a visible area", () => {
    storeV1(
      {
        left: ["sessions"],
        center: ["messages"],
        right: ["filesDisplay", ...RIGHT_DEFAULT],
        bottom: [],
        toolbar: ["search"],
      },
      { left: "sessions", center: "messages", right: "filesDisplay" },
    );
    migrateDockLayoutOnce();
    const stored = readStored();
    expect(stored.version).toBe(4);
    expect(stored.areas.right).toContain("filesDisplay");
    expect(stored.areas.center).not.toContain("filesDisplay");
  });

  it("is a byte-for-byte no-op for an already-v4 layout", () => {
    const v4 = JSON.stringify({
      version: 4,
      areas: {
        left: ["sessions"],
        center: ["messages", "filesDisplay"],
        right: [...RIGHT_DEFAULT, "diffTree", "terminal"],
        bottom: [],
        toolbar: ["search"],
      },
      active: { left: "sessions", center: "messages", right: "log" },
    });
    window.localStorage.setItem(KEY, v4);
    migrateDockLayoutOnce();
    expect(window.localStorage.getItem(KEY)).toBe(v4);
  });

  it("does nothing on a fresh install (no stored layout)", () => {
    migrateDockLayoutOnce();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("surfaceFileDisplayInDock", () => {
  it("activates filesDisplay where it already lives (center)", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        areas: {
          left: ["sessions"],
          center: ["messages", "filesDisplay"],
          right: RIGHT_DEFAULT,
          bottom: [],
          toolbar: ["search"],
        },
        active: { left: "sessions", center: "messages", right: "log" },
      }),
    );
    surfaceFileDisplayInDock();
    expect(getCurrentDockLayout().active.center).toBe("filesDisplay");
  });

  it("re-homes a toolbar-parked filesDisplay into center and activates it", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        areas: {
          left: ["sessions"],
          center: ["messages"],
          right: RIGHT_DEFAULT,
          bottom: [],
          toolbar: ["search", "filesDisplay"],
        },
        active: { left: "sessions", center: "messages", right: "log" },
      }),
    );
    surfaceFileDisplayInDock();
    const layout = getCurrentDockLayout();
    expect(layout.areas.center).toContain("filesDisplay");
    expect(layout.active.center).toBe("filesDisplay");
  });
});

describe("moveDockPane", () => {
  it("moves one inactive pane without disturbing the source area's active tab", () => {
    const layout = moveDockPane(
      DEFAULT_DOCK_LAYOUT,
      "comments",
      "center",
      "filesDisplay",
    );

    expect(layout.areas.center).toEqual([
      "messages",
      "comments",
      "filesDisplay",
    ]);
    expect(layout.areas.right).toEqual([
      "todos",
      "named",
      "agents",
      "log",
      "files",
      "diffTree",
      "terminal",
    ]);
    expect(layout.active.center).toBe("comments");
    expect(layout.active.right).toBe("log");
  });

  it("falls back to the nearest source-area neighbor when the moved pane was active", () => {
    const layout = moveDockPane(DEFAULT_DOCK_LAYOUT, "log", "center");

    expect(layout.areas.right).toEqual([
      "todos",
      "comments",
      "named",
      "agents",
      "files",
      "diffTree",
      "terminal",
    ]);
    expect(layout.areas.center).toEqual([
      "messages",
      "filesDisplay",
      "log",
    ]);
    expect(layout.active.right).toBe("files");
    expect(layout.active.center).toBe("log");
  });

  it("restores the neighbor tab when a temporary active pane leaves an area", () => {
    const movedIn = moveDockPane(DEFAULT_DOCK_LAYOUT, "search", "right", "log");
    const movedOut = moveDockPane(movedIn, "search", "center", "filesDisplay");

    expect(movedIn.active.right).toBe("search");
    expect(movedOut.areas.right).toEqual([
      "todos",
      "comments",
      "named",
      "agents",
      "log",
      "files",
      "diffTree",
      "terminal",
    ]);
    expect(movedOut.active.right).toBe("log");
    expect(movedOut.active.center).toBe("search");
  });

  it("does not reorder or duplicate a pane when it is dropped onto itself", () => {
    const layout = moveDockPane(DEFAULT_DOCK_LAYOUT, "log", "right", "log");

    expect(layout).toEqual(DEFAULT_DOCK_LAYOUT);
    for (const pane of DOCK_PANES) {
      const placements = Object.values(layout.areas).filter((panes) =>
        panes.includes(pane),
      );
      expect(placements).toHaveLength(1);
    }
  });

  it("supports moving chat into the right pane as a real right-side tab", () => {
    const layout = moveDockPane(
      DEFAULT_DOCK_LAYOUT,
      "messages",
      "right",
      "comments",
    );

    expect(layout.areas.center).toEqual(["filesDisplay"]);
    expect(layout.areas.right).toEqual([
      "todos",
      "messages",
      "comments",
      "named",
      "agents",
      "log",
      "files",
      "diffTree",
      "terminal",
    ]);
    expect(layout.active.center).toBe("filesDisplay");
    expect(layout.active.right).toBe("messages");
  });

  it("moves an active right pane to the bottom without disturbing other panes", () => {
    const layout = moveDockPane(DEFAULT_DOCK_LAYOUT, "log", "bottom");

    expect(layout.areas.bottom).toEqual(["log"]);
    expect(layout.areas.right).toEqual([
      "todos",
      "comments",
      "named",
      "agents",
      "files",
      "diffTree",
      "terminal",
    ]);
    expect(layout.areas.center).toEqual(["messages", "filesDisplay"]);
    expect(layout.active.bottom).toBe("log");
    expect(layout.active.right).toBe("files");
    expect(layout.active.center).toBe("messages");
  });
});
