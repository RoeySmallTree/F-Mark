/* Phase 10 — NewSessionModal + ModalRoot tests.
   Covers: store.openModal('new-session') mounts the modal; slug validation
   gates the submit button; template selection toggles .on; submit calls
   createSession then postProse with the starter; close via X / backdrop /
   Escape all return activeModal to null. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant } from "@f-mark/shared";
import { ModalRoot } from "../../src/modals/ModalRoot.js";
import { useStore } from "../../src/state/store.js";
import { todayDatePrefix } from "../../src/modals/newsession/SlugInput.js";

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

describe("NewSessionModal + ModalRoot", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("ModalRoot renders nothing when activeModal is null", () => {
    const { container } = render(<ModalRoot />);
    expect(container.querySelector(".modal-backdrop")).toBeNull();
  });

  test("opening via store.openModal('new-session') mounts the modal", () => {
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /start a new session/i }),
    ).toBeInTheDocument();
    // Path hint reflects today's UTC date.
    const date = todayDatePrefix();
    expect(screen.getByText(/Path:/).textContent).toContain(date);
  });

  test("submit is disabled until a valid slug is typed", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    const submit = screen.getByRole("button", { name: /create session/i });
    expect(submit).toBeDisabled();

    const slugInput = screen.getByLabelText(/session slug/i);
    await user.type(slugInput, "launch-planning");
    expect(submit).not.toBeDisabled();
  });

  test("invalid characters get stripped from the slug input", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    const slugInput = screen.getByLabelText(/session slug/i) as HTMLInputElement;
    await user.type(slugInput, "Launch Planning!");
    // Spaces and ! removed; upper-case lowered.
    expect(slugInput.value).toBe("launchplanning");
  });

  test("selecting the planning template marks its card .on", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });

    // Blank starts on by default.
    const blank = document.querySelector('[data-template="blank"]');
    const planning = document.querySelector('[data-template="planning"]');
    expect(blank?.className).toMatch(/\bon\b/);
    expect(planning?.className).not.toMatch(/\bon\b/);

    await user.click(planning as HTMLElement);
    expect(planning?.className).toMatch(/\bon\b/);
    expect(blank?.className).not.toMatch(/\bon\b/);
  });

  test("submit calls createSession then postProse with the template's starter body", async () => {
    const user = userEvent.setup();

    const fetchMock = vi
      .fn()
      .mockImplementation((url: string | URL) => {
        const u = String(url);
        if (u.endsWith("/sessions") && !u.includes("?")) {
          // Both create + list end with /sessions; differentiate by method on caller side.
          return Promise.resolve(
            jsonResponse({
              id: "2026-05-22-launch-planning",
              slug: "launch-planning",
              created_at: "2026-05-22T10:00:00Z",
            }),
          );
        }
        if (u.endsWith("/events/prose")) {
          return Promise.resolve(
            jsonResponse({ filename: "20260522T_us-a7f3.prose.md" }),
          );
        }
        return Promise.resolve(jsonResponse({}));
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });

    await user.type(
      screen.getByLabelText(/session slug/i),
      "launch-planning",
    );
    const planning = document.querySelector(
      '[data-template="planning"]',
    ) as HTMLElement;
    await user.click(planning);

    await user.click(screen.getByRole("button", { name: /create session/i }));

    await act(async () => {
      // Let the async chain (create → postProse → listSessions → setCurrentSession) settle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // First call: POST /sessions with slug.
    const createCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).endsWith("/sessions") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(createCall).toBeDefined();
    const createBody = JSON.parse(
      (createCall![1] as RequestInit).body as string,
    );
    expect(createBody).toEqual({ slug: "launch-planning" });

    // Second call: POST /sessions/<id>/events/prose with the planning starter body.
    const proseCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/events/prose"),
    );
    expect(proseCall).toBeDefined();
    const proseBody = JSON.parse(
      (proseCall![1] as RequestInit).body as string,
    );
    expect(proseBody.participant_id).toBe("us-a7f3");
    expect(proseBody.name).toBe("Goals & constraints");
    expect(proseBody.content).toContain("# Goals");
    expect(proseBody.content).toContain("# Constraints");
    expect(proseBody.content).toContain("# Open questions");

    // Modal closed; activeModal back to null.
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("submit with the Blank template skips postProse", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            id: "2026-05-22-x",
            slug: "x",
            created_at: "2026-05-22T10:00:00Z",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    await user.type(screen.getByLabelText(/session slug/i), "x");
    await user.click(screen.getByRole("button", { name: /create session/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // No /events/prose call should have been issued for the blank template.
    const proseCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/events/prose"),
    );
    expect(proseCall).toBeUndefined();
  });

  test("clicking the X (close button) closes the modal", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    expect(useStore.getState().activeModal).toBe("new-session");
    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("clicking the backdrop closes the modal", async () => {
    const user = userEvent.setup();
    const { container } = render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("clicking inside the modal does NOT close it (stopPropagation)", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    // Clicking on the dialog itself shouldn't bubble to the backdrop's onClick.
    await user.click(screen.getByRole("dialog"));
    expect(useStore.getState().activeModal).toBe("new-session");
  });

  test("Escape key closes the modal", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    expect(useStore.getState().activeModal).toBe("new-session");
    await user.keyboard("{Escape}");
    expect(useStore.getState().activeModal).toBeNull();
  });

  test("agent invite chips list registered agents and toggle on/off", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    const claudeChip = screen.getByRole("button", { name: /Claude/ });
    expect(claudeChip).toHaveAttribute("aria-pressed", "false");
    await user.click(claudeChip);
    expect(claudeChip).toHaveAttribute("aria-pressed", "true");
  });

  test("'+ Invite new agent' chip toggles the inline registration form", async () => {
    const user = userEvent.setup();
    render(<ModalRoot />);
    act(() => {
      useStore.getState().openModal("new-session");
    });
    const inviteNew = screen.getByRole("button", {
      name: /Invite new agent/i,
    });
    await user.click(inviteNew);
    expect(screen.getByLabelText(/new agent name/i)).toBeInTheDocument();
  });

  test("opens the modal from Sessions panel '+ NEW' button", async () => {
    const { Sessions } = await import("../../src/panels/Sessions.js");
    const user = userEvent.setup();
    // Stub the WS + sessions list fetch — Sessions panel mounts a WS.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ sessions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    // jsdom doesn't define WebSocket — provide a noop stub.
    class MockWs {
      close(): void {}
      addEventListener(): void {}
    }
    vi.stubGlobal("WebSocket", MockWs);

    render(<Sessions />);
    const newBtn = screen.getByRole("button", {
      name: /Start a new session/i,
    });
    expect(newBtn).not.toBeDisabled();
    await user.click(newBtn);
    expect(useStore.getState().activeModal).toBe("new-session");
  });
});
