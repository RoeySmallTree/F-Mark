import type { JSX } from "react";
import type { AvatarCropperController } from "./useAvatarCropperController.js";

interface AvatarCropperStageProps {
  controller: AvatarCropperController;
  src: string;
}

export function AvatarCropperStage({
  controller,
  src,
}: AvatarCropperStageProps): JSX.Element {
  return (
    <div
      ref={controller.stageRef}
      className="avatar-cropper-stage"
      style={{ width: controller.viewport, height: controller.viewport }}
      onPointerDown={controller.onPointerDown}
      onPointerMove={controller.onPointerMove}
      onPointerUp={controller.endDrag}
      onPointerCancel={controller.endDrag}
    >
      <img
        ref={controller.imageRef}
        src={src}
        alt=""
        draggable={false}
        className="avatar-cropper-img"
        style={controller.imageStyle}
        onLoad={controller.onImageLoad}
      />
      <div className="avatar-cropper-ring" aria-hidden />
    </div>
  );
}
