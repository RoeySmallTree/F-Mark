import type { JSX } from "react";

interface AvatarCropperZoomProps {
  disabled: boolean;
  maxZoom: number;
  zoom: number;
  onZoomChange(nextZoom: number): void;
}

export function AvatarCropperZoom({
  disabled,
  maxZoom,
  zoom,
  onZoomChange,
}: AvatarCropperZoomProps): JSX.Element {
  return (
    <label className="avatar-cropper-zoom">
      <span className="avatar-cropper-zoom-label">Zoom</span>
      <input
        type="range"
        min={1}
        max={maxZoom}
        step={0.01}
        value={zoom}
        aria-label="Zoom"
        disabled={disabled}
        onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
