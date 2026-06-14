import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodoCard } from "../../src/cards/TodoCard.js";
import {
  PARTICIPANTS,
  jsonResponse,
  makeTodo,
  resetStore,
} from "./_helpers.js";

describe("TodoCard", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders title + body + open state through TodoItem", () => {
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      {
        id: "t1",
        title: "Wire pin overlay",
        body: "phase 14",
        status: "open",
        assigned_to: "ag-c92e",
      },
    );
    const { container } = render(
      <TodoCard event={ev} participants={PARTICIPANTS} />,
    );
    expect(screen.getByDisplayValue("Wire pin overlay")).toBeInTheDocument();
    expect(screen.getByDisplayValue("phase 14")).toBeInTheDocument();
    expect(container.querySelector(".todo-card.done")).toBeNull();
    expect(container.querySelector(".todo-check.done")).toBeNull();
    expect(
      screen.getByRole("button", { name: /assigned to Claude/i }),
    ).toBeInTheDocument();
  });

  test("clicking the check on an open todo writes a supersession with status=done", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T110100Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Ship it", status: "open" },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);
    await user.click(screen.getByRole("button", { name: /Mark as done/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/events\/todo$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.id).toBe("t1");
    expect(body.title).toBe("Ship it");
    expect(body.status).toBe("done");
    expect(body.supersedes).toBe(ev.filename);
    expect(body.participant_id).toBe("us-a7f3");
  });

  test("clicking the check on a done todo writes a supersession back to open", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T110200Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Ship it", status: "done" },
    );
    const { container } = render(
      <TodoCard event={ev} participants={PARTICIPANTS} />,
    );
    expect(container.querySelector(".todo-card.done")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /Mark as open/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.status).toBe("open");
    expect(body.supersedes).toBe(ev.filename);
  });

  test("clicking X removes a todo immediately when it has no children", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T110300Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Cull stale note", status: "open" },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);

    await user.click(
      screen.getByRole("button", { name: /Remove task Cull stale note/i }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.status).toBe("removed");
    expect(body.supersedes).toBe(ev.filename);
  });

  test("Add subtask in an inline todo creates an editable draft before posting", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({ filename: "20260522T110350Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "parent", title: "Parent task", status: "open" },
    );
    const { container } = render(
      <TodoCard event={ev} participants={PARTICIPANTS} />,
    );

    await user.click(
      screen.getByRole("button", { name: /Add subtask to Parent task/i }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    const draft = container.querySelector('.todo-item[data-draft="true"]');
    expect(draft).not.toBeNull();
    expect(draft!.getAttribute("data-depth")).toBe("1");
    const draftTitle = draft!.querySelector<HTMLInputElement>("input.todo-title");
    expect(draftTitle).not.toBeNull();
    await user.type(draftTitle!, "Child task");
    fireEvent.blur(draftTitle!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({
      title: "Child task",
      parent_id: "parent",
      assigned_to: "ag-c92e",
    });
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(
      /\/sessions\/2026-05-22-launch-planning\/wake$/,
    );
  });

  test("assignee dropdown opens and selecting an assignee posts an update", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({ filename: "20260522T110400Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Assign me", status: "open" },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);

    await user.click(screen.getByRole("button", { name: /unassigned/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Claude/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.assigned_to).toBe("ag-c92e");
    expect(body.supersedes).toBe(ev.filename);
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(
      /\/sessions\/2026-05-22-launch-planning\/wake$/,
    );
  });

  test("title and description edits commit on blur", async () => {
    const posted: Record<string, unknown>[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ filename: "20260522T110500Z_us-a7f3.todo.json" });
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      {
        id: "t1",
        title: "Old title",
        body: "Old body",
        status: "open",
      },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);

    const title = screen.getByLabelText("Task title");
    await user.clear(title);
    await user.type(title, "New title");
    await user.tab();

    const description = screen.getByLabelText("Task description");
    await user.clear(description);
    await user.type(description, "New body");
    fireEvent.blur(description);

    await waitFor(() => {
      expect(posted.length).toBe(2);
    });
    expect(posted[0]).toMatchObject({
      id: "t1",
      title: "New title",
      body: "Old body",
      supersedes: ev.filename,
    });
    expect(posted[1]).toMatchObject({
      id: "t1",
      title: "New title",
      body: "New body",
      supersedes: "20260522T110500Z_us-a7f3.todo.json",
    });
  });

  test("keyboard bindings local to one inline todo still work", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ filename: "20260522T110600Z_us-a7f3.todo.json" }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Key task", body: "note", status: "open" },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);
    const title = screen.getByLabelText("Task title");

    expect(
      fireEvent.keyDown(title, { key: "Enter", code: "Enter" }),
    ).toBe(false);
    expect(screen.getByLabelText("Task description")).toHaveFocus();

    expect(
      fireEvent.keyDown(title, {
        key: "Enter",
        code: "Enter",
        metaKey: true,
      }),
    ).toBe(false);
    expect(
      fireEvent.keyDown(title, {
        key: "Backspace",
        code: "Backspace",
        metaKey: true,
      }),
    ).toBe(false);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toMatchObject(
      { id: "t1", status: "done" },
    );
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string)).toMatchObject(
      { id: "t1", status: "removed" },
    );
  });

  test("inline checkbox preserves dirty title before blur", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T110650Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Old task", status: "open" },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);
    const title = screen.getByLabelText("Task title");
    await user.clear(title);
    await user.type(title, "Dirty task");

    await user.click(screen.getByRole("button", { name: /Mark as done/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toMatchObject(
      {
        id: "t1",
        title: "Dirty task",
        status: "done",
      },
    );
  });

  test("inline TodoCard prevents tree keyboard chords even when they are no-ops", () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T110700Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ev = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t1", title: "Inline task", status: "open" },
    );
    render(<TodoCard event={ev} participants={PARTICIPANTS} />);
    const title = screen.getByLabelText("Task title");

    expect(fireEvent.keyDown(title, { key: "Tab", code: "Tab" })).toBe(false);
    expect(
      fireEvent.keyDown(title, { key: "ArrowDown", code: "ArrowDown" }),
    ).toBe(false);
    expect(
      fireEvent.keyDown(title, { key: "ArrowUp", code: "ArrowUp" }),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("inline TodoCard tabs a todo under the previous same-level item", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T110800Z_us-a7f3.todo.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "first", title: "First task", status: "open" },
    );
    const second = makeTodo(
      "20260522T110100Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "second", title: "Second task", status: "open" },
    );
    render(
      <TodoCard
        event={second}
        participants={PARTICIPANTS}
        allEvents={[first, second]}
      />,
    );
    const title = screen.getByLabelText("Task title");

    expect(fireEvent.keyDown(title, { key: "Tab", code: "Tab" })).toBe(false);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({
      id: "second",
      parent_id: "first",
      title: "Second task",
    });
  });

  test("inline TodoCard hides children of a removed parent", () => {
    const parent = makeTodo(
      "20260522T110000Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "parent", title: "Parent task", status: "open" },
    );
    const child = makeTodo(
      "20260522T110100Z_us-a7f3.todo.json",
      "us-a7f3",
      {
        id: "child",
        title: "Child task",
        status: "open",
        parent_id: "parent",
      },
    );
    const removedParent = makeTodo(
      "20260522T110200Z_us-a7f3.todo.json",
      "us-a7f3",
      {
        id: "parent",
        title: "Parent task",
        status: "removed",
        supersedes: parent.filename,
      },
    );

    const { container } = render(
      <TodoCard
        event={child}
        participants={PARTICIPANTS}
        allEvents={[parent, child, removedParent]}
      />,
    );

    expect(container.querySelector(".todo-card")).toBeNull();
  });
});
