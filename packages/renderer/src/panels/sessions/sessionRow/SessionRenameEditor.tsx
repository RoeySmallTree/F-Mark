import type {
  ChangeEvent,
  JSX,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { Check, X } from "lucide-react";

interface SessionRenameEditorProps {
  renameValue: string;
  sessionSlug: string;
  onCancel: () => void;
  onRenameValueChange: (value: string) => void;
  onSave: () => void;
}

function stopRenamePropagation(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation();
}

export function SessionRenameEditor(
  props: SessionRenameEditorProps,
): JSX.Element {
  const {
    renameValue,
    sessionSlug,
    onCancel,
    onRenameValueChange,
    onSave,
  } = props;

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onRenameValueChange(event.target.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  function handleSaveClick(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onSave();
  }

  function handleCancelClick(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onCancel();
  }

  return (
    <span
      className="session-rename"
      onClick={stopRenamePropagation}
      onDoubleClick={stopRenamePropagation}
    >
      <input
        value={renameValue}
        aria-label={`Rename ${sessionSlug}`}
        autoFocus
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="session-row-action"
        aria-label="Save session name"
        onClick={handleSaveClick}
      >
        <Check size={13} aria-hidden />
      </button>
      <button
        type="button"
        className="session-row-action"
        aria-label="Cancel rename"
        onClick={handleCancelClick}
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  );
}
