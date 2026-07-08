import type { CSSProperties } from "react";
import type { Point } from "../../lib/avatarCrop.js";
import { AvatarImageError } from "../../lib/avatarImage.js";

const NO_LOOSE_STRING_VALUES = {
  hidden: "hidden",
} as const;

export const AVATAR_CROP_VIEWPORT = 264; // px, the square crop frame
export const AVATAR_CROP_MAX_ZOOM = 4; // relative to the cover scale

export interface AvatarCropImageSize {
  w: number;
  h: number;
}

export function clampZoom(zoom: number): number {
  return Math.min(AVATAR_CROP_MAX_ZOOM, Math.max(1, zoom));
}

export function imageStyleForCrop(input: {
  natural: AvatarCropImageSize | null;
  offset: Point;
  scale: number;
}): CSSProperties {
  if (input.natural === null) {
    return { visibility: NO_LOOSE_STRING_VALUES.hidden };
  }
  return {
    left: input.offset.x,
    top: input.offset.y,
    width: input.natural.w * input.scale,
    height: input.natural.h * input.scale,
  };
}

export function cropErrorMessage(error: unknown): string {
  return error instanceof AvatarImageError
    ? error.message
    : "Could not crop image.";
}
