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
import { useStore } from "../../src/state/store.js";

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
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
  beforeEach(() => { resetStore(); });
  afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

  test("renders 'no path' when activePath is null", () => {
    render(<PathSwitcher />);
    expect(screen.getByRole("button")).toHaveTextContent("no path");
  });

  test("renders the basename of the active path", () => {
    act(() => {
      useStore.setState({ activePath: "/home/me/projects/foo" });
    });
    render(<PathSwitcher />);
    expect(screen.getByRole("button")).toHaveTextContent("foo");
  });

  test("clicking the trigger opens the dropdown", async () => {
    act(() => {
      useStore.setState({
        activePath: "/home/me/projects/foo",
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
        activePath: "/x",
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

  test("clicking a path POSTs /paths/active and refetches sessions + participants", async () => {
    act(() => {
      useStore.setState({
        activePath: "/old",
        knownPaths: ["/old", "/new"],
      });
    });
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/paths/active") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            activePath: "/new",
            activePathId: "newpath123abc",
            activeRevision: 2,
            knownPaths: ["/new", "/old"],
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
          String(u).endsWith("/paths/active") &&
          (init as RequestInit | undefined)?.method === "POST"
        );
      });
      expect(activeCall).toBeDefined();
      const body = JSON.parse((activeCall![1] as RequestInit).body as string);
      expect(body).toEqual({ path: "/new" });
    });

    // Store updated from the POST response.
    await waitFor(() => {
      expect(useStore.getState().activePath).toBe("/new");
      expect(useStore.getState().activeRevision).toBe(2);
    });
  });

  test("shows empty-state when knownPaths and favorites are both empty", async () => {
    act(() => {
      useStore.setState({ activePath: "/home/me", knownPaths: [], favorites: [] });
    });
    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/No other paths yet/i)).toBeInTheDocument();
  });

  test("Escape closes the dropdown", async () => {
    act(() => {
      useStore.setState({ activePath: "/x", knownPaths: ["/x", "/y"] });
    });
    const user = userEvent.setup();
    render(<PathSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
