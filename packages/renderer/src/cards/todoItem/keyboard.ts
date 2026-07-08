import type { KeyboardEvent, MutableRefObject, RefObject } from "react";
import type { TodoInputField, TodoItemValues } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  title: "title",
  body: "body",
} as const;

type TodoInputEvent = KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;

interface TodoInputKeyDownInput {
  event: TodoInputEvent;
  field: TodoInputField;
  values: TodoItemValues;
  bodyRef: RefObject<HTMLTextAreaElement>;
  skipBlurCommitRef: MutableRefObject<TodoInputField | null>;
  onIndent?: (
    field: TodoInputField,
    patch: TodoItemValues,
  ) => Promise<void> | void;
  onOutdent?: (
    field: TodoInputField,
    patch: TodoItemValues,
  ) => Promise<void> | void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  onCommitAndCreateBelow?: (patch: TodoItemValues) => Promise<void> | void;
  onRemove: (
    field?: TodoInputField,
    values?: TodoItemValues,
  ) => Promise<void>;
  onToggleDone: (values: TodoItemValues) => Promise<void>;
}

export function handleTodoInputKeyDown(input: TodoInputKeyDownInput): void {
  if (handleIndentKey(input)) return;
  if (handleModEnterKey(input)) return;
  if (handleModBackspaceKey(input)) return;
  if (handlePlainEnterKey(input)) return;
  handleArrowKey(input);
}

function handleIndentKey({
  event,
  field,
  values,
  onIndent,
  onOutdent,
}: TodoInputKeyDownInput): boolean {
  if (event.key !== "Tab") return false;
  const handler = event.shiftKey ? onOutdent : onIndent;
  if (handler === undefined) return true;
  event.preventDefault();
  void handler(field, values);
  return true;
}

function handleModEnterKey({
  event,
  values,
  onToggleDone,
}: TodoInputKeyDownInput): boolean {
  if (event.key !== "Enter" || !isModKey(event)) return false;
  event.preventDefault();
  void onToggleDone(values);
  return true;
}

function handleModBackspaceKey({
  event,
  field,
  values,
  skipBlurCommitRef,
  onRemove,
}: TodoInputKeyDownInput): boolean {
  if (event.key !== "Backspace" || !isModKey(event)) return false;
  event.preventDefault();
  skipBlurCommitRef.current = field;
  void onRemove(field, values);
  return true;
}

function handlePlainEnterKey(input: TodoInputKeyDownInput): boolean {
  if (input.event.key !== "Enter" || isModKey(input.event)) return false;
  return input.field === NO_LOOSE_STRING_VALUES.title ? focusDescription(input) : createBelow(input);
}

function focusDescription({ event, field, bodyRef }: TodoInputKeyDownInput): boolean {
  if (field !== NO_LOOSE_STRING_VALUES.title) return false;
  event.preventDefault();
  bodyRef.current?.focus();
  return true;
}

function createBelow({
  event,
  field,
  values,
  skipBlurCommitRef,
  onCommitAndCreateBelow,
}: TodoInputKeyDownInput): boolean {
  if (field !== NO_LOOSE_STRING_VALUES.body || onCommitAndCreateBelow === undefined) return false;
  event.preventDefault();
  skipBlurCommitRef.current = NO_LOOSE_STRING_VALUES.body;
  void onCommitAndCreateBelow(values);
  return true;
}

function handleArrowKey({
  event,
  onFocusPrev,
  onFocusNext,
}: TodoInputKeyDownInput): void {
  if (event.key === "ArrowUp" && onFocusPrev !== undefined) {
    event.preventDefault();
    onFocusPrev();
  }
  if (event.key === "ArrowDown" && onFocusNext !== undefined) {
    event.preventDefault();
    onFocusNext();
  }
}

function isModKey(event: TodoInputEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
