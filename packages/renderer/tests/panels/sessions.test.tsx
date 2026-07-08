import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sessions } from "../../src/panels/Sessions.js";
import { useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { jsonResponse, resetStore } from "../cards/_helpers.js";

const REPO_A = "/work/repo-a";
const REPO_B = "/work/repo-b";

const ALL_SESSIONS: SessionMeta[] = [
  {
    id: "2026-05-24-alpha-session",
    slug: "alpha-session",
    created_at: "2026-05-24T10:00:00Z",
    path: REPO_A,
    path_id: "repo-a-id",
  },
  {
    id: "2026-05-23-beta-session",
    slug: "beta-session",
    created_at: "2026-05-23T10:00:00Z",
    path: REPO_B,
    path_id: "repo-b-id",
  },
];

const CREATED_IN_REPO_B: SessionMeta = {
  id: "2026-05-24-new-work",
  slug: "new-work",
  created_at: "2026-05-24T11:00:00Z",
  path: REPO_B,
  path_id: "repo-b-id",
};

function deferredResponse(body: unknown): {
  promise: Promise<Response>;
  resolve(): void;
  settled(): boolean;
} {
  let settled = false;
  let resolveResponse: (() => void) | null = null;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = () => {
      settled = true;
      resolve(jsonResponse(body));
    };
  });
  return {
    promise,
    resolve() {
      resolveResponse?.();
    },
    settled() {
      return settled;
    },
  };
}

class MockWebSocket {
  addEventListener(): void {}
  close(): void {}
}

function seedStore(): void {
  resetStore({
    activePath: REPO_A,
    activePathId: "repo-a-id",
    selectedPath: REPO_A,
    selectedPathId: "repo-a-id",
    activeRevision: 1,
    knownPaths: [REPO_A, REPO_B],
    favorites: [],
    sessions: [ALL_SESSIONS[0]!],
    currentSessionId: ALL_SESSIONS[0]!.id,
  });
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(
    (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/sessions?scope=all") {
        return Promise.resolve(jsonResponse({ sessions: ALL_SESSIONS }));
      }
      if (u === "/sessions" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(CREATED_IN_REPO_B));
      }
      if (u === "/sessions?path_id=repo-b-id") {
        return Promise.resolve(jsonResponse({ sessions: [ALL_SESSIONS[1]] }));
      }
      if (u === "/sessions") {
        return Promise.resolve(
          jsonResponse({
            sessions:
              useStore.getState().activePath === REPO_B
                ? [ALL_SESSIONS[1]]
                : [ALL_SESSIONS[0]],
          }),
        );
      }
      if (u === "/participants") {
        return Promise.resolve(jsonResponse({ participants: {} }));
      }
      if (u === "/participants?path_id=repo-b-id") {
        return Promise.resolve(jsonResponse({ participants: {} }));
      }
      return Promise.resolve(jsonResponse({}));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Sessions panel", () => {
  beforeEach(() => {
    seedStore();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("shows the loading animation while the sessions list is still loading", async () => {
    const sessionsRefresh = deferredResponse({ sessions: [] });
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      if (String(url) === "/sessions?scope=all") {
        return sessionsRefresh.promise;
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    useStore.setState({ sessions: [], currentSessionId: null });

    render(<Sessions />);

    const loading = screen.getByRole("status", { name: /loading/i });
    expect(loading).toHaveClass("loading-animation");
    expect(loading).toHaveClass("panel-loading");
    expect(
      screen.queryByText(/No sessions yet\. Press \+ New\./i),
    ).not.toBeInTheDocument();

    sessionsRefresh.resolve();

    await waitFor(() => {
      expect(
        screen.getByText(/No sessions yet\. Press \+ New\./i),
      ).toBeInTheDocument();
    });
  });

  test("renders all sessions grouped under repo accordions", async () => {
    stubFetch();
    render(<Sessions />);

    expect(await screen.findByText("repo-a")).toBeInTheDocument();
    expect(screen.getByText("repo-b")).toBeInTheDocument();
    expect(screen.getByText("alpha-session")).toBeInTheDocument();
    expect(screen.getByText("beta-session")).toBeInTheDocument();
  });

  test("selecting a session from another repo does not switch kernel active path", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<Sessions />);

    const row = (await screen.findByText("beta-session")).closest(".session-item");
    expect(row).not.toBeNull();
    await user.click(row as HTMLElement);

    await waitFor(() => {
      expect(useStore.getState().activePath).toBe(REPO_A);
      expect(useStore.getState().selectedPath).toBe(REPO_B);
      expect(useStore.getState().currentSessionId).toBe(
        ALL_SESSIONS[1]!.id,
      );
    });

    const switchCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url) === "/paths/active" &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(switchCall).toBeUndefined();
  });

  test("clicking a session focuses it before the root refresh finishes", async () => {
    const sessionsRefresh = deferredResponse({ sessions: [ALL_SESSIONS[1]] });
    const participantsRefresh = deferredResponse({ participants: {} });
    const fetchMock = vi.fn().mockImplementation(
      (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === "/sessions?scope=all") {
          return Promise.resolve(jsonResponse({ sessions: ALL_SESSIONS }));
        }
        if (u === "/sessions?path_id=repo-b-id") {
          return sessionsRefresh.promise;
        }
        if (u === "/participants?path_id=repo-b-id") {
          return participantsRefresh.promise;
        }
        return Promise.resolve(jsonResponse({}));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Sessions />);

    const row = (await screen.findByText("beta-session")).closest(".session-item");
    expect(row).not.toBeNull();
    await user.click(row as HTMLElement);

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe(ALL_SESSIONS[1]!.id);
      expect(useStore.getState().selectedPath).toBe(REPO_B);
    });
    expect(sessionsRefresh.settled()).toBe(false);
    expect(participantsRefresh.settled()).toBe(false);

    sessionsRefresh.resolve();
    participantsRefresh.resolve();
    await waitFor(() => {
      expect(sessionsRefresh.settled()).toBe(true);
      expect(participantsRefresh.settled()).toBe(true);
    });
  });

  test("inline creator is one-click and focuses the returned session id", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<Sessions />);

    await user.click(
      await screen.findByRole("button", { name: /new session in repo-b/i }),
    );

    await waitFor(() => {
      expect(useStore.getState().activePath).toBe(REPO_A);
      expect(useStore.getState().selectedPath).toBe(REPO_B);
      expect(useStore.getState().currentSessionId).toBe(CREATED_IN_REPO_B.id);
    });
    const createCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url) === "/sessions" &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(createCall).toBeDefined();
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({
      slug: "new-session",
      path: REPO_B,
    });
  });
});
