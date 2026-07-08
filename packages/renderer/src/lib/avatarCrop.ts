/* Pure geometry for the avatar cropper — DOM-free so it is unit-testable
   without a <canvas>.

   Model: a square crop viewport of `viewport` px. The source image is laid
   out inside it with CSS left/top = `offset` and displayed size
   `natural * scale`, sized (via coverScale + clampOffset) so it always
   covers the viewport with no gaps. These helpers convert between the
   on-screen offset/scale and the source-pixel rectangle the viewport frames,
   and keep zooming anchored to the centre. */

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface SourceRect {
  x: number;
  y: number;
  size: number;
}

/* Scale at which the image exactly covers the square viewport (the minimum
   usable scale — zooming only goes up from here). */
export function coverScale(natural: Size, viewport: number): number {
  if (natural.w <= 0 || natural.h <= 0) return 1;
  return Math.max(viewport / natural.w, viewport / natural.h);
}

/* Centre the scaled image in the viewport. */
export function centeredOffset(
  natural: Size,
  scale: number,
  viewport: number,
): Point {
  return {
    x: (viewport - natural.w * scale) / 2,
    y: (viewport - natural.h * scale) / 2,
  };
}

/* Clamp the offset so the scaled image never reveals a gap at any edge. */
export function clampOffset(
  offset: Point,
  natural: Size,
  scale: number,
  viewport: number,
): Point {
  const dw = natural.w * scale;
  const dh = natural.h * scale;
  return {
    x: Math.min(0, Math.max(viewport - dw, offset.x)),
    y: Math.min(0, Math.max(viewport - dh, offset.y)),
  };
}

/* The source-image rectangle currently framed by the viewport (in image
   pixels), ready to hand to ctx.drawImage as the source rect. */
export function sourceRectFromView(
  offset: Point,
  scale: number,
  viewport: number,
): SourceRect {
  // offset ≤ 0 (image covers the viewport), so the source origin is ≥ 0;
  // Math.max also normalizes the -0 that -0/scale would otherwise produce.
  return {
    x: Math.max(0, -offset.x / scale),
    y: Math.max(0, -offset.y / scale),
    size: viewport / scale,
  };
}

/* New offset that keeps the viewport-centred source point fixed across a
   scale change, so zooming feels anchored to the middle of the frame. */
export function offsetForScale(
  offset: Point,
  oldScale: number,
  newScale: number,
  viewport: number,
): Point {
  const center = viewport / 2;
  const srcX = (center - offset.x) / oldScale;
  const srcY = (center - offset.y) / oldScale;
  return {
    x: center - srcX * newScale,
    y: center - srcY * newScale,
  };
}
