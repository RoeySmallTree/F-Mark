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
import type {
  AccessRequestPayload,
  AnyEventRecord,
  Participant,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";
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
  "ag-c92e": {
    kind: "agent",
    name: "Claude",
    color: "#b86a1f",
    active_session: MOCK_SESSION.id,
  },
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

function makeAccessRequestEvent(
  overrides: Partial<AccessRequestPayload> = {},
): AnyEventRecord {
  const payload: AccessRequestPayload = {
    schema: "fmark.access-request.v1",
    request_id: "ar-compose-1",
    status: "open",
    request_type: "command",
    runtime_id: "codex",
    hook_event_name: "TerminalApproval",
    title: "Bash command",
    command: "echo ok",
    response_channel: "terminal",
    created_at: "2026-06-10T12:00:00Z",
    ...overrides,
  };
  return {
    filename: "20260610T120000Z_ag-c92e.access-request.json",
    timestamp: "2026-06-10T12:00:00Z",
    participant_id: "ag-c92e",
    kind: "access-request",
    payload,
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
      commentTarget: { kind: "event", file: "evt.prose.md", lines: [3, 3] },
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
      commentTarget: { kind: "event", file: "x.prose.md", lines: [1, 1] },
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

describe("Compose — staged attachments", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  function stagedAttachmentResponse(id: string, displayName: string): Response {
    return jsonResponse({
      id,
      display_name: displayName,
      path: `attachments/${id}/${displayName}`,
      mime_type: "image/png",
      size_bytes: 11,
      preview_kind: "image",
    });
  }

  test("pasting a file uploads it as a staged attachment and renders a chip", async () => {
    const file = new File(["image-bytes"], "screenshot.png", {
      type: "image/png",
    });
    const fetchMock = vi.fn().mockImplementation(async () =>
      stagedAttachmentResponse("att_aaaa00000001", "screenshot.png"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", { bubbles: true, cancelable: true });
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
    expect(body.get("display_name")).toBe("screenshot.png");
    expect(body.get("file")).toBe(file);

    await waitFor(() => {
      expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    });
    /* The file is NOT typed into the textarea. */
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    /* No prose or file event is written on paste. */
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("/events/")),
    ).toBe(false);
  });

  test("clipboard image items (rather than DataTransfer.files) also stage", async () => {
    const file = new File(["png"], "image.png", { type: "image/png" });
    const fetchMock = vi.fn().mockImplementation(async () =>
      stagedAttachmentResponse("att_bbbb00000002", "image.png"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", { bubbles: true, cancelable: true });
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
    expect(
      ((fetchMock.mock.calls[0]![1] as RequestInit).body as FormData).get(
        "file",
      ),
    ).toBe(file);
    await waitFor(() => {
      expect(screen.getByText("image.png")).toBeInTheDocument();
    });
  });

  test("upload failures show in the composer alert instead of the chip size line", async () => {
    const file = new File(["oversized"], "huge.png", { type: "image/png" });
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ error: "request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [] },
    });
    fireEvent(textarea, event);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("huge.png");
    expect(alert).toHaveTextContent("request body too large");
    const chip = container.querySelector(".compose-attachment");
    expect(chip).toHaveTextContent("huge.png");
    expect(chip).toHaveTextContent("9 B");
    expect(chip).not.toHaveTextContent("request body too large");
  });

  test("removing a staged chip DELETEs the staged upload", async () => {
    const file = new File(["x"], "doc.txt", { type: "text/plain" });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/attachments")) {
        return jsonResponse({
          id: "att_cccc00000003",
          display_name: "doc.txt",
          path: "attachments/att_cccc00000003/doc.txt",
          mime_type: "text/plain",
          size_bytes: 1,
          preview_kind: "text",
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [] },
    });
    fireEvent(textarea, event);

    await waitFor(() => {
      expect(screen.getByText("doc.txt")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /remove doc\.txt/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) =>
            String(u).endsWith("/attachments/att_cccc00000003") &&
            (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });
    expect(screen.queryByText("doc.txt")).toBeNull();
  });

  test("send with prose + attachment writes prose then file event with append_to", async () => {
    const file = new File(["x"], "shot.png", { type: "image/png" });
    const proseFilename = "20260524T120000Z_us-a7f3.prose.md";
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const u = String(url);
        if (method === "POST" && u.endsWith("/attachments")) {
          return jsonResponse({
            id: "att_dddd00000004",
            display_name: "shot.png",
            path: "attachments/att_dddd00000004/shot.png",
            mime_type: "image/png",
            size_bytes: 1,
            preview_kind: "image",
          });
        }
        if (method === "POST" && u.endsWith("/events/prose")) {
          return jsonResponse({ filename: proseFilename });
        }
        if (method === "POST" && u.endsWith("/events/file")) {
          return jsonResponse({ filename: "20260524T120001Z_us-a7f3.file.json" });
        }
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [] },
    });
    fireEvent(textarea, event);

    await waitFor(() => {
      expect(screen.getByText("shot.png")).toBeInTheDocument();
    });

    await user.click(textarea);
    await user.type(textarea, "look at this");
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      const fileCalls = fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u).endsWith("/events/file") &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(fileCalls).toHaveLength(1);
    });

    const proseCall = fetchMock.mock.calls.find(([u]) =>
      String(u).endsWith("/events/prose"),
    );
    expect(proseCall).toBeDefined();
    const proseBody = JSON.parse((proseCall![1] as RequestInit).body as string);
    expect(proseBody.content).toBe("look at this");

    const fileCall = fetchMock.mock.calls.find(([u]) =>
      String(u).endsWith("/events/file"),
    );
    const fileBody = JSON.parse((fileCall![1] as RequestInit).body as string);
    expect(fileBody.id).toBe("att_dddd00000004");
    expect(fileBody.append_to).toBe(proseFilename);
    expect(fileBody.display_name).toBe("shot.png");
    expect(fileBody.preview_kind).toBe("image");
  });

  test("send attachments-only writes standalone file event (no prose, no append_to)", async () => {
    const file = new File(["x"], "lone.png", { type: "image/png" });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const u = String(url);
        if (method === "POST" && u.endsWith("/attachments")) {
          return jsonResponse({
            id: "att_eeee00000005",
            display_name: "lone.png",
            path: "attachments/att_eeee00000005/lone.png",
            mime_type: "image/png",
            size_bytes: 1,
            preview_kind: "image",
          });
        }
        if (method === "POST" && u.endsWith("/events/file")) {
          return jsonResponse({ filename: "f.json" });
        }
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    const textarea = screen.getByLabelText(/compose message/i);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file], items: [] },
    });
    fireEvent(textarea, event);

    await waitFor(() => {
      expect(screen.getByText("lone.png")).toBeInTheDocument();
    });

    await user.click(textarea);
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      const fileCalls = fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u).endsWith("/events/file") &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(fileCalls).toHaveLength(1);
    });

    const proseCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).endsWith("/events/prose"),
    );
    expect(proseCalls).toHaveLength(0);

    const fileCall = fetchMock.mock.calls.find(([u]) =>
      String(u).endsWith("/events/file"),
    );
    const fileBody = JSON.parse((fileCall![1] as RequestInit).body as string);
    expect(fileBody.id).toBe("att_eeee00000005");
    expect(fileBody.append_to).toBeUndefined();
  });

  test("drag over compose-inner shows overlay; drop stages the file", async () => {
    const file = new File(["x"], "dropped.png", { type: "image/png" });
    const fetchMock = vi.fn().mockImplementation(async () =>
      stagedAttachmentResponse("att_ffff00000006", "dropped.png"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Compose />);
    const inner = container.querySelector(".compose-inner") as HTMLDivElement;
    expect(inner).toBeTruthy();

    const makeDragEvent = (type: string): DragEvent => {
      const ev = new Event(type, {
        bubbles: true,
        cancelable: true,
      }) as DragEvent;
      Object.defineProperty(ev, "dataTransfer", {
        value: {
          types: ["Files"],
          files: [file],
          dropEffect: "",
        },
      });
      return ev;
    };

    fireEvent(inner, makeDragEvent("dragenter"));
    expect(inner.className).toContain("is-dragging-files");
    expect(screen.getByText(/drop to attach/i)).toBeInTheDocument();

    fireEvent(inner, makeDragEvent("drop"));
    expect(inner.className).not.toContain("is-dragging-files");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `/sessions/${MOCK_SESSION.id}/attachments`,
    );
  });

  test("clicking the Attach button opens a file picker", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Compose />);

    const inputs = document.querySelectorAll("input[type='file']");
    expect(inputs.length).toBeGreaterThan(0);
    const fileInput = inputs[0] as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    await user.click(screen.getByRole("button", { name: /attach a file/i }));

    expect(clickSpy).toHaveBeenCalled();
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
      commentTarget: { kind: "event", file: "x.prose.md", lines: [1, 1] },
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

describe("Compose — pending approval actions", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders pending approval as inline actions instead of a dropdown menu", () => {
    resetStore({
      events: [
        makeAccessRequestEvent({
          suggestions: [
            { id: "yes", label: "Yes", decision: "approve", scope: "once" },
            {
              id: "allow-session",
              label: "Yes, and allow access to .bin/ and timeout 10 commands",
              decision: "approve",
              scope: "session",
            },
            { id: "no", label: "No", decision: "deny", scope: "once" },
          ],
        }),
      ],
    });

    const { container } = render(<Compose />);

    expect(
      screen.getByRole("group", { name: /pending approval actions/i }),
    ).toHaveAttribute("data-state", "pending");
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show request/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^approve: yes$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /approve: yes, and allow access/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^deny: no$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeInTheDocument();
    expect(container.querySelector(".primary-action-menu")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("show request focuses the request and provider choices use the response API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const target = document.createElement("div");
    target.dataset.accessRequestId = "ar-compose-1";
    target.scrollIntoView = vi.fn();
    document.body.append(target);
    resetStore({
      events: [
        makeAccessRequestEvent({
          suggestions: [
            {
              id: "allow-session",
              label: "Yes, and allow for this session",
              decision: "approve",
              scope: "session",
            },
            { id: "no", label: "No", decision: "deny" },
          ],
        }),
      ],
    });

    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /show request/i }));
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(target.classList.contains("access-request-card-highlight")).toBe(true);

    await user.click(
      screen.getByRole("button", {
        name: /approve: yes, and allow for this session/i,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "/managed-agents/ag-c92e/access-requests/ar-compose-1/respond",
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      session_id: MOCK_SESSION.id,
      participant_id: "us-a7f3",
      decision: "approve",
      option_id: "allow-session",
    });
    target.remove();
  });

  test("falls back to direct Approve and Deny buttons when provider options are absent", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    resetStore({ events: [makeAccessRequestEvent()] });

    render(<Compose />);

    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^deny$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^deny$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      decision: "deny",
    });
    expect(JSON.parse(String((init as RequestInit).body))).not.toHaveProperty(
      "option_id",
    );
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
      commentTarget: { kind: "event", file: "evt.prose.md", lines: [3, 5] },
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

  test("assignee options are scoped to current-session agents", async () => {
    const user = userEvent.setup();
    installCreateTodoFetch();
    resetStore({
      participants: {
        ...PARTICIPANTS,
        "ag-other": {
          kind: "agent",
          name: "Other session",
          color: "#10b981",
          active_session: "2026-05-22-other",
        },
        "ag-detached": {
          kind: "agent",
          name: "Detached",
          color: "#8b5cf6",
          active_session: null,
        },
      },
    });
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /open create todo/i }));

    const assignee = screen.getByLabelText(/^assignee$/i);
    expect(assignee).toHaveValue("ag-c92e");
    expect(screen.getByRole("option", { name: "Claude" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Other session" }),
    ).toBeNull();
    expect(screen.queryByRole("option", { name: "Detached" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Roey" })).toBeNull();
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

describe("Compose — wake-on-send gating", () => {
  const MESSAGE_ENDS_TURN_KEY = "fmark:settings:message-ends-turn";

  beforeEach(() => {
    try {
      globalThis.localStorage?.removeItem(MESSAGE_ENDS_TURN_KEY);
    } catch {
      /* ignore */
    }
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    try {
      globalThis.localStorage?.removeItem(MESSAGE_ENDS_TURN_KEY);
    } catch {
      /* ignore */
    }
  });

  function installFetchMock(): ReturnType<typeof vi.fn> {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ filename: "f" }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function wakeCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((u) => /\/sessions\/.+\/wake$/.test(u));
  }

  test("Send with messageEndsTurn off and no mentions does NOT call wake", async () => {
    globalThis.localStorage?.setItem(MESSAGE_ENDS_TURN_KEY, "false");
    const fetchMock = installFetchMock();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "still drafting");
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls
          .map(([url]) => String(url))
          .filter((u) => u.endsWith("/events/prose")),
      ).toHaveLength(1);
    });
    /* prose posted; turn-end NOT posted; wake NOT called. */
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.endsWith("/events/turn-end"))).toHaveLength(0);
    expect(wakeCalls(fetchMock)).toHaveLength(0);
  });

  test("Send with messageEndsTurn off but a mention still wakes the mentioned agent", async () => {
    globalThis.localStorage?.setItem(MESSAGE_ENDS_TURN_KEY, "false");
    /* The mention picker fetches /managed-agents/status?session_id=… and
       filters by `active_session === sessionId && managed`. Return one
       Claude row so the popover shows a clickable option. */
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/managed-agents/status")) {
          return jsonResponse({
            agents: [
              {
                participant_id: "ag-c92e",
                display_name: "Claude",
                runtime_id: "claude",
                active_session: MOCK_SESSION.id,
                runtime_session: null,
                managed: true,
                paused: false,
                connection_state: "connected",
                activity_state: "idle",
                tmux_session: "claude-1",
                mcp_status: "installed",
                hook_status: "installed",
                context: {
                  status: "not-reported",
                  used_tokens: null,
                  max_tokens: null,
                  source: "not-reported",
                  reason: "Context usage is not reported.",
                },
                access: { mode: "default", supported_modes: ["default"], change_supported: false },
                pending_access_count: 0,
              },
            ],
            capabilities: {},
          });
        }
        return jsonResponse({ filename: "f" });
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    await user.click(screen.getByRole("button", { name: /Mention agent/i }));
    /* The choice row button has no aria-label; its accessible name comes
       from text content (display name + participant id). Match on the id
       to stay robust to display-name changes. */
    const claudeOption = await screen.findByRole("button", {
      name: /ag-c92e/,
    });
    await user.click(claudeOption);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "heads up");
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      expect(wakeCalls(fetchMock)).toHaveLength(1);
    });
    const wake = wakeCalls(fetchMock)[0]!;
    const wakeBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([url]) => String(url) === wake)![1] as
            | RequestInit
            | undefined
        )?.body ?? "{}",
      ),
    );
    expect(wakeBody.reason).toBe("mention");
    expect(wakeBody.target_participant_ids).toContain("ag-c92e");
  });

  test("Send with messageEndsTurn on (default) calls wake with reason 'user-message'", async () => {
    /* Default localStorage state means messageEndsTurn = true. */
    const fetchMock = installFetchMock();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "done thinking");
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      expect(wakeCalls(fetchMock)).toHaveLength(1);
    });
    const wake = wakeCalls(fetchMock)[0]!;
    const wakeBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([url]) => String(url) === wake)![1] as
            | RequestInit
            | undefined
        )?.body ?? "{}",
      ),
    );
    expect(wakeBody.reason).toBe("user-message");
  });

  test("End Turn hotkey ⌘↵ with empty draft calls wake", async () => {
    /* messageEndsTurn doesn't matter here — the empty-draft branch wakes
       unconditionally on End Turn intent. */
    globalThis.localStorage?.setItem(MESSAGE_ENDS_TURN_KEY, "false");
    const fetchMock = installFetchMock();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    /* No textarea content → ⌘↵ triggers the empty-content End Turn branch. */
    await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.filter((u) => u.endsWith("/events/turn-end"))).toHaveLength(1);
      expect(wakeCalls(fetchMock)).toHaveLength(1);
    });
    const wake = wakeCalls(fetchMock)[0]!;
    const wakeBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([url]) => String(url) === wake)![1] as
            | RequestInit
            | undefined
        )?.body ?? "{}",
      ),
    );
    expect(wakeBody.reason).toBe("user-message");
  });

  test("End Turn button click with empty draft also calls wake", async () => {
    /* The visible primary End-Turn button must produce the same wake as
       the hotkey path — both should route through endTurnAndWake. */
    globalThis.localStorage?.setItem(MESSAGE_ENDS_TURN_KEY, "false");
    const fetchMock = installFetchMock();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    render(<Compose />);

    /* Empty draft → the primary action renders as "End turn". */
    const endTurnButton = screen.getByRole("button", { name: /^End turn$/i });
    await user.click(endTurnButton);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.filter((u) => u.endsWith("/events/turn-end"))).toHaveLength(1);
      expect(wakeCalls(fetchMock)).toHaveLength(1);
    });
    const wake = wakeCalls(fetchMock)[0]!;
    const wakeBody = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(([url]) => String(url) === wake)![1] as
            | RequestInit
            | undefined
        )?.body ?? "{}",
      ),
    );
    expect(wakeBody.reason).toBe("user-message");
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
