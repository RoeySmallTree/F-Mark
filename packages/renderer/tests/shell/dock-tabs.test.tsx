import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  applyDockLayout,
  DEFAULT_DOCK_LAYOUT,
  getCurrentDockLayout,
  moveDockPane,
  resetDockLayout,
} from "../../src/shell/dockLayout.js";
import { CenterDockTabs } from "../../src/shell/topBar/CenterDockTabs.js";
import { LeftPanel } from "../../src/shell/LeftPanel.js";
import { ToolbarDockTabs } from "../../src/shell/topBar/ToolbarDockTabs.js";
import userEvent from "@testing-library/user-event";

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetDockLayout();
});

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
  resetDockLayout();
});

describe("relocatable dock tabs", () => {
  test("center still renders a draggable tab when only one pane remains", () => {
    const withoutMessages = moveDockPane(DEFAULT_DOCK_LAYOUT, "messages", "right");
    const singleCenter = moveDockPane(withoutMessages, "filesDisplay", "right");
    applyDockLayout(moveDockPane(singleCenter, "comments", "center"));

    render(<CenterDockTabs />);

    const tablist = screen.getByRole("tablist", { name: /Center pane tabs/i });
    expect(screen.getByRole("tab", { name: /Com/i })).toBeInTheDocument();
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /Com/i })).toHaveAttribute(
      "draggable",
      "true",
    );
  });

  test("left panel shows a draggable tab even for its default single pane", () => {
    render(<LeftPanel />);

    const tablist = screen.getByRole("tablist", { name: /Left pane tabs/i });
    expect(screen.getByRole("tab", { name: /Sess/i })).toBeInTheDocument();
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /Sess/i })).toHaveAttribute(
      "draggable",
      "true",
    );
  });

  test("toolbar-stowed panes render as draggable top-bar tabs", async () => {
    const user = userEvent.setup();
    render(<ToolbarDockTabs />);

    const tablist = screen.getByRole("tablist", { name: /Stowed pane tabs/i });
    const search = screen.getByRole("tab", { name: /Search pane/i });
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(search).toHaveAttribute("draggable", "true");
    expect(search).toHaveAttribute("data-dock-area", "toolbar");

    await user.click(search);

    const layout = getCurrentDockLayout();
    expect(layout.areas.toolbar).not.toContain("search");
    expect(layout.areas.left).toEqual(["sessions", "search"]);
    expect(layout.active.left).toBe("search");
  });
});
