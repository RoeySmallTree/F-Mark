/* NewSessionModal — folder-only flow. Sessions are created with the
   placeholder slug ("new-session"); the agent renames them later via
   fmark_rename_session. Covers: modal opens via store, /fs/home is fetched
   to populate Folder, folder gates submit, Browse opens picker and picked
   path replaces Folder, submit posts /sessions with the placeholder slug
   then refreshes /sessions, close interactions (X / backdrop / Escape),
   "+ NEW" in Sessions panel. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant } from "@f-mark/shared";
import { ModalRoot } from "../../src/modals/ModalRoot.js";
import { useStore } from "../../src/state/store.js";

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activePath: null,
    activePathId: null,
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

/* Stub fetch with route-aware responses for the modal's bootstrap calls. */
function stubFetch(
  overrides?: (url: string, init?: RequestInit) => Response | null,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const o = overrides?.(u, init);
    if (o) return Promise.resolve(o);
    if (u.endsWith("/fs/home")) {
      return Promise.resolve(jsonResponse({ home: "/home/me", xdgConfigHome: null }));
    }
    if (u.includes("/fs/list")) {
      return Promise.resolve(
        jsonResponse({
          path: "/home/me",
          parent: "/home",
          entries: [
            { name: "projects", isDir: true },
            { name: "notes", isDir: true },
          ],
          truncated: false,
        }),
      );
    }
    if (u.endsWith("/sessions") && init?.method === "POST") {
      return Promise.resolve(
        jsonResponse({
          id: "2026-05-24-demo",
          slug: "demo",
          created_at: "2026-05-24T10:00:00Z",
        }),
      );
    }
    if (u.endsWith("/sessions")) {
      return Promise.resolve(jsonResponse({ sessions: [] }));
    }
    if (u.endsWith("/paths")) {
      return Promise.resolve(
        jsonResponse({
          activePath: "/home/me",
          activePathId: "abc123abc123",
          activeRevision: 1,
          knownPaths: ["/home/me"],
          favorites: [],
        }),
      );
    }
    if (u.endsWith("/participants")) {
      return Promise.resolve(jsonResponse({ participants: PARTICIPANTS }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("NewSessionModal (v0.5)", () => {
  beforeEach(() => { resetStore(); });
  afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

  test("ModalRoot renders nothing when activeModal is null", () => {
    stubFetch();
    const { container } = render(<ModalRoot />);
    expect(container.querySelector(".modal-backdrop")).toBeNull();
  });

  test("opening via store mounts the modal and fetches the home dir for Folder", async () => {
    stubFetch();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /start a new session/i }),
    ).toBeInTheDocument();
    // Folder field populated from /fs/home asynchronously.
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });
  });

  test("defaults Folder to the active project path when one is selected", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.setState({ activePath: "/workspace/F-Mark" });
      useStore.getState().openModal("new-session");
    });

    expect(screen.getByText("/workspace/F-Mark")).toBeInTheDocument();
    expect(mock.mock.calls.some(([u]) => String(u).endsWith("/fs/home"))).toBe(false);

    await user.click(screen.getByRole("button", { name: /create session/i }));

    await waitFor(() => {
      const createCall = mock.mock.calls.find(([u, init]) => {
        return (
          String(u).endsWith("/sessions") &&
          (init as RequestInit | undefined)?.method === "POST"
        );
      });
      expect(createCall).toBeDefined();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body).toEqual({ slug: "new-session", path: "/workspace/F-Mark" });
    });
  });

  test("no template grid or invite chips render", async () => {
    stubFetch();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    expect(document.querySelector("[data-template]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Claude/ })).toBeNull();
    expect(screen.queryByText(/Path:/)).toBeNull();
  });

  test("no session-name input; submit enables once the folder resolves", async () => {
    stubFetch();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    expect(screen.queryByLabelText(/session name/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /create session/i }),
    ).not.toBeDisabled();
  });

  test("folder presets show favorites plus only the first four recents", async () => {
    stubFetch();
    render(<ModalRoot />);
    act(() => {
      useStore.setState({
        knownPaths: [
          "/work/alpha",
          "/work/beta",
          "/work/gamma",
          "/work/delta",
          "/work/epsilon",
          "/work/zeta",
        ],
        favorites: [{ name: "Beta saved", path: "/work/beta" }],
      });
      useStore.getState().openModal("new-session");
    });

    const presets = screen.getByLabelText("Folder presets");
    const labels = within(presets)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual([
      "Beta saved",
      "alpha",
      "gamma",
      "delta",
      "epsilon",
    ]);
    expect(within(presets).queryByRole("button", { name: "zeta" })).toBeNull();
  });

  test("Browse opens the folder picker; picking replaces the Folder", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });

    // Browse swaps the body to the picker.
    await user.click(screen.getByRole("button", { name: /browse/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /pick a folder/i })).toBeInTheDocument();
    });
    expect(await screen.findByText("projects")).toBeInTheDocument();

    // Click "Use this folder" — should return /home/me to the parent.
    await user.click(screen.getByRole("button", { name: /use this folder/i }));

    // Picker is gone; Folder field is back showing the picked path.
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /pick a folder/i })).toBeNull();
    });
    expect(screen.getByText("/home/me")).toBeInTheDocument();
  });

  test("submit POSTs /sessions with the placeholder slug and refreshes the list", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /create session/i }));

    await waitFor(() => {
      const createCall = mock.mock.calls.find(([u, init]) => {
        return (
          String(u).endsWith("/sessions") &&
          (init as RequestInit | undefined)?.method === "POST"
        );
      });
      expect(createCall).toBeDefined();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body).toEqual({ slug: "new-session", path: "/home/me" });
    });

    // Modal closed on success.
    await waitFor(() => {
      expect(useStore.getState().activeModal).toBeNull();
    });
    expect(useStore.getState().activePath).toBe("/home/me");
    expect(useStore.getState().knownPaths).toContain("/home/me");
    expect(useStore.getState().currentUserId).toBe("us-a7f3");
  });

  test("close interactions: X, backdrop, Escape", async () => {
    stubFetch();
    const user = userEvent.setup();
    const { container } = render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(useStore.getState().activeModal).toBeNull();

    act(() => { useStore.getState().openModal("new-session"); });
    const backdrop = container.querySelector(".modal-backdrop");
    await user.click(backdrop as HTMLElement);
    expect(useStore.getState().activeModal).toBeNull();

    act(() => { useStore.getState().openModal("new-session"); });
    await user.keyboard("{Escape}");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("clicking inside the modal does NOT close it", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    await user.click(screen.getByRole("dialog"));
    expect(useStore.getState().activeModal).toBe("new-session");
  });

  test("saves a favorite from the picker and shows it as a chip", async () => {
    const mock = stubFetch((url, init) => {
      if (url.endsWith("/paths/favorites") && init?.method === "POST") {
        return jsonResponse({
          favorites: [{ name: "Home", path: "/home/me" }],
        });
      }
      return null;
    });
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /browse/i }));
    // Wait for the picker to be ready (list loaded).
    await screen.findByText("projects");
    await user.click(screen.getByText(/Save current as favorite/i));
    await user.type(screen.getByLabelText(/favorite name/i), "Home");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = mock.mock.calls.find(([u, init]) => {
        return (
          String(u).endsWith("/paths/favorites") &&
          (init as RequestInit | undefined)?.method === "POST"
        );
      });
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body).toEqual({ name: "Home", path: "/home/me" });
    });
    // Store updated → chip should render.
    await waitFor(() => {
      expect(useStore.getState().favorites).toEqual([
        { name: "Home", path: "/home/me" },
      ]);
    });
  });

  test("opens the modal from Sessions panel '+ NEW' button", async () => {
    const { Sessions } = await import("../../src/panels/Sessions.js");
    stubFetch();
    const user = userEvent.setup();
    class MockWs {
      close(): void {}
      addEventListener(): void {}
    }
    vi.stubGlobal("WebSocket", MockWs);

    render(<Sessions />);
    const newBtn = screen.getByRole("button", { name: /Start a new session/i });
    expect(newBtn).not.toBeDisabled();
    await user.click(newBtn);
    expect(useStore.getState().activeModal).toBe("new-session");
  });
});
