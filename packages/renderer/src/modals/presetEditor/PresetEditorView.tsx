import { type JSX } from "react";
import { Smile, Trash2, X } from "lucide-react";
import { CategoryField } from "./CategoryField.js";
import { EmojiPicker } from "./EmojiPicker.js";
import { WorkspaceChips } from "./WorkspaceChips.js";
import type { PresetEditorController } from "./types.js";

interface PresetEditorViewProps {
  controller: PresetEditorController;
}

/* Focus trap: this dialog renders inside ModalBackdrop, which applies
   useFocusTrap to the shared container — see src/a11y/useFocusTrap.ts. */
export function PresetEditorView({
  controller,
}: PresetEditorViewProps): JSX.Element {
  return (
    <div
      className="modal preset-editor"
      style={{ width: 560 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-editor-title"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={controller.onKeyDown}
    >
      <PresetEditorHeader
        isNew={controller.isNew}
        onClose={controller.closeModal}
      />
      <PresetEditorBody controller={controller} />
      <PresetEditorFooter controller={controller} />
    </div>
  );
}

function PresetEditorHeader({
  isNew,
  onClose,
}: {
  isNew: boolean;
  onClose(): void;
}): JSX.Element {
  return (
    <div className="modal-head">
      <div className="modal-eyebrow">{isNew ? "NEW PRESET" : "EDIT PRESET"}</div>
      <h2 className="modal-title" id="preset-editor-title">
        {isNew ? "A new preset" : "Edit preset"}
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

function PresetEditorBody({
  controller,
}: PresetEditorViewProps): JSX.Element {
  return (
    <div className="modal-body">
      <PresetNameField controller={controller} />
      <CategoryField
        categories={controller.categories}
        group={controller.group}
        managingCategories={controller.managingCategories}
        onGroupChange={controller.setGroup}
        onManagingCategoriesChange={controller.setManagingCategories}
        onAfterMutate={controller.bumpCustomCategories}
      />
      <PresetContentField body={controller.body} onBodyChange={controller.setBody} />
      <WorkspaceField
        workspaces={controller.workspaces}
        onToggle={controller.toggleWorkspace}
      />
    </div>
  );
}

function PresetNameField({
  controller,
}: PresetEditorViewProps): JSX.Element {
  return (
    <div className="preset-editor-head">
      <div className="preset-editor-emoji-wrap">
        <button
          type="button"
          className="preset-editor-emoji"
          onClick={() => controller.setEmojiOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={controller.emojiOpen}
          aria-label={`Emoji: ${controller.icon}. Click to change.`}
        >
          <span aria-hidden>{controller.icon}</span>
          <Smile size={11} aria-hidden className="preset-editor-emoji-hint" />
        </button>
        {controller.emojiOpen ? (
          <EmojiPicker
            value={controller.icon}
            emojis={controller.categoryEmojis}
            onChange={controller.setIcon}
            onClose={() => controller.setEmojiOpen(false)}
          />
        ) : null}
      </div>
      <input
        ref={controller.nameRef}
        type="text"
        className="preset-editor-name"
        value={controller.name}
        onChange={(event) => controller.setName(event.target.value)}
        placeholder="Name your preset…"
        aria-label="Preset name"
        maxLength={80}
      />
    </div>
  );
}

function PresetContentField({
  body,
  onBodyChange,
}: {
  body: string;
  onBodyChange(body: string): void;
}): JSX.Element {
  return (
    <div className="form-row" style={{ marginTop: 18 }}>
      <div className="form-label" style={{ marginBottom: 8 }}>
        CONTENT
      </div>
      <textarea
        className="form-textarea preset-editor-body"
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        placeholder="Write the prompt this preset will insert…"
        aria-label="Preset content"
        rows={8}
      />
      <div className="form-hint">
        Inserted into the compose box when picked. Edit before sending.
      </div>
    </div>
  );
}

function WorkspaceField({
  workspaces,
  onToggle,
}: {
  workspaces: string[];
  onToggle(path: string): void;
}): JSX.Element {
  return (
    <div className="form-row" style={{ marginTop: 18 }}>
      <div className="form-label" style={{ marginBottom: 8 }}>
        RELEVANT WORKSPACES
        <span className="form-hint-inline">empty = all</span>
      </div>
      <WorkspaceChips
        selected={workspaces}
        onToggle={onToggle}
        ariaLabel="Relevant workspaces"
      />
    </div>
  );
}

function PresetEditorFooter({
  controller,
}: PresetEditorViewProps): JSX.Element {
  return (
    <div className="modal-foot">
      {!controller.isNew ? <DeletePresetControl controller={controller} /> : null}
      <div className="hint" />
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
          disabled={!controller.canSave}
          onClick={controller.onSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function DeletePresetControl({
  controller,
}: PresetEditorViewProps): JSX.Element {
  if (controller.confirmingDelete) {
    return (
      <div className="preset-editor-delete">
        <span className="hint" style={{ flex: "none", marginRight: 8 }}>
          Delete this preset?
        </span>
        <button
          type="button"
          className="btn-ghost preset-editor-confirm-delete"
          onClick={controller.onDelete}
        >
          Delete
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => controller.setConfirmingDelete(false)}
        >
          Keep
        </button>
      </div>
    );
  }
  return (
    <div className="preset-editor-delete">
      <button
        type="button"
        className="btn-ghost preset-editor-delete-btn"
        onClick={() => controller.setConfirmingDelete(true)}
        aria-label="Delete preset"
      >
        <Trash2 size={12} aria-hidden />
        Remove
      </button>
    </div>
  );
}
