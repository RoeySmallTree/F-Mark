import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/* The right-pane content components mount LoadingAnimation → PixelBlast
   → WebGL, which jsdom can't create. None of these tests actually exercise
   the panel bodies — we're testing the strip + Layout — so stub each body
   with a trivial element. */
vi.mock("../../src/panels/right/RightTodos.js", () => ({
  RightTodos: (): JSX.Element => <div data-stub="todos" />,
}));
vi.mock("../../src/panels/right/RightComments.js", () => ({
  RightComments: (): JSX.Element => <div data-stub="comments" />,
}));
vi.mock("../../src/panels/right/RightNamed.js", () => ({
  RightNamed: (): JSX.Element => <div data-stub="named" />,
}));
vi.mock("../../src/panels/right/RightAgents.js", () => ({
  RightAgents: (): JSX.Element => <div data-stub="agents" />,
}));
vi.mock("../../src/panels/right/RightLog.js", () => ({
  RightLog: (): JSX.Element => <div data-stub="log" />,
}));
vi.mock("../../src/panels/right/RightFiles.js", () => ({
  RightFiles: (): JSX.Element => <div data-stub="files" />,
}));
vi.mock("../../src/shell/MessagesPane.js", () => ({
  MessagesPane: (): JSX.Element => <div data-stub="messages" />,
}));

import { RightPanel } from "../../src/shell/RightPanel.js";
import { RightLayout } from "../../src/panels/right/RightLayout.js";
import {
  applyDockLayout,
  DEFAULT_DOCK_LAYOUT,
  getCurrentDockLayout,
  moveDockPane,
  resetDockLayout,
} from "../../src/shell/dockLayout.js";
import {
  DEFAULT_RIGHT_TABS_CONFIG,
  isOnlyEnabledRightTab,
  reorderRightTabsConfig,
  resolveRightTabsConfig,
  toggleRightTabsConfig,
  useStore,
  type RightTabConfig,
} from "../../src/state/store.js";
import { resetStore, SESSION_META } from "../cards/_helpers.js";

function createDragDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  const transfer = {
    dropEffect: "none" as DataTransfer["dropEffect"],
    effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[],
    clearData(format?: string): void {
      if (format === undefined) {
        values.clear();
      } else {
        values.delete(format);
      }
      transfer.types = Array.from(values.keys());
    },
    getData(format: string): string {
      return values.get(format) ?? "";
    },
    setData(format: string, data: string): void {
      values.set(format, data);
      transfer.types = Array.from(values.keys());
    },
    setDragImage(): void {
      /* jsdom has no native drag image support. */
    },
  };
  return transfer as unknown as DataTransfer;
}

describe("right-tabs config helpers (pure)", () => {
  test("reorderRightTabsConfig moves entry to the target slot", () => {
    const next = reorderRightTabsConfig(DEFAULT_RIGHT_TABS_CONFIG, "log", "todos");
    expect(next.map((e) => e.key)).toEqual([
      "log",
      "todos",
      "comments",
      "named",
      "agents",
      "files",
      "diffTree",
      "terminal",
    ]);
  });

  test("reorderRightTabsConfig is a no-op when from === to or key missing", () => {
    expect(reorderRightTabsConfig(DEFAULT_RIGHT_TABS_CONFIG, "log", "log")).toBe(
      DEFAULT_RIGHT_TABS_CONFIG,
    );
  });

  test("toggleRightTabsConfig flips the enabled flag", () => {
    const next = toggleRightTabsConfig(DEFAULT_RIGHT_TABS_CONFIG, "comments");
    const entry = next.find((e) => e.key === "comments");
    expect(entry?.enabled).toBe(false);
  });

  test("toggleRightTabsConfig refuses to disable the last enabled tab", () => {
    const onlyLog: RightTabConfig = DEFAULT_RIGHT_TABS_CONFIG.map((e) => ({
      key: e.key,
      enabled: e.key === "log",
    }));
    const next = toggleRightTabsConfig(onlyLog, "log");
    expect(next).toBe(onlyLog);
    expect(isOnlyEnabledRightTab(onlyLog, "log")).toBe(true);
  });

  test("resolveRightTabsConfig prefers per-session override", () => {
    const override: RightTabConfig = [
      { key: "log", enabled: true },
      { key: "todos", enabled: true },
      { key: "comments", enabled: true },
      { key: "named", enabled: true },
      { key: "agents", enabled: true },
      { key: "files", enabled: true },
      { key: "terminal", enabled: true },
    ];
    expect(
      resolveRightTabsConfig(
        DEFAULT_RIGHT_TABS_CONFIG,
        { "sess-A": override },
        "sess-A",
      ),
    ).toBe(override);
    expect(
      resolveRightTabsConfig(
        DEFAULT_RIGHT_TABS_CONFIG,
        { "sess-A": override },
        "sess-B",
      ),
    ).toBe(DEFAULT_RIGHT_TABS_CONFIG);
  });
});

describe("RightPanel — dock layout drives the strip", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetDockLayout();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
    resetDockLayout();
  });

  test("right strip renders the panes currently assigned to the right dock", () => {
    render(<RightPanel />);
    const tablist = screen.getByRole("tablist", { name: /Right panel tabs/i });

    expect(within(tablist).getByRole("tab", { name: /Todos/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Comments/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Log/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Terminal/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Layout settings/i })).toBeTruthy();
  });

  test("moving a right pane elsewhere removes only that tab from the right strip", () => {
    applyDockLayout(
      moveDockPane(getCurrentDockLayout(), "comments", "center"),
    );

    render(<RightPanel />);
    const tablist = screen.getByRole("tablist", { name: /Right panel tabs/i });

    expect(within(tablist).queryByRole("tab", { name: /Comments/i })).toBeNull();
    expect(within(tablist).getByRole("tab", { name: /Todos/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Log/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Terminal/i })).toBeTruthy();
  });

  test("moving chat into the right dock makes it a right-side tab", () => {
    applyDockLayout(
      moveDockPane(getCurrentDockLayout(), "messages", "right", "comments"),
    );

    render(<RightPanel />);
    const tablist = screen.getByRole("tablist", { name: /Right panel tabs/i });

    expect(within(tablist).getByRole("tab", { name: /Messages/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Comments/i })).toBeTruthy();
  });

  test("legacy right-tab state cannot hide an active non-legacy right pane", async () => {
    applyDockLayout(
      moveDockPane(getCurrentDockLayout(), "messages", "right", "comments"),
    );
    useStore.setState({ rightTab: "comments" });

    const { container } = render(<RightPanel />);
    await Promise.resolve();

    expect(screen.getByRole("tab", { name: /Messages/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(container.querySelector('[data-stub="messages"]')).not.toBeNull();
    expect(
      screen.queryByRole("tablist", { name: /Layout scope/i }),
    ).toBeNull();
  });
});

describe("RightLayout — unified pane arrangement editor", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetDockLayout();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
    resetDockLayout();
  });

  test("renders the unified pane arrangement controls", () => {
    render(<RightLayout />);

    expect(screen.getByLabelText(/Undocked pane list/i)).toBeTruthy();
    expect(screen.getByLabelText(/Current app layout/i)).toBeTruthy();
    expect(screen.getByLabelText(/Right dock area/i)).toBeTruthy();
  });

  test("dragging a toolbar pane places that one pane on screen", () => {
    render(<RightLayout />);

    const palette = screen.getByLabelText(/Undocked pane list/i);
    const searchTile = within(palette).getByRole("button", { name: /Search/i });
    const leftArea = screen.getByLabelText(/Left dock area/i);
    const dataTransfer = createDragDataTransfer();

    fireEvent.dragStart(searchTile, { dataTransfer });
    fireEvent.dragOver(leftArea, { dataTransfer });
    fireEvent.drop(leftArea, { dataTransfer });
    fireEvent.dragEnd(searchTile, { dataTransfer });

    const layout = getCurrentDockLayout();
    expect(layout.areas.left).toContain("search");
    expect(layout.areas.toolbar).not.toContain("search");
    expect(layout.areas.right).toEqual(DEFAULT_DOCK_LAYOUT.areas.right);
  });

  test("reset restores the default dock layout", async () => {
    const user = userEvent.setup();
    applyDockLayout(
      moveDockPane(getCurrentDockLayout(), "comments", "center"),
    );

    render(<RightLayout />);

    await user.click(screen.getByRole("button", { name: /^Reset$/i }));

    expect(getCurrentDockLayout()).toEqual(DEFAULT_DOCK_LAYOUT);
  });
});
