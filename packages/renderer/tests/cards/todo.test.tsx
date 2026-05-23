import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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

  test("assignee dropdown opens and selecting an assignee posts an update", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.assigned_to).toBe("ag-c92e");
    expect(body.supersedes).toBe(ev.filename);
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
    await user.tab();

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
      title: "Old title",
      body: "New body",
      supersedes: ev.filename,
    });
  });
});
