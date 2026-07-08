import { fireEvent, screen } from "@testing-library/react";
import { expect } from "vitest";
import { nestedTree, singleTree } from "./fixtures.js";
import {
  draftTitleInput,
  expectDraftItemDepth,
  expectTodoItemDepth,
  expectTodoItemIndented,
  expectTodoPost,
  expectTodoPostMissingProperty,
  waitForPosts,
} from "./interactions.js";
import { renderTodosPanel, renderTodosWithTree } from "./render.js";
import type { TodoScenario } from "./scenarioTypes.js";
import { installEmptySessionDraftFetch } from "./scenarios.js";

export const todoDraftScenarios = [
  [
    "empty session opens a focused draft without posting an empty-title todo",
    emptySessionOpensFocusedDraft,
  ],
  [
    "+ Add task creates a draft sibling and posts it on first commit",
    addTaskPostsDraftSibling,
  ],
  [
    "+ Add subtask creates an indented child draft and posts parent_id",
    addSubtaskPostsIndentedChild,
  ],
  [
    "tree indentation reflects parent_id depth in the DOM",
    treeIndentationReflectsParentDepth,
  ],
] satisfies readonly TodoScenario[];

async function emptySessionOpensFocusedDraft(): Promise<void> {
  const { posts } = installEmptySessionDraftFetch();
  renderTodosPanel();

  const draftTitle = await screen.findByPlaceholderText("Task title");
  expect(draftTitle).toHaveFocus();
  expect(draftTitle).toHaveValue("");
  /* No POST should have been issued — the empty draft is UI-only and
     must remain unposted until a title is entered. */
  expect(posts).toHaveLength(0);
}

async function addTaskPostsDraftSibling(): Promise<void> {
  const { posts, user } = await renderTodosWithTree(singleTree());

  await user.click(screen.getByRole("button", { name: /^Add task$/i }));
  const draftTitle = draftTitleInput();
  await user.type(draftTitle, "Sibling task");
  fireEvent.blur(draftTitle);

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    title: "Sibling task",
    status: "open",
    assigned_to: "ag-c92e",
  });
  expectTodoPostMissingProperty(posts, 0, "parent_id");
}

async function addSubtaskPostsIndentedChild(): Promise<void> {
  const { container, posts, user } = await renderTodosWithTree(singleTree());

  await user.click(
    screen.getByRole("button", { name: /Add subtask to Draft plan/i }),
  );

  expectDraftItemDepth(container, "1");

  const draftTitle = draftTitleInput();
  await user.type(draftTitle, "Child task");
  fireEvent.blur(draftTitle);

  await waitForPosts(posts, 1);
  expectTodoPost(posts, 0, {
    title: "Child task",
    status: "open",
    parent_id: "t1",
    assigned_to: "ag-c92e",
  });
}

async function treeIndentationReflectsParentDepth(): Promise<void> {
  await renderTodosWithTree(nestedTree(), { waitForTitle: "Child task" });

  expectTodoItemDepth("parent", "0");
  expectTodoItemDepth("child", "1");
  expectTodoItemIndented("child");
}
