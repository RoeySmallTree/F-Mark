const NO_LOOSE_STRING_VALUES = {
  value2d: "2d",
  high: "high",
  rgba4444: "rgba4444",
} as const;

/* Avatar image I/O: read a chosen file for cropping, and turn a crop region
   into a project-local data URL.

   The product rule is "pick any image, no size error." We honor it by
   *adapting* rather than rejecting: the user frames a square crop, which we
   downscale + re-encode only when needed to stay within the local persistence
   ceiling. GIFs keep their animation by being decoded, cropped frame-by-frame,
   and encoded back to an animated GIF. */

const PARTICIPANT_AVATAR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { SourceRect } from "./avatarCrop.js";

const ACCEPTED_MIME = new Set<string>(PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES);

/* Avatars render at ≤44px, so 512px is already generous; animated GIFs may
   retry smaller output dimensions if they cross the local persistence cap. */
const MAX_DIMENSION = 512;
const TARGET_BYTES = PARTICIPANT_AVATAR_IMAGE_MAX_BYTES;
/* base64 inflates bytes ~4/3, plus a short `data:<mime>;base64,` header. */
const TARGET_DATA_URL_LENGTH = Math.ceil(TARGET_BYTES / 3) * 4 + 32;
const GIF_OUTPUT_DIMENSIONS = [512, 384, 256, 192, 128, 96, 64];

export class AvatarImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarImageError";
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new AvatarImageError("Could not read image file."));
    });
    reader.addEventListener("error", () =>
      reject(new AvatarImageError("Could not read image file.")),
    );
    reader.readAsDataURL(file);
  });
}

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  const padding =
    base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function dataUrlToBytes(dataUrl: string, expectedMime: string): Uint8Array {
  const prefix = `data:${expectedMime};base64,`;
  if (!dataUrl.toLowerCase().startsWith(prefix)) {
    throw new AvatarImageError("Could not process image.");
  }
  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function plainArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new AvatarImageError("Could not process image."));
    });
    reader.addEventListener("error", () =>
      reject(new AvatarImageError("Could not process image.")),
    );
    reader.readAsDataURL(new Blob([plainArrayBuffer(bytes)], { type: mimeType }));
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new AvatarImageError("Could not load image.")),
      { once: true },
    );
    image.src = src;
  });
}

/* Re-encode the canvas, stepping quality down until the data URL fits the
   target. WebP keeps alpha and compresses well; JPEG is the universal
   fallback when the browser can't encode WebP (toDataURL silently returns
   PNG for an unsupported type, which we skip). */
function encodeUnderTarget(canvas: HTMLCanvasElement): string {
  for (const quality of [0.85, 0.7, 0.55]) {
    for (const type of ["image/webp", "image/jpeg"]) {
      const url = canvas.toDataURL(type, quality);
      if (
        url.startsWith(`data:${type}`) &&
        url.length <= TARGET_DATA_URL_LENGTH
      ) {
        return url;
      }
    }
  }
  // A ≤512px JPEG at this quality is always well under target; final fallback.
  return canvas.toDataURL("image/jpeg", 0.5);
}

export function isAnimatedGifDataUrl(
  dataUrl: string | undefined,
): dataUrl is string {
  return dataUrl?.toLowerCase().startsWith("data:image/gif;base64,") === true;
}

const stillFrameCache = new Map<string, string | Promise<string>>();

export function cachedStillAvatarDataUrl(dataUrl: string): string | undefined {
  const cached = stillFrameCache.get(dataUrl);
  return typeof cached === "string" ? cached : undefined;
}

export function stillAvatarDataUrl(dataUrl: string): Promise<string> {
  const cached = stillFrameCache.get(dataUrl);
  if (typeof cached === "string") return Promise.resolve(cached);
  if (cached !== undefined) return cached;

  const promise = loadImage(dataUrl)
    .then((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth);
      canvas.height = Math.max(1, image.naturalHeight);
      const ctx = canvas.getContext(NO_LOOSE_STRING_VALUES.value2d);
      if (ctx === null) {
        throw new AvatarImageError("Could not process image.");
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return encodeUnderTarget(canvas);
    })
    .then(
      (still) => {
        stillFrameCache.set(dataUrl, still);
        return still;
      },
      (err: unknown) => {
        stillFrameCache.delete(dataUrl);
        throw err;
      },
    );
  stillFrameCache.set(dataUrl, promise);
  return promise;
}

/* Validate the MIME and read the chosen file to a data URL the cropper can
   display. Throws AvatarImageError for non-images or unreadable files —
   never for size (large images are cropped/downscaled, not rejected). */
export async function readImageFile(file: File): Promise<string> {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new AvatarImageError("Choose a PNG, JPEG, WebP, or GIF image.");
  }
  return readFileAsDataUrl(file);
}

function outputDimension(source: SourceRect): number {
  return Math.max(1, Math.min(MAX_DIMENSION, Math.round(source.size)));
}

function candidateGifDimensions(base: number): number[] {
  const out: number[] = [];
  for (const dim of GIF_OUTPUT_DIMENSIONS) {
    if (dim <= base) out.push(dim);
  }
  if (!out.includes(base)) out.unshift(base);
  return out;
}

function drawCroppedCanvas(
  sourceCanvas: HTMLCanvasElement | HTMLImageElement,
  source: SourceRect,
  out: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext(NO_LOOSE_STRING_VALUES.value2d);
  if (ctx === null) {
    throw new AvatarImageError("Could not process image.");
  }
  ctx.imageSmoothingQuality = NO_LOOSE_STRING_VALUES.high;
  ctx.drawImage(
    sourceCanvas,
    source.x,
    source.y,
    source.size,
    source.size,
    0,
    0,
    out,
    out,
  );
  return canvas;
}

function drawFramePatch(
  full: Uint8ClampedArray,
  gifWidth: number,
  frame: ParsedFrame,
): void {
  const { left, top, width, height } = frame.dims;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const patchIndex = (y * width + x) * 4;
      const alpha = frame.patch[patchIndex + 3] ?? 0;
      if (alpha === 0) continue;
      const targetIndex = ((top + y) * gifWidth + (left + x)) * 4;
      full[targetIndex] = frame.patch[patchIndex] ?? 0;
      full[targetIndex + 1] = frame.patch[patchIndex + 1] ?? 0;
      full[targetIndex + 2] = frame.patch[patchIndex + 2] ?? 0;
      full[targetIndex + 3] = alpha;
    }
  }
}

function clearFrameRect(
  full: Uint8ClampedArray,
  gifWidth: number,
  frame: ParsedFrame,
): void {
  const { left, top, width, height } = frame.dims;
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * gifWidth + left) * 4;
    full.fill(0, start, start + width * 4);
  }
}

function encodeGifFrame(
  gif: ReturnType<typeof GIFEncoder>,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  delay: number,
): void {
  const palette = quantize(data, 256, {
    format: NO_LOOSE_STRING_VALUES.rgba4444,
    oneBitAlpha: true,
  });
  const transparentIndex = palette.findIndex(
    (entry) => entry.length >= 4 && (entry[3] ?? 255) === 0,
  );
  const index = applyPalette(data, palette, NO_LOOSE_STRING_VALUES.rgba4444);
  gif.writeFrame(index, width, height, {
    palette,
    delay,
    repeat: 0,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
}

function renderCroppedGifBytes(
  frames: ParsedFrame[],
  gifWidth: number,
  gifHeight: number,
  source: SourceRect,
  out: number,
): Uint8Array {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = gifWidth;
  sourceCanvas.height = gifHeight;
  const sourceCtx = sourceCanvas.getContext(NO_LOOSE_STRING_VALUES.value2d);
  if (sourceCtx === null) {
    throw new AvatarImageError("Could not process animated GIF.");
  }

  const gif = GIFEncoder();
  let full = new Uint8ClampedArray(gifWidth * gifHeight * 4);

  for (const frame of frames) {
    const restorePrevious =
      frame.disposalType === 3 ? new Uint8ClampedArray(full) : null;
    drawFramePatch(full, gifWidth, frame);
    sourceCtx.putImageData(new ImageData(full, gifWidth, gifHeight), 0, 0);
    const cropped = drawCroppedCanvas(sourceCanvas, source, out);
    const croppedCtx = cropped.getContext(NO_LOOSE_STRING_VALUES.value2d);
    if (croppedCtx === null) {
      throw new AvatarImageError("Could not process animated GIF.");
    }
    const imageData = croppedCtx.getImageData(0, 0, out, out);
    encodeGifFrame(
      gif,
      imageData.data,
      out,
      out,
      Math.max(20, frame.delay || 100),
    );

    if (frame.disposalType === 2) {
      clearFrameRect(full, gifWidth, frame);
    } else if (restorePrevious !== null) {
      full = restorePrevious;
    }
  }

  gif.finish();
  return gif.bytes();
}

async function cropGifToAvatarDataUrl(
  dataUrl: string,
  source: SourceRect,
): Promise<string> {
  try {
    const bytes = dataUrlToBytes(dataUrl, "image/gif");
    const parsed = parseGIF(plainArrayBuffer(bytes));
    const frames = decompressFrames(parsed, true);
    if (frames.length === 0) {
      throw new AvatarImageError("Animated GIF has no frames.");
    }

    for (const out of candidateGifDimensions(outputDimension(source))) {
      const cropped = renderCroppedGifBytes(
        frames,
        parsed.lsd.width,
        parsed.lsd.height,
        source,
        out,
      );
      const croppedDataUrl = await bytesToDataUrl(cropped, "image/gif");
      if (dataUrlByteLength(croppedDataUrl) <= TARGET_BYTES) {
        return croppedDataUrl;
      }
    }
  } catch (err) {
    if (err instanceof AvatarImageError) throw err;
    throw new AvatarImageError("Could not process animated GIF.");
  }

  throw new AvatarImageError(
    `avatar image too large after cropping (max ${PARTICIPANT_AVATAR_IMAGE_MAX_BYTES} bytes)`,
  );
}

/* Draw the chosen square `source` region of a loaded image into a bounded
   canvas and encode it as a small avatar data URL. */
export async function cropToAvatarDataUrl(
  image: HTMLImageElement,
  source: SourceRect,
  originalDataUrl?: string,
): Promise<string> {
  if (isAnimatedGifDataUrl(originalDataUrl)) {
    return cropGifToAvatarDataUrl(originalDataUrl, source);
  }
  const canvas = drawCroppedCanvas(image, source, outputDimension(source));
  return encodeUnderTarget(canvas);
}
