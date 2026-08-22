import { waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { TodoItemProps } from "../../../src/cards/todoItem/types.js";
import {
  postedBody,
  pressTodoKey,
  renderTodoItemDirect,
  setupTodoCard,
  stubConfirm,
  stubTodoFetch,
  taskDescriptionField,
  taskTitleField,
  waitForFetchCalls,
} from "./harness.js";

export function registerTodoKeyboardTests(): void {
  test("keyboard bindings local to one inline todo still work", async () => {
    const fetchMock = stubTodoFetch("20260522T110600Z_us-a7f3.todo.json");
    stubConfirm(true);
    setupTodoCard({
      id: "t1",
      title: "Key task",
      body: "note",
      status: "open",
    });
    const title = taskTitleField();

    expect(pressTodoKey(title, "Enter")).toBe(false);
    expect(taskDescriptionField()).toHaveFocus();
    expect(pressTodoKey(title, "Enter", { metaKey: true })).toBe(false);
    expect(pressTodoKey(title, "Backspace", { metaKey: true })).toBe(false);

    /* mod+backspace now confirms first: a descendants lookup, then the
       removal POST once accepted. */
    await waitForFetchCalls(fetchMock, 3);
    expect(postedBody(fetchMock, 0)).toMatchObject({
      id: "t1",
      status: "done",
    });
    expect(postedBody(fetchMock, 2)).toMatchObject({
      id: "t1",
      status: "removed",
    });
  });

  test("mod+backspace on a title asks the same confirmation as the X button and blocks removal when declined", async () => {
    const confirmMock = stubConfirm(false);
    const onRemove = vi
      .fn<TodoItemProps["onRemove"]>()
      .mockResolvedValue(undefined);
    renderTodoItemDirect({
      fetchDescendants: vi.fn().mockResolvedValue(["child-1"]),
      onRemove,
    });

    pressTodoKey(taskTitleField(), "Backspace", { metaKey: true });

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(confirmMock.mock.calls[0]?.[0]).toContain("1 subtask");
    expect(onRemove).not.toHaveBeenCalled();
  });

  test("mod+backspace on a title removes with field='title' once confirmed", async () => {
    stubConfirm(true);
    const onRemove = vi
      .fn<TodoItemProps["onRemove"]>()
      .mockResolvedValue(undefined);
    renderTodoItemDirect({ onRemove });

    pressTodoKey(taskTitleField(), "Backspace", { metaKey: true });

    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
    expect(onRemove.mock.calls[0]?.[0]).toBe("title");
  });

  test("inline TodoCard prevents tree keyboard chords even when they are no-ops", () => {
    const fetchMock = stubTodoFetch("20260522T110700Z_us-a7f3.todo.json");
    setupTodoCard({
      id: "t1",
      title: "Inline task",
      status: "open",
    });
    const title = taskTitleField();

    expect(pressTodoKey(title, "Tab")).toBe(false);
    expect(pressTodoKey(title, "ArrowDown")).toBe(false);
    expect(pressTodoKey(title, "ArrowUp")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
}
