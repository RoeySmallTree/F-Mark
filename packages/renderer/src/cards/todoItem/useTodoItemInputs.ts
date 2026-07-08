import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { fieldValue } from "../../panels/todoPanelUtils.js";
import { handleTodoInputKeyDown } from "./keyboard.js";
import type {
  TodoInputField,
  TodoItemNavigationHandlers,
  TodoItemProps,
  TodoItemValues,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  title: "title",
  body: "body",
} as const;

interface UseTodoItemInputsInput extends TodoItemNavigationHandlers {
  node: TodoItemProps["node"];
  draft: boolean;
  autoFocusTitle: boolean;
  onUpdate: TodoItemProps["onUpdate"];
  onRemove: TodoItemProps["onRemove"];
  onToggleDone: TodoItemProps["onToggleDone"];
}

export function useTodoItemInputs({
  node,
  draft,
  autoFocusTitle,
  registerInputs,
  onUpdate,
  onIndent,
  onOutdent,
  onFocusPrev,
  onFocusNext,
  onCommitAndCreateBelow,
  onRemove,
  onToggleDone,
}: UseTodoItemInputsInput) {
  const [title, setTitle] = useState(fieldValue(node.title));
  const [body, setBody] = useState(fieldValue(node.body));
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const skipBlurCommitRef = useRef<TodoInputField | null>(null);

  useEffect(() => {
    setTitle(fieldValue(node.title));
  }, [node.id, node.title]);

  useEffect(() => {
    setBody(fieldValue(node.body));
  }, [node.id, node.body]);

  useEffect(() => {
    if (!autoFocusTitle) return;
    const input = titleRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [autoFocusTitle, node.id]);

  useEffect(() => {
    if (registerInputs === undefined) return;
    const titleInput = titleRef.current;
    const bodyInput = bodyRef.current;
    if (titleInput === null || bodyInput === null) return;
    registerInputs(node.id, { title: titleInput, body: bodyInput });
    return () => {
      registerInputs(node.id, null);
    };
  }, [node.id, registerInputs]);

  const values = (): TodoItemValues => ({ title, body });

  function skipActiveInputBlurCommit(): void {
    if (document.activeElement === titleRef.current) {
      skipBlurCommitRef.current = NO_LOOSE_STRING_VALUES.title;
    } else if (document.activeElement === bodyRef.current) {
      skipBlurCommitRef.current = NO_LOOSE_STRING_VALUES.body;
    }
  }

  async function commitTitle(): Promise<void> {
    if (skipBlurCommitRef.current === NO_LOOSE_STRING_VALUES.title) {
      skipBlurCommitRef.current = null;
      return;
    }
    const previous = fieldValue(node.title);
    if (title === previous) return;
    if (draft && title.trim().length === 0) return;
    await onUpdate({ title, body });
  }

  async function commitBody(): Promise<void> {
    if (skipBlurCommitRef.current === NO_LOOSE_STRING_VALUES.body) {
      skipBlurCommitRef.current = null;
      return;
    }
    const previous = fieldValue(node.body);
    if (body === previous) return;
    await onUpdate({ title, body });
  }

  function onInputKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: TodoInputField,
  ): void {
    handleTodoInputKeyDown({
      event,
      field,
      values: values(),
      bodyRef,
      skipBlurCommitRef,
      onIndent,
      onOutdent,
      onFocusPrev,
      onFocusNext,
      onCommitAndCreateBelow,
      onRemove,
      onToggleDone,
    });
  }

  return {
    title,
    body,
    titleRef,
    bodyRef,
    setTitle,
    setBody,
    values,
    skipActiveInputBlurCommit,
    commitTitle,
    commitBody,
    onInputKeyDown,
  };
}
