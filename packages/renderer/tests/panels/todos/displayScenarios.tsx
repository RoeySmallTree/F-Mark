import { screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { mixedStatusTree, singleTree } from "./fixtures.js";
import { todoItemTestIds } from "./interactions.js";
import { renderRightTodos, renderTodosWithTree } from "./render.js";
import type { TodoScenario } from "./scenarioTypes.js";

export const todoDisplayScenarios = [
  ["renders the scope subhead with the current slug", rendersScopeSubhead],
  [
    "uses a bottom Add task row instead of the top-right + ADD button",
    usesBottomAddTaskRow,
  ],
  ["groups visible siblings by status and then assignee", groupsVisibleSiblings],
  ["counter chips toggle status filters", counterChipsToggleStatusFilters],
  [
    "right panel renders the same unified todo items compactly",
    rightPanelRendersUnifiedItems,
  ],
] satisfies readonly TodoScenario[];

async function rendersScopeSubhead(): Promise<void> {
  await renderTodosWithTree(singleTree(), { waitForTitle: false });
  await waitFor(() => {
    const scope = document.querySelector(".scope");
    expect(scope).not.toBeNull();
    expect(scope!.textContent).toContain("launch-review");
  });
}

async function usesBottomAddTaskRow(): Promise<void> {
  await renderTodosWithTree(singleTree());
  expect(
    screen.queryByRole("button", { name: /add a new todo/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Add task$/i })).toBeEnabled();
}

async function groupsVisibleSiblings(): Promise<void> {
  const { container } = await renderTodosWithTree(mixedStatusTree(), {
    waitForTitle: "WIP agent task",
  });

  expect(todoItemTestIds(container)).toEqual([
    "todo-item-wip-agent",
    "todo-item-open-agent",
    "todo-item-open-user",
    "todo-item-done-agent",
  ]);
  expect(screen.getByText("In progress")).toBeInTheDocument();
  expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
}

async function counterChipsToggleStatusFilters(): Promise<void> {
  const { user } = await renderTodosWithTree(mixedStatusTree(), {
    waitForTitle: "WIP agent task",
  });

  const openChip = screen.getByRole("button", { name: /Open 2/i });
  const wipChip = screen.getByRole("button", { name: /In progress 1/i });
  const doneChip = screen.getByRole("button", { name: /Done 1/i });
  expect(openChip).toHaveAttribute("aria-pressed", "true");
  expect(wipChip).toHaveAttribute("aria-pressed", "true");
  expect(doneChip).toHaveAttribute("aria-pressed", "true");

  await user.click(openChip);

  expect(openChip).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByDisplayValue("Open agent task")).toBeNull();
  expect(screen.queryByDisplayValue("Open user task")).toBeNull();
  expect(screen.getByDisplayValue("WIP agent task")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Done agent task")).toBeInTheDocument();
}

async function rightPanelRendersUnifiedItems(): Promise<void> {
  await renderTodosWithTree(singleTree(), { ui: renderRightTodos() });
  expect(screen.getByLabelText("Todo counts")).toHaveTextContent("Open 1");
  expect(screen.getByTestId("todo-item-t1")).toHaveClass("compact");
  expect(screen.getByRole("button", { name: /^Add task$/i })).toBeEnabled();
}
