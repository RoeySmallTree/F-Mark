import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../../src/App.js";
import { DEFAULT_FILES_SEARCH, useStore } from "../../src/state/store.js";

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
vi.mock("../../src/shell/LeftRail.js", () => ({
  LeftRail: (): JSX.Element => <div data-stub="left-rail" />,
}));
vi.mock("../../src/shell/LeftPanel.js", () => ({
  LeftPanel: (): JSX.Element => <div data-stub="left-panel" />,
}));
vi.mock("../../src/shell/Feed.js", () => ({
  Feed: (): JSX.Element => <div data-stub="feed" />,
}));
vi.mock("../../src/shell/Compose.js", () => ({
  Compose: (): JSX.Element => <div data-stub="compose" />,
}));
vi.mock("../../src/shell/AgentLauncher.js", () => ({
  AgentLauncher: (): JSX.Element => <div data-stub="agent-launcher" />,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class MockWebSocket {
  constructor(public url: string) {}
  addEventListener(): void {
    /* noop */
  }
  close(): void {
    /* noop */
  }
}

const ACTIVE_PATH = "/workspace/F-Mark";
const SESSION_ID = "session-1";

const TREE_RESPONSE = {
  root: ACTIVE_PATH,
  entries: [
    {
      index: 0,
      parent: null,
      name: "README.md",
      relPath: "README.md",
      absPath: `${ACTIVE_PATH}/README.md`,
      isDir: false,
      isSymlink: false,
      ext: ".md",
      size: 120,
      mtimeMs: 1,
      ignored: false,
      depth: 0,
    },
  ],
  truncated: false,
  truncatedAt: 1,
};

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
    participants: {},
    currentUserId: null,
    events: [],
    activePath: null,
    activePathId: null,
    activeRevision: 0,
    knownPaths: [],
    favorites: [],
    rightTab: "log",
    rightTabBySession: {},
    filesTreeByPath: {},
    filesTreeLoadingByPath: {},
    filesExpandedByPath: {},
    filesFavoritesProjectByPath: {},
    filesFavoritesSession: {},
    filesSearch: DEFAULT_FILES_SEARCH,
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

function installFetch(treeResponse: Promise<Response> | Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/paths")) {
      return Promise.resolve(
        jsonResponse({
          activePath: ACTIVE_PATH,
          activePathId: "active-path-id",
          activeRevision: 1,
          knownPaths: [ACTIVE_PATH],
          favorites: [],
        }),
      );
    }
    if (u.endsWith("/sessions") && init?.method !== "POST") {
      return Promise.resolve(
        jsonResponse({
          sessions: [
            {
              id: SESSION_ID,
              slug: "session-1",
              created_at: "2026-06-11T08:00:00.000Z",
            },
          ],
        }),
      );
    }
    if (u.endsWith("/participants")) {
      return Promise.resolve(
        jsonResponse({
          participants: {
            "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
            "ag-c92e": {
              kind: "agent",
              name: "Codex",
              color: "#2f7d62",
              active_session: SESSION_ID,
            },
          },
        }),
      );
    }
    if (u.endsWith(`/sessions/${SESSION_ID}/events?path=%2Fworkspace%2FF-Mark`)) {
      return Promise.resolve(jsonResponse({ events: [] }));
    }
    if (u.endsWith("/health")) {
      return Promise.resolve(
        jsonResponse({ status: "ok", version: "0.4.0", processApiEnabled: true }),
      );
    }
    if (u.endsWith("/managed-agents")) {
      return Promise.resolve(jsonResponse({ agents: [], terminals: [] }));
    }
    if (u.endsWith("/env-probe")) {
      return Promise.resolve(jsonResponse({ runtimes: {}, tmux: false }));
    }
    if (u.endsWith("/files/tree?root=%2Fworkspace%2FF-Mark")) {
      return treeResponse instanceof Response
        ? Promise.resolve(treeResponse)
        : treeResponse;
    }
    if (u.startsWith("/files/favorites?")) {
      return Promise.resolve(jsonResponse({ paths: [] }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function treeFetchCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith("/files/tree?root=%2Fworkspace%2FF-Mark"),
  ).length;
}

describe("files tree preloading", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    globalThis.localStorage?.clear();
  });

  test("starts the file tree fetch from the app path lifecycle before Files is opened", async () => {
    const fetchMock = installFetch(jsonResponse(TREE_RESPONSE));

    render(<App />);

    await waitFor(() => {
      expect(useStore.getState().activePath).toBe(ACTIVE_PATH);
      expect(treeFetchCount(fetchMock)).toBe(1);
    });
    expect(useStore.getState().rightTab).toBe("log");
    expect(screen.queryByRole("tree")).toBeNull();

    await waitFor(() => {
      expect(useStore.getState().filesTreeByPath[ACTIVE_PATH]).toEqual(
        TREE_RESPONSE,
      );
    });
  });

  test("opening Files during an in-flight preload does not duplicate the initial tree fetch", async () => {
    let resolveTree: ((response: Response) => void) | null = null;
    const treeResponse = new Promise<Response>((resolve) => {
      resolveTree = resolve;
    });
    const fetchMock = installFetch(treeResponse);
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(treeFetchCount(fetchMock)).toBe(1);
      expect(useStore.getState().filesTreeLoadingByPath[ACTIVE_PATH]).toBe(true);
    });

    await user.click(screen.getByRole("tab", { name: /Files/i }));
    expect(treeFetchCount(fetchMock)).toBe(1);

    await act(async () => {
      resolveTree?.(jsonResponse(TREE_RESPONSE));
      await treeResponse;
    });

    await waitFor(() => {
      expect(useStore.getState().filesTreeLoadingByPath[ACTIVE_PATH]).toBe(false);
      expect(screen.getByRole("tree")).toBeTruthy();
    });
    expect(treeFetchCount(fetchMock)).toBe(1);
  });
});
