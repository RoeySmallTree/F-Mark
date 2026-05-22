import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

  test("renders title + body + open state", () => {
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
    expect(screen.getByText("Wire pin overlay")).toBeInTheDocument();
    expect(container.querySelector(".todo-card.done")).toBeNull();
    expect(container.querySelector(".todo-check.done")).toBeNull();
    // Assignee renders.
    expect(container.textContent).toContain("assigned to Claude");
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
});
