import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant } from "@f-mark/shared";
import { TopBar } from "../src/shell/TopBar.js";
import { LeftRail } from "../src/shell/LeftRail.js";
import { LeftPanel } from "../src/shell/LeftPanel.js";
import { RightPanel } from "../src/shell/RightPanel.js";
import { useStore } from "../src/state/store.js";
import type { SessionMeta } from "../src/api/client.js";

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

describe("Shell — TopBar", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders brand glyph, name, and breadcrumb with current session slug", () => {
    render(<TopBar />);
    expect(screen.getByText("F·Mark")).toBeInTheDocument();
    const breadcrumb = screen.getByRole("button", {
      name: /project breadcrumb/i,
    });
    expect(within(breadcrumb).getByText("launch-planning")).toBeInTheDocument();
  });

  test("renders a turn-pill (default 'us' turn → 'Your turn' label)", () => {
    render(<TopBar />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent(/your turn/i);
  });

  test("view-toggle renders three buttons; clicking updates store.viewMode", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
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

  test("renders four tab buttons; clicking each updates store.rightTab", async () => {
    const user = userEvent.setup();
    render(<RightPanel />);
    const tabs = screen.getByRole("tablist", { name: /right panel tabs/i });
    const buttons = within(tabs).getAllByRole("tab");
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent(/todos/i);
    expect(buttons[1]).toHaveTextContent(/comments/i);
    expect(buttons[2]).toHaveTextContent(/named/i);
    expect(buttons[3]).toHaveTextContent(/log/i);

    const expectedKeys = ["todos", "comments", "named", "log"] as const;
    for (let i = 0; i < expectedKeys.length; i++) {
      await user.click(buttons[i]!);
      expect(useStore.getState().rightTab).toBe(expectedKeys[i]);
    }
  });
});
