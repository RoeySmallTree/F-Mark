/* Phase 6 — compose bar + global hotkeys. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  render,
  screen,
  within,
  cleanup,
  act,
  waitFor,
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

  test("renders two mode buttons; clicking each updates store.composeMode", async () => {
    const user = userEvent.setup();
    /* Provide a comment target so the Comment pill is enabled. The
       Message pill was removed in the cluster-redesign pass — message
       is the implicit default mode (no pill needed for it). */
    resetStore({
      commentTarget: { file: "test.prose.md", lines: [1, 1] },
      composeMode: "message",
    });
    render(<Compose />);

    expect(
      screen.queryByRole("button", { name: /message mode/i }),
    ).toBeNull();
    const namedBtn = screen.getByRole("button", { name: /name it mode/i });
    const commentBtn = screen.getByRole("button", { name: /comment mode/i });
    expect(namedBtn).toBeInTheDocument();
    expect(commentBtn).toBeInTheDocument();

    await user.click(namedBtn);
    expect(useStore.getState().composeMode).toBe("named");

    /* Clicking the active mode toggles back to message (the implicit
       default). */
    await user.click(namedBtn);
    expect(useStore.getState().composeMode).toBe("message");

    await user.click(commentBtn);
    expect(useStore.getState().composeMode).toBe("comment");
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

  test("⌘↵ in comment mode posts new-shape comment and clears commentTarget", async () => {
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
    /* Composable-prose Phase 2: comments POST the new shape. */
    expect(body.target).toBeUndefined();
    expect(body.append_to).toBe("evt.prose.md");
    expect(body.mode).toBe("comment");
    expect(body.lines).toEqual([3, 3]);
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

  test("Escape clears commentTarget while the compose textarea is focused", async () => {
    const user = userEvent.setup();
    resetStore({
      commentTarget: { file: "x.prose.md", lines: [1, 1] },
      composeMode: "comment",
    });
    render(<Compose />);
    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    expect(document.activeElement).toBe(ta);
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

  test("message mode: empty content → only End turn (cluster collapsed); typed content → Send + End turn", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    const { container } = render(<Compose />);
    /* No content → cluster shows only End turn; Send is hidden. */
    const cluster = container.querySelector(".send-cluster") as HTMLElement;
    expect(cluster).toBeTruthy();
    expect(cluster.classList.contains("empty")).toBe(true);
    expect(container.querySelector(".send-cluster-send")).toBeNull();
    const endOnly = container.querySelector(".end-turn-btn") as HTMLElement;
    expect(endOnly).toBeTruthy();
    expect(endOnly).toHaveTextContent(/End turn/i);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "hi");

    /* Content present → cluster gains has-send, Send button renders. */
    const clusterAfter = container.querySelector(".send-cluster") as HTMLElement;
    expect(clusterAfter.classList.contains("has-send")).toBe(true);
    const send = container.querySelector(".send-cluster-send") as HTMLElement;
    expect(send).toBeTruthy();
    expect(send).toHaveTextContent(/Send/i);
    const endTurn = container.querySelector(".end-turn-btn") as HTMLElement;
    expect(endTurn).toHaveTextContent(/End turn/i);
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
