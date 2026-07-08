import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import {
  assignableTree,
  nestedTree,
  singleTree,
} from "./fixtures.js";
import {
  chooseAssignee,
  clickButtonAndWaitForPosts,
  expectTodoPost,
  expectTodoPostMissingProperty,
  waitForPosts,
} from "./interactions.js";
import { renderTodosWithTree } from "./render.js";
import type { TodoScenario } from "./scenarioTypes.js";
import {
  replaceStoreTodoEvent,
  resetStoreWithTodoEvent,
} from "./store.js";

export const todoMutationScenarios = [
  ["tick toggles status using the latest todo filename", tickTogglesStatus],
  [
    "in-progress button toggles WIP while the check controls done/open",
    inProgressButtonTogglesWip,
  ],
  ["clicking X with no children removes immediately", removesLeafImmediately],
  [
    "clicking X with children shows inline confirmation before removing",
    confirmsBeforeRemovingParent,
  ],
  [
    "assignee dropdown opens and selecting an assignee posts the update",
    assigneeDropdownPostsUpdate,
  ],
  ["in-place title and description edits commit on blur", inPlaceEditsCommit],
] satisfies readonly TodoScenario[];

async function tickTogglesStatus(): Promise<void> {
  resetStoreWithTodoEvent({
    id: "t1",
    title: "Draft plan",
    body: "phase 1",
    status: "open",
    assigned_to: "ag-c92e",
  });
  const { posts, user } = await renderTodosWithTree(singleTree());

  await clickButtonAndWaitForPosts(user, /Mark as done/i, posts);
  expectTodoPost(posts, 0, {
    id: "t1",
    status: "done",
    supersedes: "20260522T110000Z_us-a7f3.todo.json",
  });
}

async function inProgressButtonTogglesWip(): Promise<void> {
  const { posts, treeRef, user } = await renderTodosWithTree(singleTree());

  await user.click(
    screen.getByRole("button", { name: /Mark as in progress/i }),
  );
  treeRef.current = [{ ...singleTree()[0]!, status: "wip" }];

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, { id: "t1", status: "wip" });
  replaceStoreTodoEvent(
    {
      id: "t1",
      title: "Draft plan",
      body: "phase 1",
      status: "wip",
      assigned_to: "ag-c92e",
    },
    "20260522T110100Z_us-a7f3.todo.json",
  );
  await waitFor(() => {
    const wipPill = document.querySelector(".todo-status-pill.wip");
    expect(wipPill).not.toBeNull();
  });

  await user.click(screen.getByRole("button", { name: /Mark as done/i }));

  await waitForPosts(posts, 2);
  expectTodoPost(posts, 1, { id: "t1", status: "done" });
}

async function removesLeafImmediately(): Promise<void> {
  resetStoreWithTodoEvent({
    id: "t1",
    title: "Draft plan",
    status: "open",
  });
  const { posts, user } = await renderTodosWithTree(singleTree());

  await clickButtonAndWaitForPosts(user, /Remove task Draft plan/i, posts);
  expectTodoPost(posts, 0, {
    id: "t1",
    status: "removed",
    supersedes: "20260522T110000Z_us-a7f3.todo.json",
  });
}

async function confirmsBeforeRemovingParent(): Promise<void> {
  resetStoreWithTodoEvent({
    id: "parent",
    title: "Parent task",
    status: "open",
  });
  const { posts, user } = await renderTodosWithTree(nestedTree(), {
    waitForTitle: "Parent task",
  });

  await user.click(
    screen.getByRole("button", { name: /Remove task Parent task/i }),
  );

  expect(screen.getByText(/Remove this task and 1 subtask\?/i)).toBeInTheDocument();
  expect(posts).toHaveLength(0);

  await user.click(screen.getByRole("button", { name: /^Remove$/i }));

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    id: "parent",
    status: "removed",
    supersedes: "20260522T110000Z_us-a7f3.todo.json",
  });
}

async function assigneeDropdownPostsUpdate(): Promise<void> {
  resetStoreWithTodoEvent({
    id: "t1",
    title: "Assign task",
    status: "open",
  });
  const { posts, user } = await renderTodosWithTree(assignableTree(), {
    waitForTitle: "Assign task",
  });

  await chooseAssignee(user, /unassigned/i, /Claude/i);

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    id: "t1",
    assigned_to: "ag-c92e",
    supersedes: "20260522T110000Z_us-a7f3.todo.json",
  });
}

async function inPlaceEditsCommit(): Promise<void> {
  resetStoreWithTodoEvent({
    id: "t1",
    title: "Draft plan",
    body: "phase 1",
    status: "open",
  });
  const { posts, title, user } = await renderTodosWithTree(singleTree());

  await user.clear(title!);
  await user.type(title!, "Renamed plan");

  const description = screen.getByLabelText("Task description");
  await user.click(description);
  await waitForPosts(posts, 1);
  await user.clear(description);
  await user.type(description, "phase 2");
  fireEvent.blur(description);

  await waitForPosts(posts, 2);
  expectTodoPost(posts, 0, {
    id: "t1",
    title: "Renamed plan",
    body: "phase 1",
  });
  expectTodoPost(posts, 1, {
    id: "t1",
    title: "Renamed plan",
    body: "phase 2",
  });
}
