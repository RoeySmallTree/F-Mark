import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  applying: "Applying...",
  apply: "Apply",
} as const;

interface AvatarCropperActionsProps {
  applying: boolean;
  canApply: boolean;
  onApply(): void;
  onCancel(): void;
}

export function AvatarCropperActions({
  applying,
  canApply,
  onApply,
  onCancel,
}: AvatarCropperActionsProps): JSX.Element {
  return (
    <div className="modal-foot">
      <div className="foot-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-solid"
          disabled={!canApply}
          onClick={onApply}
        >
          {applying ? NO_LOOSE_STRING_VALUES.applying : NO_LOOSE_STRING_VALUES.apply}
        </button>
      </div>
    </div>
  );
}
