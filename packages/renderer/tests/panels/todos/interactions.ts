import type { RenderResult } from "@testing-library/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import type { TodoPost } from "./fixtures.js";
import type { TodoPanelUser } from "./render.js";

type ExpectedTodoPost = Record<string, unknown>;

export async function waitForPosts(
  posts: TodoPost[],
  expectedCount: number,
): Promise<void> {
  await waitFor(() => {
    expect(posts).toHaveLength(expectedCount);
  });
}

export async function clickButtonAndWaitForPosts(
  user: TodoPanelUser,
  buttonName: RegExp,
  posts: TodoPost[],
  expectedCount = 1,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: buttonName }));
  await waitForPosts(posts, expectedCount);
}

export function expectTodoPost(
  posts: TodoPost[],
  index: number,
  expected: ExpectedTodoPost,
): void {
  expect(posts[index]).toMatchObject(expected);
}

export function expectTodoPostMissingProperty(
  posts: TodoPost[],
  index: number,
  property: string,
): void {
  expect(posts[index]).not.toHaveProperty(property);
}

export function titleInput(id: string): HTMLTextAreaElement {
  return within(screen.getByTestId(`todo-item-${id}`)).getByLabelText(
    "Task title",
  ) as HTMLTextAreaElement;
}

export function bodyInput(id: string): HTMLTextAreaElement {
  return within(screen.getByTestId(`todo-item-${id}`)).getByLabelText(
    "Task description",
  ) as HTMLTextAreaElement;
}

export function draftTitleInput(): HTMLTextAreaElement {
  const input = screen
    .getAllByPlaceholderText("Task title")
    .find(isEmptyTitleTextArea);
  expect(input).toBeInstanceOf(HTMLTextAreaElement);
  return input as HTMLTextAreaElement;
}

export async function chooseAssignee(
  user: TodoPanelUser,
  buttonName: RegExp,
  optionName: RegExp,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: buttonName }));
  const menu = screen.getByRole("menu");
  expect(menu).toBeInTheDocument();
  await user.click(within(menu).getByRole("menuitem", { name: optionName }));
}

export function expectMetaKeyDown(
  target: Element,
  key: "Backspace" | "Enter",
): void {
  expect(
    fireEvent.keyDown(target, {
      key,
      code: key,
      metaKey: true,
    }),
  ).toBe(false);
}

export function expectTabKeyDown(target: Element, shiftKey = false): void {
  expect(
    fireEvent.keyDown(target, {
      key: "Tab",
      code: "Tab",
      shiftKey,
    }),
  ).toBe(false);
}

export function todoItemTestIds(container: ParentNode): (string | null)[] {
  return Array.from(container.querySelectorAll(".todo-item")).map((item) =>
    item.getAttribute("data-testid"),
  );
}

export function expectDraftItemDepth(
  container: RenderResult["container"],
  expectedDepth: string,
): void {
  const draftItem = container.querySelector('.todo-item[data-draft="true"]');
  expect(draftItem).not.toBeNull();
  expect(draftItem!.getAttribute("data-depth")).toBe(expectedDepth);
  expect(
    (draftItem as HTMLElement).style.getPropertyValue("--todo-depth-offset"),
  ).toContain("--todo-indent-step");
}

export function expectTodoItemDepth(id: string, expectedDepth: string): void {
  const item = screen.getByTestId(`todo-item-${id}`);
  expect(item.getAttribute("data-depth")).toBe(expectedDepth);
}

export function expectTodoItemIndented(id: string): void {
  expect(
    screen
      .getByTestId(`todo-item-${id}`)
      .style.getPropertyValue("--todo-depth-offset"),
  ).toContain("--todo-indent-step");
}

export async function expectFocusedDraftInsertedBetween(
  container: RenderResult["container"],
  posts: TodoPost[],
  beforeTestId: string,
  afterTestId: string,
): Promise<void> {
  await waitFor(() => {
    expect(posts).toHaveLength(1);
    const items = Array.from(container.querySelectorAll(".todo-item"));
    expect(items[0]?.getAttribute("data-testid")).toBe(beforeTestId);
    expect(items[1]?.getAttribute("data-draft")).toBe("true");
    expect(items[2]?.getAttribute("data-testid")).toBe(afterTestId);
    expect(
      items[1]?.querySelector<HTMLTextAreaElement>("textarea.todo-title"),
    ).toHaveFocus();
  });
}

function isEmptyTitleTextArea(input: HTMLElement): input is HTMLTextAreaElement {
  return input instanceof HTMLTextAreaElement && input.value === "";
}
