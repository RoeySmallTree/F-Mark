import { expect, test } from "vitest";
import {
  postedBody,
  pressTodoKey,
  setupTodoCard,
  stubTodoFetch,
  taskDescriptionField,
  taskTitleField,
  waitForFetchCalls,
} from "./harness.js";

export function registerTodoKeyboardTests(): void {
  test("keyboard bindings local to one inline todo still work", async () => {
    const fetchMock = stubTodoFetch("20260522T110600Z_us-a7f3.todo.json");
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

    await waitForFetchCalls(fetchMock, 2);
    expect(postedBody(fetchMock, 0)).toMatchObject({
      id: "t1",
      status: "done",
    });
    expect(postedBody(fetchMock, 1)).toMatchObject({
      id: "t1",
      status: "removed",
    });
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
