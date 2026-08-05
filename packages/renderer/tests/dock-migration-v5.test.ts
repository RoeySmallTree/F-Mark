import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  CURRENT_DOCK_LAYOUT_VERSION,
  getCurrentDockLayout,
  migrateDockLayoutOnce,
} from "../src/shell/dockLayout.js";

/* v4 -> v5 removed the "toolbar" stow area from the shell: ToolbarDockTabs was
   the only surface that drew it and went with the rest of the window manager.
   The v4 DEFAULT put `search` in `toolbar`, so essentially every existing
   install has a pane parked there. Without a migration step normalizeLayout
   preserves it, the layout is re-stamped v5, and Search disappears with no
   affordance to bring it back. */

const KEY = "fmark.dockLayout";

/* Node 22 exposes a native `localStorage` that shadows jsdom's and lacks the
   Storage prototype methods, so `.clear()` throws under this runner. The
   module under test only needs get/set/remove, so the test brings its own
   in-memory Storage rather than depending on which one wins. */
function installMemoryStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => void map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  });
}

function storeV4(toolbar: string[]): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      version: 4,
      areas: {
        left: ["sessions"],
        center: ["messages", "filesDisplay"],
        right: ["todos", "comments", "named", "agents", "log", "files", "diffTree", "terminal"],
        bottom: [],
        toolbar,
      },
      active: { left: "sessions", center: "messages", right: "log" },
    }),
  );
}

describe("dock layout v4 -> v5 migration", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  test("a pane stowed in the toolbar is moved to the right rail, not stranded", () => {
    storeV4(["search"]);
    migrateDockLayoutOnce();
    const layout = getCurrentDockLayout();
    expect(layout.areas.toolbar).toEqual([]);
    expect(layout.areas.right).toContain("search");
  });

  test("the migration is stamped so it does not run twice", () => {
    storeV4(["search"]);
    migrateDockLayoutOnce();
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(stored.version).toBe(CURRENT_DOCK_LAYOUT_VERSION);
  });

  test("a pane already visible elsewhere is not duplicated into the rail", () => {
    /* Someone who had dragged Search into the left pane AND left a copy stowed
       must not end up with it listed twice. */
    const raw = JSON.parse(
      JSON.stringify({
        version: 4,
        areas: {
          left: ["sessions", "search"],
          center: ["messages"],
          right: ["todos"],
          bottom: [],
          toolbar: ["search"],
        },
        active: { left: "sessions", center: "messages", right: "todos" },
      }),
    );
    localStorage.setItem(KEY, JSON.stringify(raw));
    migrateDockLayoutOnce();
    const layout = getCurrentDockLayout();
    const total = (["left", "center", "right", "bottom", "toolbar"] as const)
      .flatMap((a) => layout.areas[a])
      .filter((p) => p === "search").length;
    expect(total).toBe(1);
    expect(layout.areas.toolbar).toEqual([]);
  });

  test("an empty toolbar is left untouched", () => {
    storeV4([]);
    migrateDockLayoutOnce();
    expect(getCurrentDockLayout().areas.toolbar).toEqual([]);
  });
});
