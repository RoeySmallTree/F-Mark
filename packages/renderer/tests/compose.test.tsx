/* Phase 6 — compose bar + global hotkeys. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant } from "@f-mark/shared";
import { Compose } from "../src/compose/Compose.js";
import { useStore } from "../src/state/store.js";
import { _isMacPlatform } from "../src/hooks/useHotkeys.js";
import type { SessionMeta } from "../src/api/client.js";

// $mod resolves to ⌘ on macOS / Ctrl elsewhere. Tests need to send the same.
const MOD_OPEN = _isMacPlatform() ? "{Meta>}" : "{Control>}";
const MOD_CLOSE = _isMacPlatform() ? "{/Meta}" : "{/Control}";

const MOCK_SESSION: SessionMeta = {
  id: "2026-05-22-launch-planning",
  slug: "launch-planning",
  created_at: "2026-05-22T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function resetStore(overrides: Partial<ReturnType<typeof useStore.getState>> = {}): void {
  useStore.setState({
    token: null,
    sessions: [MOCK_SESSION],
    currentSessionId: MOCK_SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    ...overrides,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Compose — mode buttons", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders three mode buttons; clicking each updates store.composeMode", async () => {
    const user = userEvent.setup();
    // Provide a comment target so the Comment pill is enabled.
    resetStore({
      commentTarget: { file: "test.prose.md", lines: [1, 1] },
      composeMode: "message",
    });
    const { container } = render(<Compose />);

    const modeBtns = container.querySelectorAll(".mode-btn");
    // ModeBar yields 3 mode buttons + 2 placeholder (presets/skills) buttons.
    // Filter to only those with mode labels.
    const messageBtn = screen.getByRole("button", { name: /message mode/i });
    const namedBtn = screen.getByRole("button", { name: /name it mode/i });
    const commentBtn = screen.getByRole("button", { name: /comment mode/i });
    expect(messageBtn).toBeInTheDocument();
    expect(namedBtn).toBeInTheDocument();
    expect(commentBtn).toBeInTheDocument();
    expect(modeBtns.length).toBeGreaterThanOrEqual(3);

    await user.click(namedBtn);
    expect(useStore.getState().composeMode).toBe("named");

    await user.click(commentBtn);
    expect(useStore.getState().composeMode).toBe("comment");

    // Clicking the active mode toggles back to message.
    await user.click(commentBtn);
    expect(useStore.getState().composeMode).toBe("message");
  });

  test("Comment pill is disabled when there's no commentTarget", () => {
    resetStore({ commentTarget: null, composeMode: "message" });
    render(<Compose />);
    const commentBtn = screen.getByRole("button", { name: /comment mode/i });
    expect(commentBtn).toBeDisabled();
  });
});

describe("Compose — hotkeys", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("⌘N toggles named mode and reveals the name input", async () => {
    const user = userEvent.setup();
    const { container } = render(<Compose />);

    expect(useStore.getState().composeMode).toBe("message");
    expect(container.querySelector(".compose-name")).toBeNull();

    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("named");
    expect(container.querySelector(".compose-name")).not.toBeNull();
    expect(
      screen.getByPlaceholderText(/Name this contribution/i),
    ).toBeInTheDocument();

    // Press ⌘N again → toggles back to message.
    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("message");
    expect(container.querySelector(".compose-name")).toBeNull();
  });

  test("⌘/ toggles comment mode when commentTarget is set; otherwise forces Message", async () => {
    const user = userEvent.setup();
    // No target first: starts named, ⌘/ should force message.
    resetStore({ commentTarget: null, composeMode: "named" });
    render(<Compose />);
    expect(useStore.getState().composeMode).toBe("named");
    await user.keyboard(`${MOD_OPEN}/${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("message");
    cleanup();

    // Now with a target: ⌘/ flips message↔comment.
    resetStore({
      commentTarget: { file: "x.prose.md", lines: [1, 1] },
      composeMode: "message",
    });
    render(<Compose />);
    // Note: store.setCommentTarget itself flips mode to 'comment' — we set
    // mode='message' AFTER, so we begin in message here.
    expect(useStore.getState().composeMode).toBe("message");
    await user.keyboard(`${MOD_OPEN}/${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("comment");
    await user.keyboard(`${MOD_OPEN}/${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("message");
  });

  test("⌘↵ submits the active mode (calls postProse with right body)", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ filename: "20260522T_us-a7f3.prose.md" }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "Hello world");

    // ⌘+Enter → submit.
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    // Allow the async submit promise to resolve.
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/events\/prose$/);
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      participant_id: "us-a7f3",
      content: "Hello world",
    });
  });

  test("⌘↵ in named mode sends prose with a name", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ filename: "f" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({ composeMode: "named" });
    render(<Compose />);

    const nameInput = screen.getByPlaceholderText(/Name this contribution/i);
    await user.click(nameInput);
    await user.type(nameInput, "My Title");

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "named body");

    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.name).toBe("My Title");
    expect(body.content).toBe("named body");
  });

  test("⌘↵ in comment mode posts target and clears commentTarget", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ filename: "f" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const target = { file: "evt.prose.md", lines: [3, 3] as [number, number] };
    resetStore({
      commentTarget: target,
      composeMode: "comment",
    });
    render(<Compose />);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "a comment");

    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.target).toEqual(target);
    expect(useStore.getState().commentTarget).toBeNull();
  });

  test("Escape clears commentTarget when set", async () => {
    const user = userEvent.setup();
    resetStore({
      commentTarget: { file: "x.prose.md", lines: [1, 1] },
      composeMode: "comment",
    });
    render(<Compose />);
    expect(useStore.getState().commentTarget).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(useStore.getState().commentTarget).toBeNull();
  });
});

describe("Compose — send button label per mode", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("message mode: empty content → 'End turn' (outline); typed content → 'Send'", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    const { container } = render(<Compose />);
    let send = container.querySelector(".send-btn") as HTMLButtonElement;
    expect(send).toBeTruthy();
    expect(send).toHaveTextContent(/End turn/i);
    expect(send.classList.contains("outline")).toBe(true);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "hi");

    send = container.querySelector(".send-btn") as HTMLButtonElement;
    expect(send).toHaveTextContent(/Send/i);
    expect(send.classList.contains("outline")).toBe(false);
  });

  test("named mode shows 'End turn' as primary action", () => {
    resetStore({ composeMode: "named" });
    const { container } = render(<Compose />);
    const send = container.querySelector(".send-btn") as HTMLButtonElement;
    expect(send).toHaveTextContent(/End turn/i);
    expect(send.classList.contains("outline")).toBe(false);
  });

  test("comment mode shows 'Post comment'", () => {
    resetStore({
      commentTarget: { file: "x.prose.md", lines: [1, 1] },
      composeMode: "comment",
    });
    const { container } = render(<Compose />);
    const send = container.querySelector(".send-btn") as HTMLButtonElement;
    expect(send).toHaveTextContent(/Post comment/i);
  });
});

describe("Compose — TargetPill behavior", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders TargetPill when commentTarget is set; close button clears it", async () => {
    const user = userEvent.setup();
    resetStore({
      commentTarget: { file: "evt.prose.md", lines: [3, 5] },
      composeMode: "comment",
    });
    const { container } = render(<Compose />);
    const pill = container.querySelector(".compose-target");
    expect(pill).not.toBeNull();
    expect(within(pill as HTMLElement).getByText(/Commenting on/i)).toBeInTheDocument();
    // line label
    expect(pill!.textContent).toMatch(/lines 3.{1,3}5/);
    await user.click(
      within(pill as HTMLElement).getByRole("button", {
        name: /cancel comment target/i,
      }),
    );
    expect(useStore.getState().commentTarget).toBeNull();
  });
});

describe("useHotkeys — focus suppression", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("⌘N still fires while focus is in textarea (chord uses $mod)", async () => {
    const user = userEvent.setup();
    render(<Compose />);
    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    expect(document.activeElement).toBe(ta);
    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("named");
  });
});

describe("Compose — Presets (P8)", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("clicking the ⚡ Presets button opens the presets popover via the store", async () => {
    const user = userEvent.setup();
    render(<Compose />);
    expect(useStore.getState().activePopover.key).toBeNull();
    await user.click(screen.getByRole("button", { name: /Open presets/i }));
    expect(useStore.getState().activePopover.key).toBe("presets");
    expect(useStore.getState().activePopover.anchorRect).not.toBeNull();
  });

  test("⌘P opens the presets popover", async () => {
    const user = userEvent.setup();
    render(<Compose />);
    expect(useStore.getState().activePopover.key).toBeNull();
    await user.keyboard(`${MOD_OPEN}p${MOD_CLOSE}`);
    expect(useStore.getState().activePopover.key).toBe("presets");
  });

  test("composeDraft populates the textarea when empty (replace)", async () => {
    render(<Compose />);
    const ta = screen.getByLabelText(/Compose message/i) as HTMLTextAreaElement;
    expect(ta.value).toBe("");
    act(() => {
      useStore.getState().setComposeDraft("Generate 3 variations of this.");
    });
    /* Wait for the useEffect to flush + the queueMicrotask. */
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe("Generate 3 variations of this.");
    /* Draft is cleared so future inserts are detected as new. */
    expect(useStore.getState().composeDraft).toBeNull();
  });

  test("composeDraft appends with a blank line when textarea is non-empty", async () => {
    const user = userEvent.setup();
    render(<Compose />);
    const ta = screen.getByLabelText(/Compose message/i) as HTMLTextAreaElement;
    await user.click(ta);
    await user.type(ta, "Existing");
    act(() => {
      useStore.getState().setComposeDraft("Preset body.");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe("Existing\n\nPreset body.");
  });
});
