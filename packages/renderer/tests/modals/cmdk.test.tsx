/* Phase 7 — Command Palette (⌘K) test suite.
   Covers:
     - ⌘K / Ctrl+K opens the palette from App-level hotkey.
     - Empty query shows "Recent sessions" + "Quick actions" groups.
     - Typing "set" filters Quick actions to "Open settings".
     - Enter on a selected action row runs the action.
     - Arrow keys move selection (with wrap-around).
     - Escape closes the modal.
     - Selecting a session row sets store.currentSessionId on Enter. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { CmdKModal } from "../../src/modals/CmdKModal.js";
import { ModalRoot } from "../../src/modals/ModalRoot.js";
import { App } from "../../src/App.js";
import { useStore } from "../../src/state/store.js";
import { _isMacPlatform } from "../../src/hooks/useHotkeys.js";
import type {
  SessionEventGroup,
  SessionMeta,
} from "../../src/api/client.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

// $mod resolves to ⌘ on macOS / Ctrl elsewhere. Match what useHotkeys expects.
const MOD_OPEN = _isMacPlatform() ? "{Meta>}" : "{Control>}";
const MOD_CLOSE = _isMacPlatform() ? "{/Meta}" : "{/Control}";

// Stub the theme module so theme actions don't actually swap body classes
// across tests. We assert the spy was called instead.
vi.mock("../../src/themes/index.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/themes/index.js")>(
      "../../src/themes/index.js",
    );
  return {
    ...actual,
    applyTheme: vi.fn(),
  };
});

vi.mock("../../src/themes/fonts.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/themes/fonts.js")>(
      "../../src/themes/fonts.js",
    );
  return {
    ...actual,
    applyFont: vi.fn(),
  };
});

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

const SESSIONS: SessionMeta[] = [
  {
    id: "2026-05-22-launch-review",
    slug: "launch-review",
    created_at: "2026-05-22T10:00:00Z",
  },
  {
    id: "2026-05-20-pricing-research",
    slug: "pricing-research",
    created_at: "2026-05-20T10:00:00Z",
  },
  {
    id: "2026-05-15-onboarding-flow",
    slug: "onboarding-flow",
    created_at: "2026-05-15T10:00:00Z",
  },
];

const NAMED_PROSE_EVENT: AnyEventRecord = {
  filename: "20260522T_us-a7f3.prose.md",
  kind: "prose",
  participant_id: "us-a7f3",
  timestamp: "20260522T100000Z",
  payload: {
    name: "Launch Plan v1",
    content: "We start shipping the open-source kernel: file-format spec…",
  },
};

const REMOTE_SESSION: SessionMeta = {
  id: "2026-05-21-remote-session",
  slug: "remote-session",
  created_at: "2026-05-21T10:00:00Z",
  path: "/tmp/other-repo",
  path_id: "path-other",
};

const REMOTE_NAMED_PROSE_EVENT: AnyEventRecord = {
  filename: "20260521T_us-a7f3.prose.md",
  kind: "prose",
  participant_id: "us-a7f3",
  timestamp: "20260521T100000Z",
  payload: {
    name: "Remote Plan",
    content: "This named document lives in another project path.",
  },
};

function resetStore(
  overrides: Partial<ReturnType<typeof useStore.getState>> = {},
): void {
  useStore.setState({
    token: null,
    sessions: SESSIONS,
    currentSessionId: SESSIONS[0]!.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [NAMED_PROSE_EVENT],
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    ...overrides,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CmdKModal — opening", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const u = String(input);
      if (u.startsWith("/search")) {
        return Promise.resolve(jsonResponse({ hits: [] }));
      }
      if (u === "/sessions") {
        return Promise.resolve(jsonResponse({ sessions: SESSIONS }));
      }
      if (u === "/participants") {
        return Promise.resolve(jsonResponse({ participants: PARTICIPANTS }));
      }
      if (u.includes("/events")) {
        return Promise.resolve(jsonResponse({ events: [NAMED_PROSE_EVENT] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no WebSocket — provide a no-op stub for App-level mounts.
    class MockWs {
      close(): void {}
      addEventListener(): void {}
    }
    vi.stubGlobal("WebSocket", MockWs);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("⌘K (or Ctrl+K) opens the palette from anywhere", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(useStore.getState().activeModal).toBeNull();
    await user.keyboard(`${MOD_OPEN}k${MOD_CLOSE}`);
    expect(useStore.getState().activeModal).toBe("cmdk");
  });

  test("ModalRoot mounts CmdKModal when activeModal === 'cmdk'", () => {
    resetStore({ activeModal: "cmdk" });
    render(<ModalRoot />);
    expect(
      screen.getByRole("dialog", { name: /command palette/i }),
    ).toBeInTheDocument();
  });

  test("clicking the TopBar search icon opens the palette", async () => {
    const { TopBar } = await import("../../src/shell/TopBar.js");
    const user = userEvent.setup();
    resetStore();
    renderWithAgentSpawn(<TopBar />);
    const btn = screen.getByRole("button", { name: /open command palette/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(useStore.getState().activeModal).toBe("cmdk");
  });
});

describe("CmdKModal — default groups (empty query)", () => {
  beforeEach(() => {
    resetStore({ activeModal: "cmdk" });
  });
  afterEach(() => {
    cleanup();
  });

  test("shows 'Recent sessions' + 'Quick actions' groups", () => {
    render(<CmdKModal />);
    expect(screen.getByText(/recent sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/quick actions/i)).toBeInTheDocument();
  });

  test("Recent sessions row lists session slugs", () => {
    render(<CmdKModal />);
    // Most recent first (sorted by created_at desc).
    expect(screen.getByText("launch-review")).toBeInTheDocument();
    expect(screen.getByText("pricing-research")).toBeInTheDocument();
    expect(screen.getByText("onboarding-flow")).toBeInTheDocument();
  });

  test("Quick actions includes 'New session' and 'Open settings'", () => {
    render(<CmdKModal />);
    expect(screen.getByText("New session")).toBeInTheDocument();
    expect(screen.getByText("Open settings")).toBeInTheDocument();
  });

  test("first row is selected by default (.sel class)", () => {
    const { container } = render(<CmdKModal />);
    const selRows = container.querySelectorAll(".cmdk-row.sel");
    expect(selRows.length).toBe(1);
  });
});

describe("CmdKModal — filtering", () => {
  beforeEach(() => {
    resetStore({ activeModal: "cmdk" });
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ hits: [] })));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("typing 'sett' filters Quick actions to 'Open settings'", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    // "sett" is a contiguous prefix inside "settings" — strong fuzzy match.
    await user.type(input, "sett");
    expect(screen.getByText("Open settings")).toBeInTheDocument();
  });

  test("typing 'set' makes 'Open settings' the top-ranked quick action", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "set");
    // Find the Quick actions group and verify Open settings is its first row.
    const groupLabel = screen.getByText(/^quick actions$/i);
    const groupContainer = groupLabel.parentElement;
    expect(groupContainer).not.toBeNull();
    const firstRow = groupContainer!.querySelector(".cmdk-row .cmdk-label");
    expect(firstRow?.textContent).toBe("Open settings");
  });

  test("typing a session slug substring filters Sessions group", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "pricing");
    expect(screen.getByText("pricing-research")).toBeInTheDocument();
    expect(screen.queryByText("launch-review")).toBeNull();
  });

  test("typing matches against named contribution names", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "launch plan");
    expect(screen.getByText("Launch Plan v1")).toBeInTheDocument();
  });

  test("typing matches named contributions from all sessions with path tags", async () => {
    const groups: SessionEventGroup[] = [
      {
        path: REMOTE_SESSION.path!,
        path_id: REMOTE_SESSION.path_id!,
        session: REMOTE_SESSION,
        events: [REMOTE_NAMED_PROSE_EVENT],
        participants: PARTICIPANTS,
      },
    ];
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const u = String(input);
      if (u.startsWith("/sessions/events")) {
        return Promise.resolve(jsonResponse({ groups }));
      }
      if (u.startsWith("/sessions?scope=all")) {
        return Promise.resolve(
          jsonResponse({ sessions: [...SESSIONS, REMOTE_SESSION] }),
        );
      }
      if (u.startsWith("/search")) {
        return Promise.resolve(jsonResponse({ hits: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "remote plan");

    expect(await screen.findByText("Remote Plan")).toBeInTheDocument();
    expect(screen.getByText(/other-repo \/ remote-session/)).toBeInTheDocument();
  });

  test("totally-unmatched query shows empty state", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "zzzqqqxxxnoresults");
    expect(screen.getByText(/no matches for/i)).toBeInTheDocument();
  });
});

describe("CmdKModal — keyboard navigation", () => {
  beforeEach(() => {
    resetStore({ activeModal: "cmdk" });
  });
  afterEach(() => {
    cleanup();
  });

  test("ArrowDown moves selection forward", async () => {
    const user = userEvent.setup();
    const { container } = render(<CmdKModal />);
    const initial = container.querySelector(".cmdk-row.sel");
    expect(initial?.getAttribute("data-cmdk-idx")).toBe("0");
    await user.keyboard("{ArrowDown}");
    const next = container.querySelector(".cmdk-row.sel");
    expect(next?.getAttribute("data-cmdk-idx")).toBe("1");
  });

  test("ArrowUp wraps around at index 0", async () => {
    const user = userEvent.setup();
    const { container } = render(<CmdKModal />);
    await user.keyboard("{ArrowUp}");
    const wrapped = container.querySelector(".cmdk-row.sel");
    // Should land on the last row (wrap-around).
    const allRows = container.querySelectorAll(".cmdk-row");
    expect(wrapped?.getAttribute("data-cmdk-idx")).toBe(
      String(allRows.length - 1),
    );
  });

  test("ArrowDown wraps past the last row back to 0", async () => {
    const user = userEvent.setup();
    const { container } = render(<CmdKModal />);
    const allRows = container.querySelectorAll(".cmdk-row");
    for (let i = 0; i < allRows.length; i++) {
      await user.keyboard("{ArrowDown}");
    }
    const wrapped = container.querySelector(".cmdk-row.sel");
    expect(wrapped?.getAttribute("data-cmdk-idx")).toBe("0");
  });
});

describe("CmdKModal — activation (Enter)", () => {
  beforeEach(() => {
    resetStore({ activeModal: "cmdk" });
  });
  afterEach(() => {
    cleanup();
  });

  test("Enter on a session row sets store.currentSessionId and closes", async () => {
    const user = userEvent.setup();
    // Set the current session to something OTHER than the first recent
    // session so we can observe the change.
    resetStore({
      activeModal: "cmdk",
      currentSessionId: SESSIONS[2]!.id,
    });
    render(<CmdKModal />);
    // The first row is the most-recent session: launch-review.
    await user.keyboard("{Enter}");
    expect(useStore.getState().currentSessionId).toBe(SESSIONS[0]!.id);
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("Enter on 'Open settings' switches activeModal to 'settings'", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    // Type "open settings" to filter and select that row.
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "open settings");
    await user.keyboard("{Enter}");
    expect(useStore.getState().activeModal).toBe("settings");
  });

  test("Enter on 'New session' switches activeModal to 'new-session'", async () => {
    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "new session");
    await user.keyboard("{Enter}");
    expect(useStore.getState().activeModal).toBe("new-session");
  });

  test("Enter on a theme action calls applyTheme and closes", async () => {
    const themesModule = await import("../../src/themes/index.js");
    const applyTheme = themesModule.applyTheme as ReturnType<typeof vi.fn>;
    applyTheme.mockClear();

    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "theme terminal");
    await user.keyboard("{Enter}");
    expect(applyTheme).toHaveBeenCalledWith("terminal");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("Enter on a font action calls applyFont and closes", async () => {
    const fontsModule = await import("../../src/themes/fonts.js");
    const applyFont = fontsModule.applyFont as ReturnType<typeof vi.fn>;
    applyFont.mockClear();

    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "space grotesk");
    await user.keyboard("{Enter}");
    expect(applyFont).toHaveBeenCalledWith("space-grotesk");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("clicking a row activates it (mouse path)", async () => {
    const user = userEvent.setup();
    resetStore({
      activeModal: "cmdk",
      currentSessionId: SESSIONS[2]!.id,
    });
    render(<CmdKModal />);
    const row = screen.getByText("launch-review").closest(".cmdk-row");
    expect(row).not.toBeNull();
    await user.click(row as HTMLElement);
    expect(useStore.getState().currentSessionId).toBe(SESSIONS[0]!.id);
    expect(useStore.getState().activeModal).toBeNull();
  });
});

describe("CmdKModal — Escape & close", () => {
  beforeEach(() => {
    resetStore({ activeModal: "cmdk" });
  });
  afterEach(() => {
    cleanup();
  });

  test("Escape closes the modal (via ModalRoot's listener)", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    expect(useStore.getState().activeModal).toBe("cmdk");
    await user.keyboard("{Escape}");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("backdrop click closes via ModalRoot", async () => {
    const user = userEvent.setup();
    const { container } = render(<ModalRoot />);
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("clicking inside the modal does not close it", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    await user.click(screen.getByRole("dialog"));
    expect(useStore.getState().activeModal).toBe("cmdk");
  });
});

describe("CmdKModal — search backend (debounced)", () => {
  beforeEach(() => {
    resetStore({ activeModal: "cmdk" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("calls /search with the typed query after debounce", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.startsWith("/search")) {
        return Promise.resolve(
          jsonResponse({
            hits: [
              {
                session_id: SESSIONS[1]!.id,
                event: NAMED_PROSE_EVENT,
                snippet: "matched snippet here",
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<CmdKModal />);
    const input = screen.getByLabelText(/command palette query/i);
    await user.type(input, "matched");

    // Wait beyond the 200ms debounce so the search effect fires.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    const searchCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).startsWith("/search"),
    );
    expect(searchCalls.length).toBeGreaterThanOrEqual(1);
    const lastUrl = String(searchCalls[searchCalls.length - 1]![0]);
    expect(lastUrl).toContain("q=matched");
    expect(lastUrl).toContain("scope=all");
  });
});
