import { fireEvent } from "@testing-library/react";
import { expect } from "vitest";
import { nestedTree, siblingTree, singleTree } from "./fixtures.js";
import {
  bodyInput,
  expectFocusedDraftInsertedBetween,
  expectMetaKeyDown,
  expectTabKeyDown,
  expectTodoPost,
  expectTodoPostMissingProperty,
  titleInput,
  waitForPosts,
} from "./interactions.js";
import { renderTodosWithTree } from "./render.js";
import type { TodoScenario } from "./scenarioTypes.js";

export const todoKeyboardScenarios = [
  [
    "Tab on a root item with a preceding sibling reparents under that sibling",
    tabReparentsUnderPrecedingSibling,
  ],
  ["Tab on the first root item is a prevented no-op", tabFirstRootNoop],
  [
    "Shift+Tab on a child omits parent_id so the item becomes root",
    shiftTabChildBecomesRoot,
  ],
  ["Shift+Tab on a root item is a prevented no-op", shiftTabRootNoop],
  [
    "Enter on the title input moves focus to the description input",
    enterTitleFocusesDescription,
  ],
  [
    "Enter on the description commits and creates a focused sibling draft below",
    enterDescriptionCreatesSiblingDraft,
  ],
  [
    "Cmd+Enter toggles a focused todo between open and done",
    cmdEnterTogglesFocusedTodo,
  ],
  ["Cmd+Enter preserves a dirty title before blur", cmdEnterPreservesDirtyTitle],
  ["Cmd+Backspace removes the focused todo", cmdBackspaceRemovesFocusedTodo],
  [
    "Arrow keys focus same-depth neighbors and fall back through the visible list",
    arrowKeysFocusVisibleNeighbors,
  ],
] satisfies readonly TodoScenario[];

async function tabReparentsUnderPrecedingSibling(): Promise<void> {
  const { posts, title: second } = await renderTodosWithTree(siblingTree(), {
    waitForTitle: "Second task",
  });

  expectTabKeyDown(second!);

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    id: "second",
    parent_id: "first",
  });
}

async function tabFirstRootNoop(): Promise<void> {
  const { posts, title: first } = await renderTodosWithTree(siblingTree(), {
    waitForTitle: "First task",
  });

  expectTabKeyDown(first!);
  expect(posts).toHaveLength(0);
}

async function shiftTabChildBecomesRoot(): Promise<void> {
  const { posts, title: child } = await renderTodosWithTree(nestedTree(), {
    waitForTitle: "Child task",
  });

  expectTabKeyDown(child!, true);

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, { id: "child" });
  expectTodoPostMissingProperty(posts, 0, "parent_id");
}

async function shiftTabRootNoop(): Promise<void> {
  const { posts, title: first } = await renderTodosWithTree(siblingTree(), {
    waitForTitle: "First task",
  });

  expectTabKeyDown(first!, true);
  expect(posts).toHaveLength(0);
}

async function enterTitleFocusesDescription(): Promise<void> {
  const { title, user } = await renderTodosWithTree(singleTree());
  await user.click(title!);

  await user.keyboard("{Enter}");

  expect(bodyInput("t1")).toHaveFocus();
}

async function enterDescriptionCreatesSiblingDraft(): Promise<void> {
  const { container, posts, user } = await renderTodosWithTree(siblingTree(), {
    waitForTitle: "First task",
  });
  const description = bodyInput("first");
  await user.click(description);
  await user.type(description, "fresh notes");

  await user.keyboard("{Enter}");

  await expectFocusedDraftInsertedBetween(
    container,
    posts,
    "todo-item-first",
    "todo-item-second",
  );
  expectTodoPost(posts, 0, {
    id: "first",
    body: "fresh notes",
  });
  expectTodoPostMissingProperty(posts, 0, "parent_id");
}

async function cmdEnterTogglesFocusedTodo(): Promise<void> {
  const { posts, title } = await renderTodosWithTree(singleTree());

  expectMetaKeyDown(title!, "Enter");

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    id: "t1",
    status: "done",
  });
}

async function cmdEnterPreservesDirtyTitle(): Promise<void> {
  const { posts, title, user } = await renderTodosWithTree(singleTree());
  await user.clear(title!);
  await user.type(title!, "Renamed before toggle");

  expectMetaKeyDown(title!, "Enter");

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    id: "t1",
    title: "Renamed before toggle",
    status: "done",
  });
}

async function cmdBackspaceRemovesFocusedTodo(): Promise<void> {
  const { posts, title } = await renderTodosWithTree(singleTree());

  expectMetaKeyDown(title!, "Backspace");

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    id: "t1",
    status: "removed",
  });
}

async function arrowKeysFocusVisibleNeighbors(): Promise<void> {
  const { title: parent } = await renderTodosWithTree(nestedTree(), {
    waitForTitle: "Parent task",
  });
  const child = titleInput("child");

  expect(
    fireEvent.keyDown(parent!, { key: "ArrowDown", code: "ArrowDown" }),
  ).toBe(false);
  expect(child).toHaveFocus();

  expect(fireEvent.keyDown(child, { key: "ArrowUp", code: "ArrowUp" })).toBe(
    false,
  );
  expect(parent).toHaveFocus();
}
