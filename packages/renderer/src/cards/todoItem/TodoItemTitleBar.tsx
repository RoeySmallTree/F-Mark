import type { JSX, RefObject } from "react";
import { Check } from "lucide-react";
import type { TodoInputKeyDown } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  title: "title",
} as const;

interface TodoItemTitleBarProps {
  done: boolean;
  title: string;
  titlePlaceholder: string;
  titleRef: RefObject<HTMLTextAreaElement>;
  onTitleBlur: () => Promise<void>;
  onTitleChange: (value: string) => void;
  onTitleKeyDown: TodoInputKeyDown;
  onToggleDone: () => Promise<void>;
  onSkipActiveInputBlurCommit: () => void;
}

export function TodoItemTitleBar({
  done,
  title,
  titlePlaceholder,
  titleRef,
  onTitleBlur,
  onTitleChange,
  onTitleKeyDown,
  onToggleDone,
  onSkipActiveInputBlurCommit,
}: TodoItemTitleBarProps): JSX.Element {
  return (
    <div className="todo-title-bar">
      <button
        type="button"
        className={["todo-check", done ? "done" : ""].join(" ").trim()}
        aria-pressed={done}
        aria-label={done ? "Mark as open" : "Mark as done"}
        onMouseDown={onSkipActiveInputBlurCommit}
        onClick={() => {
          void onToggleDone();
        }}
      >
        {done ? <Check size={12} strokeWidth={3.2} aria-hidden /> : null}
      </button>
      <textarea
        ref={titleRef}
        className="todo-title"
        value={title}
        placeholder={titlePlaceholder}
        aria-label="Task title"
        rows={1}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => onTitleKeyDown(event, NO_LOOSE_STRING_VALUES.title)}
        onBlur={() => void onTitleBlur()}
      />
    </div>
  );
}
