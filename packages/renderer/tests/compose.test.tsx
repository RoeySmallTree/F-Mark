/* Phase 6 — compose bar + global hotkeys. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant, TodoPayload, TodoTreeNode } from "@f-mark/shared";
import { Compose } from "../src/compose/Compose.js";
import { useStore } from "../src/state/store.js";
import { _isMacPlatform } from "../src/hooks/useHotkeys.js";
import type { SessionMeta, TodoListResponse } from "../src/api/client.js";

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

function flattenTodos(nodes: TodoTreeNode[]): TodoTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTodos(node.children)]);
}

function todoPayload(node: TodoTreeNode): TodoPayload {
  const payload: TodoPayload = {
    id: node.id,
    title: node.title,
    status: node.status,
  };
  if (node.body !== undefined) payload.body = node.body;
  if (node.assigned_to !== undefined) payload.assigned_to = node.assigned_to;
  if (node.parent_id !== undefined) payload.parent_id = node.parent_id;
  return payload;
}

function todoListResponse(tree: TodoTreeNode[]): TodoListResponse {
  const items = flattenTodos(tree);
  return {
    open: items.filter((item) => item.status === "open").map(todoPayload),
    wip: items.filter((item) => item.status === "wip").map(todoPayload),
    done: items.filter((item) => item.status === "done").map(todoPayload),
    tree,
  };
}

function installCreateTodoFetch(tree: TodoTreeNode[] = []): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.endsWith(`/sessions/${MOCK_SESSION.id}/todos`)) {
        return jsonResponse(todoListResponse(tree));
      }
      if (method === "POST" && url.endsWith("/events/todo")) {
        return jsonResponse({ filename: "20260522T120000Z_us-a7f3.todo.json" });
      }
      if (method === "POST" && url.endsWith("/events/turn-end")) {
        return jsonResponse({ filename: "20260522T120001Z_us-a7f3.turn-end.json" });
      }
      return jsonResponse({});
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postedBodies(
  fetchMock: ReturnType<typeof vi.fn>,
  suffix: string,
): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith(suffix))
    .map(([, init]) =>
      JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")),
    ) as Record<string, unknown>[];
}

describe("Compose — mode buttons", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Name-it chip activates named mode; × cancels back to message", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    expect(
      screen.queryByRole("button", { name: /message mode/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /comment mode/i }),
    ).toBeNull();

    // Chip is hidden when the textarea is empty.
    expect(
      screen.queryByRole("button", { name: /name this contribution/i }),
    ).toBeNull();

    // Typing in the textarea reveals the collapsed chip.
    const textarea = screen.getByLabelText(/compose message/i);
    await user.type(textarea, "hello");

    // Collapsed chip → activates named mode.
    const chip = screen.getByRole("button", {
      name: /name this contribution/i,
    });
    expect(chip).toBeInTheDocument();
    await user.click(chip);
    expect(useStore.getState().composeMode).toBe("named");

    // Expanded form has a × cancel button that returns to message mode.
    const cancel = screen.getByRole("button", { name: /cancel naming/i });
    await user.click(cancel);
    expect(useStore.getState().composeMode).toBe("message");
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
    expect(container.querySelector(".name-chip-expanded")).toBeNull();

    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("named");
    expect(container.querySelector(".name-chip-expanded")).not.toBeNull();
    expect(
      screen.getByPlaceholderText(/Name this contribution/i),
    ).toBeInTheDocument();

    // Press ⌘N again → toggles back to message.
    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("message");
    expect(container.querySelector(".name-chip-expanded")).toBeNull();
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

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.filter((u) => u.endsWith("/events/prose"))).toHaveLength(1);
      // We removed messageEndsTurn from store so it defaults to true via localStorage read.
      expect(urls.filter((u) => u.endsWith("/events/turn-end"))).toHaveLength(1);
    }, { timeout: 2000 });
    const proseCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/events/prose"),
    );
    expect(proseCall).toBeDefined();
    const [url, init] = proseCall!;
    expect(String(url)).toMatch(/\/events\/prose$/);
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      participant_id: "us-a7f3",
      content: "Hello world",
    });
  });

  test("⌘↵ in empty message mode ends the turn without posting prose", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ filename: "turn-end" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.filter((u) => u.endsWith("/events/turn-end"))).toHaveLength(1);
      expect(urls.filter((u) => u.endsWith("/events/prose"))).toHaveLength(0);
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

  test("legacy comment compose mode is coerced back to message mode", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ filename: "f" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({
      commentTarget: { file: "evt.prose.md", lines: [3, 3] },
      composeMode: "comment",
    });
    render(<Compose />);
    await waitFor(() => {
      expect(useStore.getState().composeMode).toBe("message");
    });

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "plain message");

    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      participant_id: "us-a7f3",
      content: "plain message",
    });
    expect(useStore.getState().commentTarget).not.toBeNull();
  });

  test("Escape blurs the compose textarea without clearing focused comments", async () => {
    const user = userEvent.setup();
    resetStore({
      commentTarget: { file: "x.prose.md", lines: [1, 1] },
      composeMode: "message",
    });
    render(<Compose />);
    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    expect(document.activeElement).toBe(ta);
    await user.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(ta);
    expect(useStore.getState().commentTarget).not.toBeNull();
  });
});

describe("Compose — pasted attachments", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("pasting a file into the textarea uploads it as an attachment", async () => {
    const file = new File(["image-bytes"], "screenshot.png", {
      type: "image/png",
    });
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({
        filename: "20260524T120000Z_us-a7f3.file.json",
        timestamp: "20260524T120000Z",
        participant_id: "us-a7f3",
        kind: "file",
        payload: {
          schema: "fmark.file.v1",
          id: "att_test",
          display_name: "screenshot.png",
          path: "attachments/att_test/screenshot.png",
          mime_type: "image/png",
          size_bytes: 11,
          preview_kind: "image",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [] },
    });

    fireEvent(textarea, event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`/sessions/${MOCK_SESSION.id}/attachments`);
    expect((init as RequestInit).method).toBe("POST");
    const body = (init as RequestInit).body as FormData;
    expect(body.get("participant_id")).toBe("us-a7f3");
    expect(body.get("display_name")).toBe("screenshot.png");
    expect(body.get("file")).toBe(file);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  test("pasted clipboard image items also upload as attachments", async () => {
    const file = new File(["png"], "image.png", { type: "image/png" });
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({
        filename: "20260524T120000Z_us-a7f3.file.json",
        timestamp: "20260524T120000Z",
        participant_id: "us-a7f3",
        kind: "file",
        payload: {
          schema: "fmark.file.v1",
          id: "att_item",
          display_name: "image.png",
          path: "attachments/att_item/image.png",
          mime_type: "image/png",
          size_bytes: 3,
          preview_kind: "image",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [{ kind: "file", getAsFile: () => file }],
      },
    });

    fireEvent(textarea, event);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(((init as RequestInit).body as FormData).get("file")).toBe(file);
  });
});

describe("Compose — send button label per mode", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("message mode: empty content → End turn; typed content → Send", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    const { container } = render(<Compose />);
    const endOnly = container.querySelector(".primary-action") as HTMLElement;
    expect(endOnly).toBeTruthy();
    expect(endOnly).toHaveAttribute("data-state", "end-turn");
    expect(endOnly).toHaveAccessibleName(/End turn/i);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "hi");

    const send = container.querySelector(".primary-action") as HTMLElement;
    expect(send).toBeTruthy();
    expect(send).toHaveAttribute("data-state", "send");
    expect(send).toHaveAccessibleName(/Send message/i);
  });

  test("settings popover is accessible from compose actions", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    const { container } = render(<Compose />);
    const settingsBtn = container.querySelector("button[title='Compose settings']") as HTMLElement;
    expect(settingsBtn).toBeTruthy();
  });

  test("named mode shows 'End turn' as primary action", () => {
    resetStore({ composeMode: "named" });
    const { container } = render(<Compose />);
    const send = container.querySelector(".primary-action") as HTMLButtonElement;
    expect(send).toHaveAttribute("data-state", "end-turn");
    expect(send).toHaveAccessibleName(/End turn with named contribution/i);
    expect(send).toHaveTextContent(/End turn/i);
  });

  test("comment mode falls back to the message action", async () => {
    resetStore({
      commentTarget: { file: "x.prose.md", lines: [1, 1] },
      composeMode: "comment",
    });
    const { container } = render(<Compose />);
    await waitFor(() => {
      expect(useStore.getState().composeMode).toBe("message");
    });
    const send = container.querySelector(".primary-action") as HTMLButtonElement;
    expect(send).toHaveAttribute("data-state", "end-turn");
    expect(send).toHaveAccessibleName(/End turn/i);
  });
});

describe("Compose — focused comment target", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("does not render a compose TargetPill when commentTarget is set", () => {
    resetStore({
      commentTarget: { file: "evt.prose.md", lines: [3, 5] },
      composeMode: "message",
    });
    const { container } = render(<Compose />);
    expect(container.querySelector(".compose-target")).toBeNull();
    expect(useStore.getState().commentTarget).not.toBeNull();
  });
});

describe("Compose — Create Todo", () => {
  beforeEach(() => {
    try {
      globalThis.localStorage?.removeItem("fmark:settings:message-ends-turn");
    } catch {
      /* ignore */
    }
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    try {
      globalThis.localStorage?.removeItem("fmark:settings:message-ends-turn");
    } catch {
      /* ignore */
    }
  });

  test("clicking Create Todo opens a focused create form", async () => {
    const user = userEvent.setup();
    installCreateTodoFetch();
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));

    expect(
      screen.getByRole("dialog", { name: /create todo/i }),
    ).toBeInTheDocument();
    const title = screen.getByPlaceholderText(/task title/i);
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.getByLabelText(/^parent$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^assignee$/i)).toHaveValue("ag-c92e");
  });

  test("submitting with an empty title is rejected by the disabled create button", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));

    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
    expect(postedBodies(fetchMock, "/events/todo")).toHaveLength(0);
  });

  test("submitting title only posts an open todo assigned to a random agent", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));
    await user.type(screen.getByPlaceholderText(/task title/i), "Ship the fix");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(postedBodies(fetchMock, "/events/todo")).toHaveLength(1);
    });
    const body = postedBodies(fetchMock, "/events/todo")[0]!;
    expect(body).toMatchObject({
      participant_id: "us-a7f3",
      title: "Ship the fix",
      status: "open",
      assigned_to: "ag-c92e",
    });
    expect(body.id).toMatch(/^td-/);
    expect(body).not.toHaveProperty("body");
    expect(body).not.toHaveProperty("parent_id");
  });

  test("selecting a parent submits parent_id and preserves tree indentation in the dropdown", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch([
      {
        id: "parent",
        title: "Parent task",
        status: "open",
        children: [
          {
            id: "child",
            title: "Child task",
            status: "open",
            parent_id: "parent",
            children: [],
          },
        ],
      },
    ]);
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));
    const parentSelect = screen.getByLabelText(/^parent$/i);
    await waitFor(() => expect(parentSelect).not.toBeDisabled());
    expect(
      screen.getByRole("option", { name: /··· Child task/i }),
    ).toBeInTheDocument();
    await user.selectOptions(parentSelect, "parent");
    await user.type(screen.getByPlaceholderText(/task title/i), "Child work");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(postedBodies(fetchMock, "/events/todo")).toHaveLength(1);
    });
    expect(postedBodies(fetchMock, "/events/todo")[0]).toMatchObject({
      parent_id: "parent",
    });
  });

  test("selecting Unassigned submits without assigned_to", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));
    await user.selectOptions(screen.getByLabelText(/^assignee$/i), "");
    await user.type(screen.getByPlaceholderText(/task title/i), "Unowned task");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(postedBodies(fetchMock, "/events/todo")).toHaveLength(1);
    });
    expect(postedBodies(fetchMock, "/events/todo")[0]).not.toHaveProperty(
      "assigned_to",
    );
  });

  test("in message mode with ends-turn on, create is followed by turn-end", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));
    await user.type(screen.getByPlaceholderText(/task title/i), "End with task");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.filter((url) => url.endsWith("/events/todo"))).toHaveLength(1);
      expect(urls.filter((url) => url.endsWith("/events/turn-end"))).toHaveLength(
        1,
      );
      expect(urls.findIndex((url) => url.endsWith("/events/turn-end"))).toBeGreaterThan(
        urls.findIndex((url) => url.endsWith("/events/todo")),
      );
    });
  });

  test("outside message mode, create does not end the turn", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    resetStore({ composeMode: "named" });
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));
    await user.type(screen.getByPlaceholderText(/task title/i), "Named task");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(postedBodies(fetchMock, "/events/todo")).toHaveLength(1);
    });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith("/events/turn-end"))).toHaveLength(
      0,
    );
  });

  test("Escape closes the create todo popover", async () => {
    const user = userEvent.setup();
    installCreateTodoFetch();
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));
    expect(
      screen.getByRole("dialog", { name: /create todo/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /create todo/i }),
      ).toBeNull();
    });
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
