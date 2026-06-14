import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { TopBar } from "../src/shell/TopBar.js";
import { Feed } from "../src/shell/Feed.js";
import { LeftRail } from "../src/shell/LeftRail.js";
import { LeftPanel } from "../src/shell/LeftPanel.js";
import { RightPanel } from "../src/shell/RightPanel.js";
import { useStore } from "../src/state/store.js";
import type { SessionMeta } from "../src/api/client.js";
import { renderWithAgentSpawn } from "./agentSpawnProvider.js";

const shellCssPath = [
  path.join(process.cwd(), "src/shell/shell.css"),
  path.join(process.cwd(), "packages/renderer/src/shell/shell.css"),
].find((candidate) => existsSync(candidate));

if (shellCssPath === undefined) {
  throw new Error("Unable to locate shell.css for left-panel layout tests");
}

const SHELL_CSS = readFileSync(shellCssPath, "utf8");

const MOCK_SESSION: SessionMeta = {
  id: "2026-05-22-launch-planning",
  slug: "launch-planning",
  created_at: "2026-05-22T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function resetStore(): void {
  // Reset the zustand store to a known baseline for each test.
  useStore.setState({
    token: null,
    sessions: [MOCK_SESSION],
    currentSessionId: MOCK_SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
  });
}

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    SHELL_CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
  );
}

describe("Shell — TopBar", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders brand glyph, name, and breadcrumb with current session slug", () => {
    const { container } = renderWithAgentSpawn(<TopBar />);
    expect(screen.getByText("F·Mark")).toBeInTheDocument();
    const breadcrumb = container.querySelector(".breadcrumb");
    expect(breadcrumb).not.toBeNull();
    expect(
      within(breadcrumb as HTMLElement).getByText("launch-planning"),
    ).toBeInTheDocument();
  });

  test("marks the participant strip with the current turn (default 'us')", () => {
    const { container } = renderWithAgentSpawn(<TopBar />);
    expect(container.querySelector(".topbar-chips")).toBeNull();
  });

  test("view-toggle renders three buttons; clicking updates store.viewMode", async () => {
    const user = userEvent.setup();
    renderWithAgentSpawn(<TopBar />);
    const toggle = screen.getByRole("tablist", { name: /feed view mode/i });
    const buttons = within(toggle).getAllByRole("tab");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveTextContent(/everything/i);
    expect(buttons[1]).toHaveTextContent(/document/i);
    expect(buttons[2]).toHaveTextContent(/conversation/i);
    expect(useStore.getState().viewMode).toBe("everything");
    await user.click(buttons[1]!);
    expect(useStore.getState().viewMode).toBe("document");
    await user.click(buttons[2]!);
    expect(useStore.getState().viewMode).toBe("conversation");
  });
});

describe("Shell — composer-adjacent participant row", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders participant chips and feed navigation in the row above compose", () => {
    useStore.setState({
      events: [
        {
          filename: "20260522T100000Z_us-a7f3.turn-end.json",
          timestamp: "20260522T100000Z",
          participant_id: "us-a7f3",
          kind: "turn-end",
          payload: {},
        },
      ],
      participants: {
        ...PARTICIPANTS,
        "ag-c92e": {
          ...PARTICIPANTS["ag-c92e"]!,
          active_session: MOCK_SESSION.id,
        },
      },
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });
    const { container } = renderWithAgentSpawn(<Feed />);
    const toolbar = container.querySelector(".feed-compose-toolbar");
    expect(toolbar).not.toBeNull();
    expect(toolbar!.querySelector(".participant-strip")).not.toBeNull();
    expect(toolbar!.querySelector(".feed-nav-cluster")).not.toBeNull();
    expect(
      toolbar!.querySelector('.agent-chip[data-participant-id="ag-c92e"]'),
    ).not.toBeNull();
  });

  test("clears the agent active wrapper after that agent's turn-end arrives", () => {
    const userTurnEnd: AnyEventRecord = {
      filename: "20260522T100000Z_us-a7f3.turn-end.json",
      timestamp: "20260522T100000Z",
      participant_id: "us-a7f3",
      kind: "turn-end",
      payload: { participant_id: "us-a7f3" },
    };
    const agentTurnEnd: AnyEventRecord = {
      filename: "20260522T100100Z_ag-c92e.turn-end.json",
      timestamp: "20260522T100100Z",
      participant_id: "ag-c92e",
      kind: "turn-end",
      payload: { participant_id: "ag-c92e" },
    };
    useStore.setState({
      events: [userTurnEnd],
      participants: {
        ...PARTICIPANTS,
        "ag-c92e": {
          ...PARTICIPANTS["ag-c92e"]!,
          active_session: MOCK_SESSION.id,
        },
      },
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });

    const { container, rerender } = renderWithAgentSpawn(<Feed />);
    const chip = () =>
      container.querySelector('.agent-chip[data-participant-id="ag-c92e"]');

    expect(container.querySelector(".agent-chip-anchor.active-turn")).not.toBeNull();
    expect(chip()?.classList.contains("active")).toBe(true);

    useStore.setState({ events: [userTurnEnd, agentTurnEnd] });
    rerender(<Feed />);

    expect(container.querySelector(".agent-chip-anchor.active-turn")).toBeNull();
    expect(chip()?.classList.contains("active")).toBe(false);
  });
});

describe("Shell — LeftRail", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders five rail buttons; clicking each updates store.leftRail", async () => {
    const user = userEvent.setup();
    render(<LeftRail />);
    const rail = screen.getByRole("tablist", {
      name: /left panel navigation/i,
    });
    const buttons = within(rail).getAllByRole("tab");
    expect(buttons).toHaveLength(5);
    const expectedKeys = [
      "sessions",
      "named",
      "todos",
      "comments",
      "search",
    ] as const;
    for (let i = 0; i < expectedKeys.length; i++) {
      await user.click(buttons[i]!);
      expect(useStore.getState().leftRail).toBe(expectedKeys[i]);
    }
  });
});

describe("Shell — LeftPanel routing", () => {
  beforeEach(() => {
    resetStore();
    // Stub fetch so panels that query the server don't break.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ open: [], wip: [], done: [], hits: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("LeftPanel mounts the panel matching store.leftRail (header text changes)", () => {
    useStore.setState({ leftRail: "sessions" });
    const { rerender } = render(<LeftPanel />);
    expect(screen.getByRole("heading", { name: "SESSIONS" })).toBeInTheDocument();

    useStore.setState({ leftRail: "named" });
    rerender(<LeftPanel />);
    expect(screen.getByRole("heading", { name: "NAMED" })).toBeInTheDocument();

    useStore.setState({ leftRail: "todos" });
    rerender(<LeftPanel />);
    expect(screen.getByRole("heading", { name: "TODOS" })).toBeInTheDocument();

    useStore.setState({ leftRail: "comments" });
    rerender(<LeftPanel />);
    expect(
      screen.getByRole("heading", { name: "COMMENTS" }),
    ).toBeInTheDocument();

    useStore.setState({ leftRail: "search" });
    rerender(<LeftPanel />);
    expect(screen.getByRole("heading", { name: "SEARCH" })).toBeInTheDocument();
  });

  test("left panel paints a full-height tokenized surface inside its grid area", () => {
    useStore.setState({ leftRail: "comments" });
    const { container } = render(<LeftPanel />);

    const host = container.querySelector<HTMLElement>(".left-panel-host");
    expect(host).not.toBeNull();
    // Width now comes from the `leftPanel` grid track (--pane-w-leftPanel on
    // `.main`), not an inline style on the host.
    expect(cssRule(".left-panel-host")).toContain("grid-area: leftPanel");
    expect(host?.querySelector(".left-panel")).not.toBeNull();

    expect(cssRule(".left-panel-host")).toContain("background: var(--panel)");
    expect(cssRule(".left-panel")).toContain("height: 100%");
    expect(cssRule(".left-panel")).toContain("flex: 1 1 auto");
    expect(cssRule(".left-panel")).toContain("background: var(--panel)");
    expect(cssRule(".panel-list")).toContain("min-height: 0");
    expect(cssRule(".panel-list")).toContain("background: var(--panel)");
  });
});

describe("Shell — RightPanel", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ open: [], wip: [], done: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders right panel tab buttons; clicking each updates store.rightTab", async () => {
    const user = userEvent.setup();
    render(<RightPanel />);
    const tabs = screen.getByRole("tablist", { name: /right panel tabs/i });
    const buttons = within(tabs).getAllByRole("tab");
    const expectedKeys = [
      "todos",
      "comments",
      "named",
      "agents",
      "log",
      "files",
      "layout",
    ] as const;
    expect(buttons).toHaveLength(expectedKeys.length);
    expect(buttons[0]).toHaveTextContent(/todos/i);
    expect(buttons[1]).toHaveTextContent(/comments/i);
    expect(buttons[2]).toHaveTextContent(/named/i);
    expect(buttons[3]).toHaveTextContent(/agents/i);
    expect(buttons[4]).toHaveTextContent(/log/i);
    expect(buttons[5]).toHaveTextContent(/files/i);
    expect(buttons[6]).toHaveAccessibleName(/layout settings/i);

    for (let i = 0; i < expectedKeys.length; i++) {
      expect(buttons[i]).toHaveAttribute("data-tab", expectedKeys[i]);
      await user.click(buttons[i]!);
      expect(useStore.getState().rightTab).toBe(expectedKeys[i]);
    }
  });
});
