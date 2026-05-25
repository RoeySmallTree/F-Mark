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

class MockWebSocket {
  addEventListener(): void {}
  close(): void {}
}

function seedStore(): void {
  resetStore({
    activePath: REPO_A,
    activePathId: "repo-a-id",
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
      if (u === "/paths/active" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            activePath: REPO_B,
            activePathId: "repo-b-id",
            activeRevision: 2,
            knownPaths: [REPO_B, REPO_A],
            favorites: [],
          }),
        );
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

  test("renders all sessions grouped under repo accordions", async () => {
    stubFetch();
    render(<Sessions />);

    expect(await screen.findByText("repo-a")).toBeInTheDocument();
    expect(screen.getByText("repo-b")).toBeInTheDocument();
    expect(screen.getByText("alpha-session")).toBeInTheDocument();
    expect(screen.getByText("beta-session")).toBeInTheDocument();
  });

  test("selecting a session from another repo switches paths first", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<Sessions />);

    const row = (await screen.findByText("beta-session")).closest(".session-item");
    expect(row).not.toBeNull();
    await user.click(row as HTMLElement);

    await waitFor(() => {
      expect(useStore.getState().activePath).toBe(REPO_B);
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
    expect(switchCall).toBeDefined();
    expect(JSON.parse((switchCall![1] as RequestInit).body as string)).toEqual({
      path: REPO_B,
    });
  });
});
