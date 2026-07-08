import type { JSX, MutableRefObject } from "react";
import { Plus } from "lucide-react";

interface TodoTreeAddRowProps {
  addRowRef: MutableRefObject<HTMLButtonElement | null>;
  disabled: boolean;
  onClick: () => void;
}

export function TodoTreeAddRow({
  addRowRef,
  disabled,
  onClick,
}: TodoTreeAddRowProps): JSX.Element {
  return (
    <button
      ref={addRowRef}
      type="button"
      className="todo-add-row"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus size={13} aria-hidden />
      Add task
    </button>
  );
}

interface TodoTreeMessagesProps {
  loadError: string | null;
  actionError: string | null;
}

export function TodoTreeMessages({
  loadError,
  actionError,
}: TodoTreeMessagesProps): JSX.Element {
  return (
    <>
      {loadError !== null ? (
        <p className="todo-load-note" title={loadError}>
          (kernel endpoint not yet available)
        </p>
      ) : null}
      {actionError !== null ? (
        <p className="todo-error" role="alert">
          {actionError}
        </p>
      ) : null}
    </>
  );
}
