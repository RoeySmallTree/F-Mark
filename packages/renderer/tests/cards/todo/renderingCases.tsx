import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { todoEvent, renderTodoCard } from "./harness.js";

export function registerTodoRenderingTests(): void {
  test("renders title + body + open state through TodoItem", () => {
    const ev = todoEvent({
      id: "t1",
      title: "Wire pin overlay",
      body: "phase 14",
      status: "open",
      assigned_to: "ag-c92e",
    });
    const { container } = renderTodoCard(ev);

    expect(screen.getByDisplayValue("Wire pin overlay")).toBeInTheDocument();
    expect(screen.getByDisplayValue("phase 14")).toBeInTheDocument();
    expect(container.querySelector(".todo-card.done")).toBeNull();
    expect(container.querySelector(".todo-check.done")).toBeNull();
    expect(
      screen.getByRole("button", { name: /assigned to Claude/i }),
    ).toBeInTheDocument();
  });

  test("inline TodoCard hides children of a removed parent", () => {
    const parent = todoEvent({
      id: "parent",
      title: "Parent task",
      status: "open",
    });
    const child = todoEvent(
      {
        id: "child",
        title: "Child task",
        status: "open",
        parent_id: "parent",
      },
      "20260522T110100Z_us-a7f3.todo.json",
    );
    const removedParent = todoEvent(
      {
        id: "parent",
        title: "Parent task",
        status: "removed",
        supersedes: parent.filename,
      },
      "20260522T110200Z_us-a7f3.todo.json",
    );

    const { container } = renderTodoCard(child, [parent, child, removedParent]);

    expect(container.querySelector(".todo-card")).toBeNull();
  });
}
