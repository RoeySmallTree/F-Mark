import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  draftTitleField,
  expectTodoPost,
  expectWakeCall,
  postedBody,
  replaceField,
  renderTodoCard,
  setupTodoCard,
  stubConfirm,
  stubRecordingTodoFetch,
  stubTodoFetch,
  taskDescriptionField,
  taskTitleField,
  todoEvent,
  waitForFetchCalls,
  waitForPostedCount,
} from "./harness.js";

export function registerTodoMutationTests(): void {
  registerTodoStatusTests();
  registerTodoDraftAndAssigneeTests();
  registerTodoEditTests();
}

function registerTodoStatusTests(): void {
  test("clicking the check on an open todo writes a supersession with status=done", async () => {
    const fetchMock = stubTodoFetch("20260522T110100Z_us-a7f3.todo.json");
    const { event, user } = setupTodoCard({
      id: "t1",
      title: "Ship it",
      status: "open",
    });

    await user.click(screen.getByRole("button", { name: /Mark as done/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectTodoPost(fetchMock, {
      id: "t1",
      title: "Ship it",
      status: "done",
      supersedes: event.filename,
      participant_id: "us-a7f3",
    });
  });

  test("clicking the check on a done todo writes a supersession back to open", async () => {
    const fetchMock = stubTodoFetch("20260522T110200Z_us-a7f3.todo.json");
    const { container, event, user } = setupTodoCard({
      id: "t1",
      title: "Ship it",
      status: "done",
    });

    expect(container.querySelector(".todo-card.done")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /Mark as open/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postedBody(fetchMock)).toMatchObject({
      status: "open",
      supersedes: event.filename,
    });
  });

  test("clicking X asks the server for descendants, confirms, then removes", async () => {
    const fetchMock = stubTodoFetch("20260522T110300Z_us-a7f3.todo.json");
    stubConfirm(true);
    const { event, user } = setupTodoCard({
      id: "t1",
      title: "Cull stale note",
      status: "open",
    });

    await user.click(
      screen.getByRole("button", { name: /Remove task Cull stale note/i }),
    );

    await waitForFetchCalls(fetchMock, 2);
    expect(postedBody(fetchMock, 1)).toMatchObject({
      status: "removed",
      supersedes: event.filename,
    });
  });

  test("clicking X does not remove when the confirmation is declined", async () => {
    const fetchMock = stubTodoFetch("20260522T110320Z_us-a7f3.todo.json");
    stubConfirm(false);
    const { user } = setupTodoCard({
      id: "t1",
      title: "Cull stale note",
      status: "open",
    });

    await user.click(
      screen.getByRole("button", { name: /Remove task Cull stale note/i }),
    );

    await waitForFetchCalls(fetchMock, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
}

function registerTodoDraftAndAssigneeTests(): void {
  test("Add subtask in an inline todo creates an editable draft before posting", async () => {
    const fetchMock = stubTodoFetch("20260522T110350Z_us-a7f3.todo.json");
    const { container, user } = setupTodoCard({
      id: "parent",
      title: "Parent task",
      status: "open",
    });

    await user.click(
      screen.getByRole("button", { name: /Add subtask to Parent task/i }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const draftTitle = draftTitleField(container);
    await user.type(draftTitle, "Child task");
    fireEvent.blur(draftTitle);

    await waitForFetchCalls(fetchMock, 2);
    expectTodoPost(fetchMock, {
      title: "Child task",
      parent_id: "parent",
      assigned_to: "ag-c92e",
    });
    expectWakeCall(fetchMock);
  });

  test("assignee dropdown opens and selecting an assignee posts an update", async () => {
    const fetchMock = stubTodoFetch("20260522T110400Z_us-a7f3.todo.json");
    const { event, user } = setupTodoCard({
      id: "t1",
      title: "Assign me",
      status: "open",
    });

    await user.click(screen.getByRole("button", { name: /unassigned/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Claude/i }));

    await waitForFetchCalls(fetchMock, 2);
    expect(postedBody(fetchMock)).toMatchObject({
      assigned_to: "ag-c92e",
      supersedes: event.filename,
    });
    expectWakeCall(fetchMock);
  });
}

function registerTodoEditTests(): void {
  test("title and description edits commit on blur", async () => {
    const { posted } = stubRecordingTodoFetch(
      "20260522T110500Z_us-a7f3.todo.json",
    );
    const { event, user } = setupTodoCard({
      id: "t1",
      title: "Old title",
      body: "Old body",
      status: "open",
    });

    await replaceField(user, taskTitleField(), "New title");
    await user.tab();
    await replaceField(user, taskDescriptionField(), "New body");
    fireEvent.blur(taskDescriptionField());

    await waitForPostedCount(posted, 2);
    expect(posted[0]).toMatchObject({
      id: "t1",
      title: "New title",
      body: "Old body",
      supersedes: event.filename,
    });
    expect(posted[1]).toMatchObject({
      id: "t1",
      title: "New title",
      body: "New body",
      supersedes: "20260522T110500Z_us-a7f3.todo.json",
    });
  });

  test("inline checkbox preserves dirty title before blur", async () => {
    const fetchMock = stubTodoFetch("20260522T110650Z_us-a7f3.todo.json");
    const { user } = setupTodoCard({
      id: "t1",
      title: "Old task",
      status: "open",
    });

    await replaceField(user, taskTitleField(), "Dirty task");
    await user.click(screen.getByRole("button", { name: /Mark as done/i }));

    await waitForFetchCalls(fetchMock, 1);
    expect(postedBody(fetchMock)).toMatchObject({
      id: "t1",
      title: "Dirty task",
      status: "done",
    });
  });

  test("inline TodoCard tabs a todo under the previous same-level item", async () => {
    const fetchMock = stubTodoFetch("20260522T110800Z_us-a7f3.todo.json");
    const first = todoEvent({
      id: "first",
      title: "First task",
      status: "open",
    });
    const second = todoEvent(
      { id: "second", title: "Second task", status: "open" },
      "20260522T110100Z_us-a7f3.todo.json",
    );

    renderTodoCard(second, [first, second]);
    expect(fireEvent.keyDown(taskTitleField(), { key: "Tab", code: "Tab" }))
      .toBe(false);

    await waitForFetchCalls(fetchMock, 1);
    expect(postedBody(fetchMock)).toMatchObject({
      id: "second",
      parent_id: "first",
      title: "Second task",
    });
  });
}
