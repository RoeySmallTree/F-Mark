import { useRef, type JSX, type MouseEvent } from "react";
import { X } from "lucide-react";
import { AvatarCropperActions } from "./AvatarCropperActions.js";
import { AvatarCropperStage } from "./AvatarCropperStage.js";
import { AvatarCropperZoom } from "./AvatarCropperZoom.js";
import type { AvatarCropperController } from "./useAvatarCropperController.js";
import { useFocusTrap } from "../../a11y/useFocusTrap.js";

interface AvatarCropperViewProps {
  controller: AvatarCropperController;
}

export function AvatarCropperView({
  controller,
}: AvatarCropperViewProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      className="modal-backdrop avatar-cropper-backdrop"
      role="presentation"
      data-modal="avatar-cropper"
      onClick={controller.onCancel}
    >
      <div
        ref={dialogRef}
        className="modal avatar-cropper"
        role="dialog"
        aria-modal="true"
        aria-label="Crop profile photo"
        onClick={stopPropagation}
      >
        <AvatarCropperHeader onCancel={controller.onCancel} />
        <div className="modal-body avatar-cropper-body">
          <AvatarCropperStage controller={controller} src={controller.src} />
          <AvatarCropperZoom
            disabled={!controller.canZoom}
            maxZoom={controller.maxZoom}
            zoom={controller.zoom}
            onZoomChange={controller.applyZoom}
          />
          <p className="avatar-cropper-hint">
            Drag to reposition · scroll to zoom
          </p>
          {controller.error !== null ? (
            <div role="alert" className="form-error">
              {controller.error}
            </div>
          ) : null}
        </div>
        <AvatarCropperActions
          applying={controller.applying}
          canApply={controller.canApply}
          onApply={controller.apply}
          onCancel={controller.onCancel}
        />
      </div>
    </div>
  );
}

interface AvatarCropperHeaderProps {
  onCancel(): void;
}

function AvatarCropperHeader({
  onCancel,
}: AvatarCropperHeaderProps): JSX.Element {
  return (
    <div className="modal-head">
      <div className="modal-eyebrow">PHOTO</div>
      <h2 className="modal-title">Crop your photo</h2>
      <button
        type="button"
        className="icon-btn modal-close"
        aria-label="Cancel"
        onClick={onCancel}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function stopPropagation(event: MouseEvent<HTMLDivElement>): void {
  event.stopPropagation();
}
