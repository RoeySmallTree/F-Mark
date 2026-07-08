/* AvatarCropper — the public import surface for framing a chosen image into a
   square avatar. Behavior and presentation live under ./avatarCropper/. */

import type { JSX } from "react";
import { AvatarCropperView } from "./avatarCropper/AvatarCropperView.js";
import { useAvatarCropperController } from "./avatarCropper/useAvatarCropperController.js";
import "./avatarCropper.css";

export interface AvatarCropperProps {
  src: string;
  onApply(dataUrl: string): void;
  onCancel(): void;
}

export function AvatarCropper({
  src,
  onApply,
  onCancel,
}: AvatarCropperProps): JSX.Element {
  const controller = useAvatarCropperController({ src, onApply, onCancel });
  return <AvatarCropperView controller={controller} />;
}
