import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { TodoListResponse } from "../../src/api/client.js";
import { Todos } from "../../src/panels/Todos.js";
import { RightTodos } from "../../src/panels/right/RightTodos.js";
import { resetAutoFirstTodoReservations } from "../../src/panels/todoPanelUtils.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  jsonResponse,
  makeTodo,
  resetStore,
} from "../cards/_helpers.js";

function flatten(nodes: TodoTreeNode[]): TodoTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function responseFor(tree: TodoTreeNode[]): TodoListResponse {
  const items = flatten(tree);
  return {
    open: items.filter((item) => item.status === "open").map(toPayload),
    wip: items.filter((item) => item.status === "wip").map(toPayload),
    done: items.filter((item) => item.status === "done").map(toPayload),
    tree,
  };
}

function toPayload(node: TodoTreeNode): TodoPayload {
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

function installTodoFetch(treeRef: { current: TodoTreeNode[] }): {
  posts: Record<string, unknown>[];
} {
  const posts: Record<string, unknown>[] = [];
  const fetchMock = vi
    .fn()
    .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("/events/todo") &&
        (init?.method ?? "GET") === "POST"
      ) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        posts.push(body);
        return jsonResponse({
          filename: `20260522T120${String(posts.length).padStart(3, "0")}Z_us-a7f3.todo.json`,
        });
      }
      if (url.includes("/todos")) {
        return jsonResponse(responseFor(treeRef.current));
      }
      return jsonResponse({});
    });
  vi.stubGlobal("fetch", fetchMock);
  return { posts };
}

const singleTree = (): TodoTreeNode[] => [
  {
    id: "t1",
    title: "Draft plan",
    body: "phase 1",
    status: "open",
    assigned_to: "ag-c92e",
    children: [],
  },
];

const nestedTree = (): TodoTreeNode[] => [
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
];

const siblingTree = (): TodoTreeNode[] => [
  {
    id: "first",
    title: "First task",
    status: "open",
    children: [],
  },
  {
    id: "second",
    title: "Second task",
    status: "open",
    children: [],
  },
];

const mixedStatusTree = (): TodoTreeNode[] => [
  {
    id: "open-user",
    title: "Open user task",
    status: "open",
    assigned_to: "us-a7f3",
    children: [],
  },
  {
    id: "done-agent",
    title: "Done agent task",
    status: "done",
    assigned_to: "ag-c92e",
    children: [],
  },
  {
    id: "wip-agent",
    title: "WIP agent task",
    status: "wip",
    assigned_to: "ag-c92e",
    children: [],
  },
  {
    id: "open-agent",
    title: "Open agent task",
    status: "open",
    assigned_to: "ag-c92e",
    children: [],
  },
];

function titleInput(id: string): HTMLInputElement {
  return within(screen.getByTestId(`todo-item-${id}`)).getByLabelText(
    "Task title",
  ) as HTMLInputElement;
}

function bodyInput(id: string): HTMLTextAreaElement {
  return within(screen.getByTestId(`todo-item-${id}`)).getByLabelText(
    "Task description",
  ) as HTMLTextAreaElement;
}

describe("Todos panel — unified tree item flow", () => {
  beforeEach(() => {
    resetAutoFirstTodoReservations();
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders the scope subhead with the current slug", async () => {
    installTodoFetch({ current: singleTree() });
    render(<Todos />);
    await waitFor(() => {
      const scope = document.querySelector(".scope");
      expect(scope).not.toBeNull();
      expect(scope!.textContent).toContain("launch-planning");
    });
  });

  test("uses a bottom Add task row instead of the top-right + ADD button", async () => {
    installTodoFetch({ current: singleTree() });
    render(<Todos />);
    await screen.findByDisplayValue("Draft plan");
    expect(
      screen.queryByRole("button", { name: /add a new todo/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add task$/i })).toBeEnabled();
  });

  test("groups visible siblings by status and then assignee", async () => {
    installTodoFetch({ current: mixedStatusTree() });
    const { container } = render(<Todos />);
    await screen.findByDisplayValue("WIP agent task");

    const itemIds = Array.from(container.querySelectorAll(".todo-item")).map(
      (item) => item.getAttribute("data-testid"),
    );
    expect(itemIds).toEqual([
      "todo-item-wip-agent",
      "todo-item-open-agent",
      "todo-item-open-user",
      "todo-item-done-agent",
    ]);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
  });

  test("counter chips toggle status filters", async () => {
    installTodoFetch({ current: mixedStatusTree() });
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("WIP agent task");

    const openChip = screen.getByRole("button", { name: /Open 2/i });
    const wipChip = screen.getByRole("button", { name: /In progress 1/i });
    const doneChip = screen.getByRole("button", { name: /Done 1/i });
    expect(openChip).toHaveAttribute("aria-pressed", "true");
    expect(wipChip).toHaveAttribute("aria-pressed", "true");
    expect(doneChip).toHaveAttribute("aria-pressed", "true");

    await user.click(openChip);

    expect(openChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByDisplayValue("Open agent task")).toBeNull();
    expect(screen.queryByDisplayValue("Open user task")).toBeNull();
    expect(screen.getByDisplayValue("WIP agent task")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Done agent task")).toBeInTheDocument();
  });

  test("tick toggles status using the latest todo filename", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    resetStore({
      events: [
        makeTodo("20260522T110000Z_us-a7f3.todo.json", "us-a7f3", {
          id: "t1",
          title: "Draft plan",
          body: "phase 1",
          status: "open",
          assigned_to: "ag-c92e",
        }),
      ],
    });
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Draft plan");

    await user.click(screen.getByRole("button", { name: /Mark as done/i }));

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      status: "done",
      supersedes: "20260522T110000Z_us-a7f3.todo.json",
    });
  });

  test("in-progress button toggles WIP while the check controls done/open", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Draft plan");

    await user.click(
      screen.getByRole("button", { name: /Mark as in progress/i }),
    );
    treeRef.current = [
      {
        ...singleTree()[0]!,
        status: "wip",
      },
    ];

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      status: "wip",
    });
    act(() => {
      useStore.setState({
        events: [
          makeTodo("20260522T110100Z_us-a7f3.todo.json", "us-a7f3", {
            id: "t1",
            title: "Draft plan",
            body: "phase 1",
            status: "wip",
            assigned_to: "ag-c92e",
          }),
        ],
      });
    });
    await waitFor(() => {
      expect(screen.getByText("in progress")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Mark as done/i }));

    await waitFor(() => {
      expect(posts).toHaveLength(2);
    });
    expect(posts[1]).toMatchObject({
      id: "t1",
      status: "done",
    });
  });

  test("clicking X with no children removes immediately", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    resetStore({
      events: [
        makeTodo("20260522T110000Z_us-a7f3.todo.json", "us-a7f3", {
          id: "t1",
          title: "Draft plan",
          status: "open",
        }),
      ],
    });
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Draft plan");

    await user.click(
      screen.getByRole("button", { name: /Remove task Draft plan/i }),
    );

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      status: "removed",
      supersedes: "20260522T110000Z_us-a7f3.todo.json",
    });
  });

  test("clicking X with children shows inline confirmation before removing", async () => {
    const treeRef = { current: nestedTree() };
    const { posts } = installTodoFetch(treeRef);
    resetStore({
      events: [
        makeTodo("20260522T110000Z_us-a7f3.todo.json", "us-a7f3", {
          id: "parent",
          title: "Parent task",
          status: "open",
        }),
      ],
    });
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Parent task");

    await user.click(
      screen.getByRole("button", { name: /Remove task Parent task/i }),
    );

    expect(
      screen.getByText(/Remove this task and 1 subtask\?/i),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /^Remove$/i }));

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "parent",
      status: "removed",
      supersedes: "20260522T110000Z_us-a7f3.todo.json",
    });
  });

  test("assignee dropdown opens and selecting an assignee posts the update", async () => {
    const treeRef = {
      current: [
        {
          id: "t1",
          title: "Assign task",
          status: "open",
          children: [],
        },
      ] satisfies TodoTreeNode[],
    };
    const { posts } = installTodoFetch(treeRef);
    resetStore({
      events: [
        makeTodo("20260522T110000Z_us-a7f3.todo.json", "us-a7f3", {
          id: "t1",
          title: "Assign task",
          status: "open",
        }),
      ],
    });
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Assign task");

    await user.click(screen.getByRole("button", { name: /unassigned/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Claude/i }));

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      assigned_to: "ag-c92e",
      supersedes: "20260522T110000Z_us-a7f3.todo.json",
    });
  });

  test("in-place title and description edits commit on blur", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    resetStore({
      events: [
        makeTodo("20260522T110000Z_us-a7f3.todo.json", "us-a7f3", {
          id: "t1",
          title: "Draft plan",
          body: "phase 1",
          status: "open",
        }),
      ],
    });
    const user = userEvent.setup();
    render(<Todos />);
    const title = await screen.findByDisplayValue("Draft plan");

    await user.clear(title);
    await user.type(title, "Renamed plan");

    const description = screen.getByLabelText("Task description");
    await user.click(description);
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    await user.clear(description);
    await user.type(description, "phase 2");
    fireEvent.blur(description);

    await waitFor(() => {
      expect(posts).toHaveLength(2);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      title: "Renamed plan",
      body: "phase 1",
    });
    expect(posts[1]).toMatchObject({
      id: "t1",
      title: "Renamed plan",
      body: "phase 2",
    });
  });

  test("empty session auto-creates the first task with default agent assignee", async () => {
    const treeRef: { current: TodoTreeNode[] } = { current: [] };
    const { posts } = installTodoFetch(treeRef);
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (
          url.includes("/events/todo") &&
          (init?.method ?? "GET") === "POST"
        ) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          posts.push(body);
          treeRef.current = [
            {
              id: String(body.id),
              title: String(body.title),
              status: "open",
              assigned_to: String(body.assigned_to),
              children: [],
            },
          ];
          return jsonResponse({
            filename: "20260522T120000Z_us-a7f3.todo.json",
          });
        }
        return originalFetch(input, init);
      }),
    );

    render(<Todos />);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(String(posts[0]!.title).trim()).toBe("");
    expect(posts[0]).toMatchObject({
      status: "open",
      assigned_to: "ag-c92e",
      participant_id: "us-a7f3",
    });
    const firstTitle = await screen.findByPlaceholderText("First task title");
    expect(firstTitle).toHaveFocus();
  });

  test("+ Add task creates a draft sibling and posts it on first commit", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Draft plan");

    await user.click(screen.getByRole("button", { name: /^Add task$/i }));
    const draftTitle = screen
      .getAllByPlaceholderText("Task title")
      .find((input) => input instanceof HTMLInputElement && input.value === "");
    expect(draftTitle).toBeInstanceOf(HTMLInputElement);
    await user.type(draftTitle as HTMLInputElement, "Sibling task");
    fireEvent.blur(draftTitle as HTMLInputElement);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      title: "Sibling task",
      status: "open",
      assigned_to: "ag-c92e",
    });
    expect(posts[0]).not.toHaveProperty("parent_id");
  });

  test("+ Add subtask creates an indented child draft and posts parent_id", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    const user = userEvent.setup();
    const { container } = render(<Todos />);
    await screen.findByDisplayValue("Draft plan");

    await user.click(
      screen.getByRole("button", { name: /Add subtask to Draft plan/i }),
    );

    const draftItem = container.querySelector('.todo-item[data-draft="true"]');
    expect(draftItem).not.toBeNull();
    expect(draftItem!.getAttribute("data-depth")).toBe("1");
    expect(
      (draftItem as HTMLElement).style.getPropertyValue("--todo-depth-offset"),
    ).toContain("--todo-indent-step");

    const draftTitle = screen
      .getAllByPlaceholderText("Task title")
      .find((input) => input instanceof HTMLInputElement && input.value === "");
    await user.type(draftTitle as HTMLInputElement, "Child task");
    fireEvent.blur(draftTitle as HTMLInputElement);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      title: "Child task",
      status: "open",
      parent_id: "t1",
      assigned_to: "ag-c92e",
    });
  });

  test("tree indentation reflects parent_id depth in the DOM", async () => {
    installTodoFetch({ current: nestedTree() });
    render(<Todos />);
    await screen.findByDisplayValue("Child task");

    const parent = screen.getByTestId("todo-item-parent");
    const child = screen.getByTestId("todo-item-child");
    expect(parent.getAttribute("data-depth")).toBe("0");
    expect(child.getAttribute("data-depth")).toBe("1");
    expect(child.style.getPropertyValue("--todo-depth-offset")).toContain(
      "--todo-indent-step",
    );
  });

  test("Tab on a root item with a preceding sibling reparents under that sibling", async () => {
    const treeRef = { current: siblingTree() };
    const { posts } = installTodoFetch(treeRef);
    render(<Todos />);
    const second = await screen.findByDisplayValue("Second task");

    expect(fireEvent.keyDown(second, { key: "Tab", code: "Tab" })).toBe(false);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "second",
      parent_id: "first",
    });
  });

  test("Tab on the first root item is a prevented no-op", async () => {
    const treeRef = { current: siblingTree() };
    const { posts } = installTodoFetch(treeRef);
    render(<Todos />);
    const first = await screen.findByDisplayValue("First task");

    expect(fireEvent.keyDown(first, { key: "Tab", code: "Tab" })).toBe(false);
    expect(posts).toHaveLength(0);
  });

  test("Shift+Tab on a child omits parent_id so the item becomes root", async () => {
    const treeRef = { current: nestedTree() };
    const { posts } = installTodoFetch(treeRef);
    render(<Todos />);
    const child = await screen.findByDisplayValue("Child task");

    expect(
      fireEvent.keyDown(child, {
        key: "Tab",
        code: "Tab",
        shiftKey: true,
      }),
    ).toBe(false);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({ id: "child" });
    expect(posts[0]).not.toHaveProperty("parent_id");
  });

  test("Shift+Tab on a root item is a prevented no-op", async () => {
    const treeRef = { current: siblingTree() };
    const { posts } = installTodoFetch(treeRef);
    render(<Todos />);
    const first = await screen.findByDisplayValue("First task");

    expect(
      fireEvent.keyDown(first, {
        key: "Tab",
        code: "Tab",
        shiftKey: true,
      }),
    ).toBe(false);
    expect(posts).toHaveLength(0);
  });

  test("Enter on the title input moves focus to the description input", async () => {
    const treeRef = { current: singleTree() };
    installTodoFetch(treeRef);
    const user = userEvent.setup();
    render(<Todos />);
    const title = await screen.findByDisplayValue("Draft plan");
    await user.click(title);

    await user.keyboard("{Enter}");

    expect(bodyInput("t1")).toHaveFocus();
  });

  test("Enter on the description commits and creates a focused sibling draft below", async () => {
    const treeRef = { current: siblingTree() };
    const { posts } = installTodoFetch(treeRef);
    const user = userEvent.setup();
    const { container } = render(<Todos />);
    await screen.findByDisplayValue("First task");
    const description = bodyInput("first");
    await user.click(description);
    await user.type(description, "fresh notes");

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(posts).toHaveLength(1);
      const items = Array.from(container.querySelectorAll(".todo-item"));
      expect(items[0]?.getAttribute("data-testid")).toBe("todo-item-first");
      expect(items[1]?.getAttribute("data-draft")).toBe("true");
      expect(items[2]?.getAttribute("data-testid")).toBe("todo-item-second");
      expect(
        items[1]?.querySelector<HTMLInputElement>("input.todo-title"),
      ).toHaveFocus();
    });
    expect(posts[0]).toMatchObject({
      id: "first",
      body: "fresh notes",
    });
    expect(posts[0]).not.toHaveProperty("parent_id");
  });

  test("Cmd+Enter toggles a focused todo between open and done", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    render(<Todos />);
    const title = await screen.findByDisplayValue("Draft plan");

    expect(
      fireEvent.keyDown(title, {
        key: "Enter",
        code: "Enter",
        metaKey: true,
      }),
    ).toBe(false);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      status: "done",
    });
  });

  test("Cmd+Enter preserves a dirty title before blur", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    const user = userEvent.setup();
    render(<Todos />);
    const title = await screen.findByDisplayValue("Draft plan");
    await user.clear(title);
    await user.type(title, "Renamed before toggle");

    expect(
      fireEvent.keyDown(title, {
        key: "Enter",
        code: "Enter",
        metaKey: true,
      }),
    ).toBe(false);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      title: "Renamed before toggle",
      status: "done",
    });
  });

  test("Cmd+Backspace removes the focused todo", async () => {
    const treeRef = { current: singleTree() };
    const { posts } = installTodoFetch(treeRef);
    render(<Todos />);
    const title = await screen.findByDisplayValue("Draft plan");

    expect(
      fireEvent.keyDown(title, {
        key: "Backspace",
        code: "Backspace",
        metaKey: true,
      }),
    ).toBe(false);

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      id: "t1",
      status: "removed",
    });
  });

  test("Arrow keys focus same-depth neighbors and fall back through the visible list", async () => {
    const treeRef = { current: nestedTree() };
    installTodoFetch(treeRef);
    render(<Todos />);
    const parent = await screen.findByDisplayValue("Parent task");
    const child = titleInput("child");

    expect(
      fireEvent.keyDown(parent, { key: "ArrowDown", code: "ArrowDown" }),
    ).toBe(false);
    expect(child).toHaveFocus();

    expect(
      fireEvent.keyDown(child, { key: "ArrowUp", code: "ArrowUp" }),
    ).toBe(false);
    expect(parent).toHaveFocus();
  });

  test("right panel renders the same unified todo items compactly", async () => {
    installTodoFetch({ current: singleTree() });
    render(<RightTodos />);
    await screen.findByDisplayValue("Draft plan");
    expect(screen.getByLabelText("Todo counts")).toHaveTextContent("Open 1");
    expect(screen.getByTestId("todo-item-t1")).toHaveClass("compact");
    expect(screen.getByRole("button", { name: /^Add task$/i })).toBeEnabled();
  });

  test("an old in-flight todo write cannot reload todos into a new session", async () => {
    const oldSessionId = "2026-05-22-launch-planning";
    const newSessionId = "2026-05-23-new-session";
    let resolvePost: (response: Response) => void = () => undefined;
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (
          url.includes(`/sessions/${oldSessionId}/events/todo`) &&
          (init?.method ?? "GET") === "POST"
        ) {
          return postPromise;
        }
        if (url.includes(`/sessions/${oldSessionId}/todos`)) {
          return jsonResponse(responseFor(singleTree()));
        }
        if (url.includes(`/sessions/${newSessionId}/todos`)) {
          return jsonResponse(
            responseFor([
              {
                id: "new-task",
                title: "New session task",
                status: "open",
                children: [],
              },
            ]),
          );
        }
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);
    resetStore({
      sessions: [
        {
          id: oldSessionId,
          slug: "launch-planning",
          created_at: "2026-05-22T10:00:00Z",
        },
        {
          id: newSessionId,
          slug: "new-session",
          created_at: "2026-05-23T10:00:00Z",
        },
      ],
      currentSessionId: oldSessionId,
    });
    const user = userEvent.setup();
    render(<Todos />);
    await screen.findByDisplayValue("Draft plan");

    await user.click(screen.getByRole("button", { name: /Mark as done/i }));
    act(() => {
      useStore.getState().setCurrentSession(newSessionId);
    });
    await screen.findByDisplayValue("New session task");

    resolvePost(jsonResponse({ filename: "20260522T110100Z_us.todo.json" }));

    await waitFor(() => {
      const oldLoads = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes(`/sessions/${oldSessionId}/todos`),
      );
      expect(oldLoads).toHaveLength(1);
      expect(screen.getByDisplayValue("New session task")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("Draft plan")).toBeNull();
  });

  test("disables Add task when no session or no user is set", () => {
    installTodoFetch({ current: [] });
    useStore.setState({ currentSessionId: null });
    render(<Todos />);
    expect(screen.getByRole("button", { name: /^Add task$/i })).toBeDisabled();
  });

  test("bucket-only /todos response (no tree) still renders items and does not auto-create", async () => {
    /* Regression for the 'Preparing first task…' bug: a kernel response
       missing the `tree` field used to fall through to an empty tree
       while buckets stayed populated. The panel must derive the tree
       from buckets and must not fire the auto-create-first-task POST. */
    const posts: Record<string, unknown>[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (
          url.includes("/events/todo") &&
          (init?.method ?? "GET") === "POST"
        ) {
          posts.push(JSON.parse(String(init?.body ?? "{}")));
          return jsonResponse({ filename: "x.todo.json" });
        }
        if (url.includes("/todos")) {
          return jsonResponse({
            open: [
              {
                id: "t-bucket",
                title: "From bucket",
                status: "open",
              } satisfies TodoPayload,
            ],
            wip: [],
            done: [],
            /* tree intentionally omitted */
          });
        }
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<Todos />);
    expect(await screen.findByDisplayValue("From bucket")).toBeInTheDocument();
    /* Auto-create must not fire when buckets prove the session is not empty. */
    expect(
      posts.some(
        (p) =>
          (p as { id?: string }).id !== "t-bucket" &&
          (p as { participant_id?: string }).participant_id !== undefined,
      ),
    ).toBe(false);
  });
});
