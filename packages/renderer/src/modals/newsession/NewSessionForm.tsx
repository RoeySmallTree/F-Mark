import { type JSX } from "react";
import { FolderField } from "./FolderField.js";
import type { NewSessionController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  creating: "Creating…",
} as const;

interface NewSessionFormProps {
  controller: NewSessionController;
}

export function NewSessionForm({
  controller,
}: NewSessionFormProps): JSX.Element {
  return (
    <>
      <div className="modal-body">
        <FolderField controller={controller} />
        <p className="form-hint">
          The session opens as “new-session” — your agent renames it once it
          knows what you’re working on.
        </p>
        {controller.error !== null && (
          <div className="form-error" role="alert" style={{ marginTop: 8 }}>
            {controller.error}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <div className="foot-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={controller.closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-solid"
            disabled={!controller.canSubmit}
            onClick={() => void controller.createSession()}
          >
            {controller.submitting ? NO_LOOSE_STRING_VALUES.creating : "Create session"}
          </button>
        </div>
      </div>
    </>
  );
}
