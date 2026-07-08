/* PathSwitcher tests — basename rendering, dropdown open/close, switching
   active path triggers POST + refetch, empty state when no recents/favorites. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PathSwitcher } from "../../src/shell/PathSwitcher.js";
import {
  LAST_FOCUSED_SESSION_STORAGE_KEY,
  useStore,
} from "../../src/state/store.js";

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
    activeRevision: 0,
    knownPaths: [],
    favorites: [],
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PathSwitcher", () => {
  beforeEach(() => {
    resetStore();
    globalThis.localStorage?.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.localStorage?.clear();
    cleanup();
  });

  test("renders 'no path' when activePath is null", () => {
    render(<PathSwitcher />);
    expect(screen.getByRole("button")).toHaveTextContent("no path");
  });

  test("renders the basename of the active path", () => {
    act(() => {
      useStore.setState({ selectedPath: "/home/me/projects/foo" });
    });
    render(<PathSwitcher />);
    expect(screen.getByRole("button")).toHaveTextContent("foo");
  });

  test("clicking the trigger opens the dropdown", async () => {
    act(() => {
      useStore.setState({
        selectedPath: "/home/me/projects/foo",
        knownPaths: ["/home/me/projects/foo", "/home/me/projects/bar"],
      });
    });
    const user = userEvent.setup();
    render(<PathSwitcher />);
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("RECENTS")).toBeInTheDocument();
  });

  test("favorites appear above recents and label by custom name", async () => {
    act(() => {
      useStore.setState({
        selectedPath: "/x",
        knownPaths: ["/x", "/y"],
        favorites: [{ name: "Cool project", path: "/y" }],
      });
    });
    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("FAVORITES")).toBeInTheDocument();
    expect(screen.getByText("Cool project")).toBeInTheDocument();
    // /y is in favorites; it should NOT also appear under RECENTS.
    const recentRows = screen.queryAllByRole("menuitem");
    const favPaths = recentRows
      .filter((r) => r.textContent?.includes("Cool project"));
    expect(favPaths.length).toBe(1);
  });

  test("clicking a path registers it without switching kernel active path", async () => {
    act(() => {
      useStore.setState({
        activePath: "/old",
        activePathId: "oldpath123abc",
        selectedPath: "/old",
        selectedPathId: "oldpath123abc",
        knownPaths: ["/old", "/new"],
      });
    });
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/paths/known") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            paths: [{ path: "/new", path_id: "newpath123abc", registered: true }],
            fallbackPath: "/old",
            fallbackPathId: "oldpath123abc",
            activePath: "/old",
            activePathId: "oldpath123abc",
            activeRevision: 1,
            knownPaths: ["/new", "/old"],
            favorites: [],
          }),
        );
      }
      if (u.endsWith("/sessions?scope=all")) {
        return Promise.resolve(
          jsonResponse({
            sessions: [
              {
                id: "session-new",
                slug: "session-new",
                created_at: "2026-06-15T10:00:00.000Z",
                path: "/new",
                path_id: "newpath123abc",
              },
            ],
          }),
        );
      }
      if (u.endsWith("/participants?path_id=newpath123abc")) {
        return Promise.resolve(jsonResponse({ participants: {} }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    // The "/new" recent row.
    const row = await screen.findByRole("menuitem", { name: /\/new/ });
    await user.click(row);

    await waitFor(() => {
      const activeCall = fetchMock.mock.calls.find(([u, init]) => {
        return (
          String(u).endsWith("/paths/known") &&
          (init as RequestInit | undefined)?.method === "POST"
        );
      });
      expect(activeCall).toBeDefined();
      const body = JSON.parse((activeCall![1] as RequestInit).body as string);
      expect(body).toEqual({ path: "/new" });
    });

    await waitFor(() => {
      expect(useStore.getState().activePath).toBe("/old");
      expect(useStore.getState().selectedPath).toBe("/new");
      expect(useStore.getState().currentSessionId).toBe("session-new");
    });
  });

  test("clicking a path restores that path's last focused session", async () => {
    act(() => {
      useStore.setState({
        activePath: "/old",
        activePathId: "oldpath123abc",
        selectedPath: "/old",
        selectedPathId: "oldpath123abc",
        knownPaths: ["/old", "/new"],
      });
    });
    globalThis.localStorage?.setItem(
      LAST_FOCUSED_SESSION_STORAGE_KEY,
      JSON.stringify({ "id:newpath123abc": "session-b" }),
    );
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/paths/known") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            paths: [{ path: "/new", path_id: "newpath123abc", registered: true }],
            fallbackPath: "/old",
            fallbackPathId: "oldpath123abc",
            activePath: "/old",
            activePathId: "oldpath123abc",
            activeRevision: 1,
            knownPaths: ["/new", "/old"],
            favorites: [],
          }),
        );
      }
      if (u.endsWith("/sessions?scope=all")) {
        return Promise.resolve(
          jsonResponse({
            sessions: [
              {
                id: "session-a",
                slug: "session-a",
                created_at: "2026-06-15T10:00:00.000Z",
                path: "/new",
                path_id: "newpath123abc",
              },
              {
                id: "session-b",
                slug: "session-b",
                created_at: "2026-06-14T10:00:00.000Z",
                path: "/new",
                path_id: "newpath123abc",
              },
            ],
          }),
        );
      }
      if (u.endsWith("/participants?path_id=newpath123abc")) {
        return Promise.resolve(jsonResponse({ participants: {} }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByRole("menuitem", { name: /\/new/ }));

    await waitFor(() => {
      expect(useStore.getState().currentSessionId).toBe("session-b");
    });
  });

  test("shows empty-state when knownPaths and favorites are both empty", async () => {
    act(() => {
      useStore.setState({ selectedPath: "/home/me", knownPaths: [], favorites: [] });
    });
    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/No other paths yet/i)).toBeInTheDocument();
  });

  test("Escape closes the dropdown", async () => {
    act(() => {
      useStore.setState({ selectedPath: "/x", knownPaths: ["/x", "/y"] });
    });
    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
