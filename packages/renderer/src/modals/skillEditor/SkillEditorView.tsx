import { type JSX } from "react";
import { X } from "lucide-react";
import type { SkillEditorController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  saving: "Saving...",
  save: "Save",
} as const;

interface SkillEditorViewProps {
  controller: SkillEditorController;
}

/* Focus trap: this dialog renders inside ModalBackdrop, which applies
   useFocusTrap to the shared container — see src/a11y/useFocusTrap.ts. */
export function SkillEditorView({
  controller,
}: SkillEditorViewProps): JSX.Element {
  return (
    <div
      className="modal skill-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-editor-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="modal-head">
        <div className="modal-eyebrow">EDIT SKILL</div>
        <h2 className="modal-title" id="skill-editor-title">
          {controller.name.length > 0 ? `/${controller.name}` : "Edit skill"}
        </h2>
        <button
          type="button"
          className="icon-btn modal-close"
          aria-label="Close"
          onClick={controller.close}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <SkillEditorBody controller={controller} />
      <SkillEditorFooter controller={controller} />
    </div>
  );
}

function SkillEditorBody({
  controller,
}: SkillEditorViewProps): JSX.Element {
  if (controller.loading) {
    return <div className="modal-body skill-editor-state">Loading skill...</div>;
  }
  return (
    <div className="modal-body">
      {controller.pathLabel.length > 0 ? (
        <div className="skill-editor-path">{controller.pathLabel}</div>
      ) : null}
      <div className="skill-editor-grid">
        <label className="form-row">
          <span className="form-label">Name</span>
          <input
            ref={controller.nameRef}
            className="form-input"
            value={controller.name}
            onChange={(event) => controller.setName(event.target.value)}
            aria-label="Skill name"
            spellCheck={false}
          />
        </label>
        <label className="form-row">
          <span className="form-label">Args</span>
          <input
            className="form-input"
            value={controller.args}
            onChange={(event) => controller.setArgs(event.target.value)}
            aria-label="Skill args"
            placeholder="<optional>"
            spellCheck={false}
          />
        </label>
      </div>
      <label className="form-row">
        <span className="form-label">Description</span>
        <textarea
          className="form-textarea skill-editor-description"
          value={controller.description}
          onChange={(event) => controller.setDescription(event.target.value)}
          aria-label="Skill description"
          rows={3}
        />
      </label>
      <label className="form-row">
        <span className="form-label">Body</span>
        <textarea
          className="form-textarea skill-editor-body"
          value={controller.body}
          onChange={(event) => controller.setBody(event.target.value)}
          aria-label="Skill body"
          rows={14}
          spellCheck={false}
        />
      </label>
      {controller.error !== null ? (
        <div className="form-error" role="alert">
          {controller.error}
        </div>
      ) : null}
    </div>
  );
}

function SkillEditorFooter({
  controller,
}: SkillEditorViewProps): JSX.Element {
  return (
    <div className="modal-foot">
      <div className="hint" />
      <div className="foot-actions">
        <button type="button" className="btn-ghost" onClick={controller.close}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-solid"
          disabled={!controller.canSave}
          onClick={controller.save}
        >
          {controller.saving ? NO_LOOSE_STRING_VALUES.saving : NO_LOOSE_STRING_VALUES.save}
        </button>
      </div>
    </div>
  );
}
