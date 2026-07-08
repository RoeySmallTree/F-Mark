import {
  act,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";
import { MOD_CLOSE, MOD_OPEN } from "./fixtures.js";

type ComposeUser = ReturnType<typeof userEvent.setup>;

export function composeTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText(/compose message/i) as HTMLTextAreaElement;
}

export async function typeComposeMessage(
  user: ComposeUser,
  text: string,
): Promise<HTMLTextAreaElement> {
  const textarea = composeTextarea();
  await user.click(textarea);
  await user.type(textarea, text);
  return textarea;
}

export async function submitWithModEnter(user: ComposeUser): Promise<void> {
  await user.keyboard(`${MOD_OPEN}{Enter}${MOD_CLOSE}`);
}

export async function flushSubmit(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

export function pasteFiles(
  target: Element,
  files: File[],
): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { files, items: [] },
  });
  fireEvent(target, event);
  return event;
}

export function pasteClipboardFileItem(target: Element, file: File): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      items: [{ kind: "file", getAsFile: () => file }],
    },
  });
  fireEvent(target, event);
  return event;
}

export function composeInner(container: HTMLElement): HTMLDivElement {
  const inner = container.querySelector(".compose-inner") as HTMLDivElement;
  if (!inner) {
    throw new Error("Expected compose inner element");
  }
  return inner;
}

function fileDragEvent(type: string, file: File): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: ["Files"],
      files: [file],
      dropEffect: "",
    },
  });
  return event;
}

function pathDragEvent(type: string, path: string): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: ["application/x-fmark-file-path", "text/plain"],
      files: [],
      dropEffect: "",
      getData: (mime: string) =>
        mime === "application/x-fmark-file-path" ? path : "",
    },
  });
  return event;
}

export function dragFileIntoCompose(inner: Element, file: File): void {
  fireEvent(inner, fileDragEvent("dragenter", file));
}

export function dropFileIntoCompose(inner: Element, file: File): void {
  fireEvent(inner, fileDragEvent("drop", file));
}

export function dragPathIntoCompose(inner: Element, path: string): void {
  fireEvent(inner, pathDragEvent("dragenter", path));
}

export function dropPathIntoCompose(inner: Element, path: string): void {
  fireEvent(inner, pathDragEvent("drop", path));
}

export async function waitForChip(label: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
}

export async function openCreateTodo(user: ComposeUser): Promise<void> {
  await user.click(screen.getByRole("button", { name: /open create todo/i }));
}

export async function submitTodoTitle(
  user: ComposeUser,
  title: string,
): Promise<void> {
  await user.type(screen.getByPlaceholderText(/task title/i), title);
  await user.click(screen.getByRole("button", { name: /^create$/i }));
}

export async function mentionClaude(user: ComposeUser): Promise<void> {
  await user.click(screen.getByRole("button", { name: /Mention agent/i }));
  /* The choice row button has no aria-label; its accessible name comes
     from text content (display name + participant id). Match on the id
     to stay robust to display-name changes. */
  const claudeOption = await screen.findByRole("button", { name: /ag-c92e/ });
  await user.click(claudeOption);
}
