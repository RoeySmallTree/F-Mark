import { type JSX } from "react";
import { X } from "lucide-react";
import { FolderPicker } from "./FolderPicker.js";
import { NewSessionForm } from "./NewSessionForm.js";
import type { NewSessionController } from "./types.js";

interface NewSessionViewProps {
  controller: NewSessionController;
}

export function NewSessionView({
  controller,
}: NewSessionViewProps): JSX.Element {
  return (
    <div
      className="modal"
      style={{ width: 560 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-session-title"
      onClick={(event) => event.stopPropagation()}
    >
      <NewSessionHeader onClose={controller.closeModal} />
      {controller.pickerOpen ? (
        <div className="modal-body">
          <FolderPicker
            initialPath={controller.folder}
            onPick={(path) => {
              controller.setFolder(path);
              controller.setPickerOpen(false);
            }}
            onCancel={() => controller.setPickerOpen(false)}
          />
        </div>
      ) : (
        <NewSessionForm controller={controller} />
      )}
    </div>
  );
}

function NewSessionHeader({ onClose }: { onClose(): void }): JSX.Element {
  return (
    <div className="modal-head">
      <div className="modal-eyebrow">NEW SESSION</div>
      <h2 className="modal-title" id="new-session-title">
        Start a new session
      </h2>
      <button
        type="button"
        className="icon-btn modal-close"
        aria-label="Close"
        onClick={onClose}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
