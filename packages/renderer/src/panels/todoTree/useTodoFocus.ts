import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import type { TodoListResponse } from "../../api/client.js";
import type {
  TodoInputField,
  TodoInputRefs,
} from "../../cards/TodoItem.js";
import type { DraftTodo, PendingFocus } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  title: "title",
  addRow: "add-row",
} as const;

interface UseTodoFocusArgs {
  draft: DraftTodo | null;
  todos: TodoListResponse;
}

interface TodoFocusController {
  addRowRef: MutableRefObject<HTMLButtonElement | null>;
  pendingFocusRef: MutableRefObject<PendingFocus | null>;
  registerInputs: (id: string, inputs: TodoInputRefs | null) => void;
  focusTodo: (id: string, field?: TodoInputField) => boolean;
  resetTodoFocusRegistry: () => void;
}

export function useTodoFocus({
  draft,
  todos,
}: UseTodoFocusArgs): TodoFocusController {
  const inputRefs = useRef<Map<string, TodoInputRefs>>(new Map());
  const addRowRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  const registerInputs = useCallback(
    (id: string, inputs: TodoInputRefs | null): void => {
      if (inputs === null) {
        inputRefs.current.delete(id);
        return;
      }
      inputRefs.current.set(id, inputs);
    },
    [],
  );

  const focusTodo = useCallback(
    (id: string, field: TodoInputField = NO_LOOSE_STRING_VALUES.title): boolean => {
      const inputs = inputRefs.current.get(id);
      if (inputs === undefined) return false;
      const target = inputs[field];
      target.scrollIntoView?.({ block: "nearest" });
      target.focus();
      return true;
    },
    [],
  );

  const resetTodoFocusRegistry = useCallback((): void => {
    inputRefs.current.clear();
    pendingFocusRef.current = null;
  }, []);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    if (pending.kind === NO_LOOSE_STRING_VALUES.addRow) {
      const button = addRowRef.current;
      if (button === null) return;
      button.focus();
      pendingFocusRef.current = null;
      return;
    }
    if (focusTodo(pending.id, pending.field)) {
      pendingFocusRef.current = null;
    }
  }, [draft, focusTodo, todos]);

  return {
    addRowRef,
    pendingFocusRef,
    registerInputs,
    focusTodo,
    resetTodoFocusRegistry,
  };
}
