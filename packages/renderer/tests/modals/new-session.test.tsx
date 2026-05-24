/* NewSessionModal v0.5 — two-field flow (Folder picker + Name).
   Covers: modal opens via store, /fs/home is fetched to populate Folder,
   slug validation gates submit, char-strip on slug, Browse opens picker
   and picked path replaces Folder, submit posts /sessions with { slug, path }
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
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

  test("no template grid or invite chips render", async () => {
    stubFetch();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    expect(document.querySelector("[data-template]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Claude/ })).toBeNull();
    expect(screen.queryByText(/Path:/)).toBeNull();
  });

  test("submit disabled until a valid slug is typed AND folder is set", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });
    const submit = screen.getByRole("button", { name: /create session/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/session name/i), "demo");
    expect(submit).not.toBeDisabled();
  });

  test("invalid characters get stripped from the slug input", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    const slugInput = screen.getByLabelText(/session name/i) as HTMLInputElement;
    await user.type(slugInput, "Launch Planning!");
    expect(slugInput.value).toBe("launchplanning");
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

  test("submit POSTs /sessions with { slug, path } and refreshes the list", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => { useStore.getState().openModal("new-session"); });
    await waitFor(() => {
      expect(screen.getByText("/home/me")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/session name/i), "demo");
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
      expect(body).toEqual({ slug: "demo", path: "/home/me" });
    });

    // Modal closed on success.
    await waitFor(() => {
      expect(useStore.getState().activeModal).toBeNull();
    });
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
