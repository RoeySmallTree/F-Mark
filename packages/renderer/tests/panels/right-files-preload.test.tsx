import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    selectedPath: null,
    selectedPathId: null,
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

function installFetch(input: {
  treeResponse?: Promise<Response> | Response;
  eventsResponse?: Promise<Response> | Response;
} = {}): ReturnType<typeof vi.fn> {
  const {
    treeResponse = jsonResponse(TREE_RESPONSE),
    eventsResponse = jsonResponse({ events: [] }),
  } = input;
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
    if (u.endsWith("/sessions?scope=all") && init?.method !== "POST") {
      return Promise.resolve(
        jsonResponse({
          sessions: [
            {
              id: SESSION_ID,
              slug: "session-1",
              created_at: "2026-06-11T08:00:00.000Z",
              path: ACTIVE_PATH,
              path_id: "active-path-id",
            },
          ],
        }),
      );
    }
    if (u.endsWith("/participants?path_id=active-path-id")) {
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
    if (u.endsWith(`/sessions/${SESSION_ID}/events?path_id=active-path-id`)) {
      return eventsResponse instanceof Response
        ? Promise.resolve(eventsResponse)
        : eventsResponse;
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
    if (u.endsWith("/files/tree?path_id=active-path-id")) {
      return treeResponse instanceof Response
        ? Promise.resolve(treeResponse)
        : treeResponse;
    }
    if (u.endsWith("/git/changed-files?path_id=active-path-id&mode=branch")) {
      return Promise.resolve(
        jsonResponse({ status: "ok", path_id: "active-path-id", files: [] }),
      );
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
    String(url).endsWith("/files/tree?path_id=active-path-id"),
  ).length;
}

function gitChangedFetchCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith("/git/changed-files?path_id=active-path-id&mode=branch"),
  ).length;
}

function eventsFetchCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith(`/sessions/${SESSION_ID}/events?path_id=active-path-id`),
  ).length;
}

describe("files tree loading", () => {
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

  test("does NOT eagerly fetch the file tree while session events are still loading", async () => {
    const eventsResponse = new Promise<Response>(() => {
      /* left pending */
    });
    const fetchMock = installFetch({ eventsResponse });

    render(<App />);

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe(SESSION_ID);
      expect(eventsFetchCount(fetchMock)).toBe(1);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useStore.getState().eventsLoadingSessionId).toBe(SESSION_ID);
    expect(treeFetchCount(fetchMock)).toBe(0);
    expect(gitChangedFetchCount(fetchMock)).toBe(0);
    expect(useStore.getState().rightTab).toBe("log");
    expect(screen.queryByRole("tree")).toBeNull();
  });

  test("eagerly fetches the tree after events load without opening Files", async () => {
    let resolveEvents: ((response: Response) => void) | null = null;
    const eventsResponse = new Promise<Response>((resolve) => {
      resolveEvents = resolve;
    });
    let resolveTree: ((response: Response) => void) | null = null;
    const treeResponse = new Promise<Response>((resolve) => {
      resolveTree = resolve;
    });
    const fetchMock = installFetch({ eventsResponse, treeResponse });

    render(<App />);

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe(SESSION_ID);
      expect(eventsFetchCount(fetchMock)).toBe(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(treeFetchCount(fetchMock)).toBe(0);
    expect(gitChangedFetchCount(fetchMock)).toBe(0);

    await act(async () => {
      resolveEvents?.(jsonResponse({ events: [] }));
      await eventsResponse;
    });
    await waitFor(() => {
      expect(useStore.getState().eventsLoadingSessionId).toBeNull();
      expect(treeFetchCount(fetchMock)).toBe(1);
      expect(gitChangedFetchCount(fetchMock)).toBe(1);
      expect(useStore.getState().filesTreeLoadingByPath[ACTIVE_PATH]).toBe(true);
    });
    expect(useStore.getState().rightTab).toBe("log");
    expect(screen.queryByRole("tree")).toBeNull();

    await act(async () => {
      resolveTree?.(jsonResponse(TREE_RESPONSE));
      await treeResponse;
    });

    await waitFor(() => {
      expect(useStore.getState().filesTreeLoadingByPath[ACTIVE_PATH]).toBe(false);
      expect(useStore.getState().filesTreeByPath[ACTIVE_PATH]).toEqual(
        TREE_RESPONSE,
      );
    });
    expect(treeFetchCount(fetchMock)).toBe(1);
    expect(gitChangedFetchCount(fetchMock)).toBe(1);
  });
});
