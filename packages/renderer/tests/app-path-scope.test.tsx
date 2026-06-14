import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { AnyEventRecord } from "@f-mark/shared";
import { App } from "../src/App.js";
import { useStore } from "../src/state/store.js";

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

const PARTICIPANTS = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
};

const NEW_EVENT: AnyEventRecord = {
  filename: "20260526T100000.000Z_us-a7f3.prose.md",
  timestamp: "2026-05-26T10:00:00.000Z",
  participant_id: "us-a7f3",
  kind: "prose",
  payload: { content: "new path event" },
};

const OLD_EVENT: AnyEventRecord = {
  filename: "20260526T090000.000Z_us-a7f3.prose.md",
  timestamp: "2026-05-26T09:00:00.000Z",
  participant_id: "us-a7f3",
  kind: "prose",
  payload: { content: "old path event" },
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
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

describe("App path-scoped event fetches", () => {
  beforeEach(() => {
    resetStore();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("stale event-list failures after a path switch do not clear the new session", async () => {
    let activePath = "/old";
    let activePathId = "old-path";
    let activeRevision = 1;
    let releaseOldEvents: ((response: Response) => void) | null = null;

    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/paths")) {
        return Promise.resolve(
          jsonResponse({
            activePath,
            activePathId,
            activeRevision,
            knownPaths: ["/old", "/new"],
            favorites: [],
          }),
        );
      }
      if (u.endsWith("/sessions") && init?.method !== "POST") {
        return Promise.resolve(
          jsonResponse({
            sessions:
              activePath === "/old"
                ? [
                    {
                      id: "old-session",
                      slug: "old-session",
                      created_at: "2026-05-26T09:00:00.000Z",
                    },
                  ]
                : [
                    {
                      id: "new-session",
                      slug: "new-session",
                      created_at: "2026-05-26T10:00:00.000Z",
                    },
                  ],
          }),
        );
      }
      if (u.endsWith("/participants")) {
        return Promise.resolve(jsonResponse({ participants: PARTICIPANTS }));
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
      if (u.endsWith("/sessions/old-session/events?path=%2Fold")) {
        return new Promise<Response>((resolve) => {
          releaseOldEvents = resolve;
        });
      }
      if (u.endsWith("/sessions/new-session/events?path=%2Fnew")) {
        return Promise.resolve(jsonResponse({ events: [NEW_EVENT] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe("old-session");
      expect(releaseOldEvents).not.toBeNull();
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    activePath = "/new";
    activePathId = "new-path";
    activeRevision = 2;
    await act(async () => {
      for (const ws of MockWebSocket.instances) {
        await ws.emit({
          type: "path-switched",
          activePath,
          pathId: activePathId,
          revision: activeRevision,
        });
      }
    });

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe("new-session");
      expect(useStore.getState().events).toEqual([NEW_EVENT]);
    });

    await act(async () => {
      releaseOldEvents?.(jsonResponse({ error: "session not found" }, 404));
    });

    expect(useStore.getState().currentSessionId).toBe("new-session");
    expect(useStore.getState().events).toEqual([NEW_EVENT]);
  });

  test("refetches events when switching paths even if the session id is unchanged", async () => {
    let activePath = "/old";
    let activePathId = "old-path";
    let activeRevision = 1;

    const fetchMock = vi.fn((url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/paths")) {
        return Promise.resolve(
          jsonResponse({
            activePath,
            activePathId,
            activeRevision,
            knownPaths: ["/old", "/new"],
            favorites: [],
          }),
        );
      }
      if (u.endsWith("/sessions")) {
        return Promise.resolve(
          jsonResponse({
            sessions: [
              {
                id: "shared-session",
                slug: "shared-session",
                created_at: "2026-05-26T09:00:00.000Z",
              },
            ],
          }),
        );
      }
      if (u.endsWith("/participants")) {
        return Promise.resolve(jsonResponse({ participants: PARTICIPANTS }));
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
      if (u.endsWith("/sessions/shared-session/events?path=%2Fold")) {
        return Promise.resolve(jsonResponse({ events: [OLD_EVENT] }));
      }
      if (u.endsWith("/sessions/shared-session/events?path=%2Fnew")) {
        return Promise.resolve(jsonResponse({ events: [NEW_EVENT] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe("shared-session");
      expect(useStore.getState().events).toEqual([OLD_EVENT]);
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    activePath = "/new";
    activePathId = "new-path";
    activeRevision = 2;
    await act(async () => {
      for (const ws of MockWebSocket.instances) {
        await ws.emit({
          type: "path-switched",
          activePath,
          pathId: activePathId,
          revision: activeRevision,
        });
      }
    });

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe("shared-session");
      expect(useStore.getState().events).toEqual([NEW_EVENT]);
    });
  });
});
