import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/App.js";
import { RightFiles } from "../../src/panels/right/RightFiles.js";
import { useStore } from "../../src/state/store.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  private listeners = new Map<
    string,
    (event: { data: string }) => void | Promise<void>
  >();

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: { data: string }) => void | Promise<void>,
  ): void {
    this.listeners.set(type, listener);
  }

  async emit(message: unknown): Promise<void> {
    await this.listeners.get("message")?.({ data: JSON.stringify(message) });
  }

  close(): void {
    /* noop */
  }
}

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
    filesTreeByPath: {},
    filesTreeLoadingByPath: {},
    filesExpandedByPath: {},
    filesFavoritesProjectByPath: {},
    filesFavoritesSession: {},
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

describe("Files tab automatic reload", () => {
  beforeEach(() => {
    resetStore();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("reloads the active file tree when the kernel broadcasts files.changed", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/paths")) {
        return Promise.resolve(
          jsonResponse({
            activePath: "/project",
            activePathId: "project-id",
            activeRevision: 1,
            knownPaths: ["/project"],
            favorites: [],
          }),
        );
      }
      if (u.endsWith("/sessions")) {
        return Promise.resolve(jsonResponse({ sessions: [] }));
      }
      if (u.endsWith("/participants")) {
        return Promise.resolve(jsonResponse({ participants: {} }));
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
      if (u.endsWith("/files/tree?root=%2Fproject")) {
        return Promise.resolve(
          jsonResponse({
            root: "/project",
            entries: [],
            truncated: false,
            truncatedAt: 0,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/files/tree?root=%2Fproject",
        expect.anything(),
      );
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });
    const initialTreeFetches = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/files/tree?root=%2Fproject",
    ).length;

    await act(async () => {
      for (const ws of MockWebSocket.instances) {
        await ws.emit({
          type: "files.changed",
          root: "/project",
          pathId: "project-id",
          revision: 1,
        });
      }
    });

    await waitFor(() => {
      const treeFetches = fetchMock.mock.calls.filter(
        ([url]) => String(url) === "/files/tree?root=%2Fproject",
      ).length;
      expect(treeFetches).toBe(initialTreeFetches + 1);
    });
  });

  test("Files tab chrome no longer renders a manual refresh button", async () => {
    useStore.setState({
      activePath: "/project",
      currentSessionId: "session-1",
      filesTreeByPath: {
        "/project": {
          root: "/project",
          entries: [],
          truncated: false,
          truncatedAt: 0,
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ paths: [] }))),
    );

    render(<RightFiles />);

    expect(screen.queryByTitle("Refresh tree")).toBeNull();
    expect(screen.getByTitle("Search files")).toBeInTheDocument();
  });
});
