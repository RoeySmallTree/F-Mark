import type { JSX, RefObject } from "react";
import type { TodoInputKeyDown } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  body: "body",
} as const;

interface TodoItemDescriptionProps {
  body: string;
  bodyRef: RefObject<HTMLTextAreaElement>;
  onBodyBlur: () => Promise<void>;
  onBodyChange: (value: string) => void;
  onBodyKeyDown: TodoInputKeyDown;
}

export function TodoItemDescription({
  body,
  bodyRef,
  onBodyBlur,
  onBodyChange,
  onBodyKeyDown,
}: TodoItemDescriptionProps): JSX.Element {
  return (
    <textarea
      ref={bodyRef}
      className="todo-desc"
      value={body}
      placeholder="Task description (optional)"
      aria-label="Task description"
      rows={1}
      onChange={(event) => onBodyChange(event.target.value)}
      onKeyDown={(event) => onBodyKeyDown(event, NO_LOOSE_STRING_VALUES.body)}
      onBlur={() => void onBodyBlur()}
    />
  );
}
