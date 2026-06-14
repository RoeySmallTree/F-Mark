import { cleanup, render, screen, within } from "@testing-library/react";
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

import { RightPanel } from "../../src/shell/RightPanel.js";
import { RightLayout } from "../../src/panels/right/RightLayout.js";
import {
  DEFAULT_RIGHT_TABS_CONFIG,
  RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY,
  RIGHT_TABS_CONFIG_STORAGE_KEY,
  isOnlyEnabledRightTab,
  reorderRightTabsConfig,
  resolveRightTabsConfig,
  toggleRightTabsConfig,
  useStore,
  type RightTabConfig,
} from "../../src/state/store.js";
import { resetStore, SESSION_META } from "../cards/_helpers.js";

function seedConfig(overrides: {
  global?: RightTabConfig;
  bySession?: Record<string, RightTabConfig>;
}): void {
  useStore.setState({
    rightTabsConfig: overrides.global ?? DEFAULT_RIGHT_TABS_CONFIG,
    rightTabsConfigBySession: overrides.bySession ?? {},
  });
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

describe("RightPanel — resolved config drives the strip", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });

  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("disabled tabs are hidden; Layout button is always present", () => {
    seedConfig({
      global: DEFAULT_RIGHT_TABS_CONFIG.map((e) => ({
        key: e.key,
        enabled: e.key !== "comments",
      })),
    });
    render(<RightPanel />);
    const tablist = screen.getByRole("tablist", { name: /Right panel tabs/i });
    /* Comments is hidden. */
    expect(within(tablist).queryByRole("tab", { name: /Comments/i })).toBeNull();
    /* Other tabs render. */
    expect(within(tablist).getByRole("tab", { name: /Todos/i })).toBeTruthy();
    expect(within(tablist).getByRole("tab", { name: /Layout settings/i })).toBeTruthy();
  });

  test("per-session override beats global", () => {
    /* Global hides Comments; per-session override re-enables it. */
    const sessionOverride = DEFAULT_RIGHT_TABS_CONFIG.map((e) => ({
      key: e.key,
      enabled: true,
    }));
    seedConfig({
      global: DEFAULT_RIGHT_TABS_CONFIG.map((e) => ({
        key: e.key,
        enabled: e.key !== "comments",
      })),
      bySession: { [SESSION_META.id]: sessionOverride },
    });
    render(<RightPanel />);
    const tablist = screen.getByRole("tablist", { name: /Right panel tabs/i });
    expect(within(tablist).getByRole("tab", { name: /Comments/i })).toBeTruthy();
  });

  test("disabling the active tab falls back to first enabled", async () => {
    seedConfig({});
    useStore.setState({ rightTab: "comments" });
    render(<RightPanel />);
    /* Now disable comments globally. The fallback effect should switch
       rightTab to "todos" (the first remaining enabled tab). */
    seedConfig({
      global: DEFAULT_RIGHT_TABS_CONFIG.map((e) => ({
        key: e.key,
        enabled: e.key !== "comments",
      })),
    });
    /* Effect runs on next React commit. */
    await Promise.resolve();
    expect(useStore.getState().rightTab).toBe("todos");
  });
});

describe("RightLayout — UI writes through to store + localStorage", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
    seedConfig({});
  });

  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("toggling a tab in Global mode persists to global config", async () => {
    const user = userEvent.setup();
    render(<RightLayout />);
    const commentsRow = document.querySelector(
      '[data-tab-key="comments"]',
    ) as HTMLElement;
    expect(commentsRow).toBeTruthy();
    const toggle = within(commentsRow).getByRole("switch", {
      name: /Show Comments tab/i,
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    const stored = JSON.parse(
      globalThis.localStorage!.getItem(RIGHT_TABS_CONFIG_STORAGE_KEY)!,
    ) as Array<{ key: string; enabled: boolean }>;
    expect(stored.find((e) => e.key === "comments")?.enabled).toBe(false);
    expect(useStore.getState().rightTabsConfigBySession).toEqual({});
  });

  test("editing in This session mode creates a per-session override", async () => {
    const user = userEvent.setup();
    render(<RightLayout />);
    await user.click(screen.getByRole("tab", { name: /This session/i }));
    const todosRow = document.querySelector(
      '[data-tab-key="todos"]',
    ) as HTMLElement;
    const toggle = within(todosRow).getByRole("switch", {
      name: /Show Todos tab/i,
    });
    await user.click(toggle);
    const bySession = useStore.getState().rightTabsConfigBySession;
    expect(bySession[SESSION_META.id]).toBeTruthy();
    expect(
      bySession[SESSION_META.id]!.find((e) => e.key === "todos")?.enabled,
    ).toBe(false);
    /* Global config untouched. */
    expect(
      useStore.getState().rightTabsConfig.find((e) => e.key === "todos")
        ?.enabled,
    ).toBe(true);
    /* Reset link appears and clears the override. */
    const reset = screen.getByRole("button", { name: /Reset to global/i });
    await user.click(reset);
    expect(
      JSON.parse(
        globalThis.localStorage!.getItem(
          RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY,
        ) ?? "{}",
      ),
    ).toEqual({});
  });
});
