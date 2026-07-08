const NO_LOOSE_STRING_VALUES = {
  dragPreviewOrb: "drag-preview-orb",
  move: "move",
  width: "width",
  value20: "20",
  height: "height",
  ariaHidden: "aria-hidden",
  dragPreviewOrbFallback: "drag-preview-orb-fallback",
} as const;

const DRAG_SOURCE_CLASS = "is-drag-source";

let activeSource: HTMLElement | null = null;

export interface CircularDragImageOptions {
  label?: string;
  fallbackText?: string;
  iconSelector?: string;
  tone?: "move" | "copy";
}

function firstGlyph(label: string | undefined, fallback: string): string {
  const trimmed = label?.trim();
  if (trimmed === undefined || trimmed.length === 0) return fallback;
  return trimmed.slice(0, 1).toUpperCase();
}

function markDragSource(source: HTMLElement | null | undefined): void {
  if (activeSource !== null && activeSource !== source) {
    activeSource.classList.remove(DRAG_SOURCE_CLASS);
  }
  activeSource = source ?? null;
  activeSource?.classList.add(DRAG_SOURCE_CLASS);
}

export function clearDragSource(): void {
  activeSource?.classList.remove(DRAG_SOURCE_CLASS);
  activeSource = null;
}

export function setCircularDragImage(
  dataTransfer: DataTransfer,
  source: HTMLElement | null | undefined,
  options: CircularDragImageOptions = {},
): void {
  markDragSource(source);
  if (source === null || source === undefined) return;
  if (typeof dataTransfer.setDragImage !== "function") return;
  if (typeof document === "undefined") return;

  const preview = document.createElement("div");
  preview.className = NO_LOOSE_STRING_VALUES.dragPreviewOrb;
  preview.dataset.tone = options.tone ?? NO_LOOSE_STRING_VALUES.move;

  const icon =
    options.iconSelector !== undefined
      ? source.querySelector<SVGElement>(options.iconSelector)
      : source.querySelector<SVGElement>("svg");
  if (icon !== null) {
    const clone = icon.cloneNode(true) as SVGElement;
    clone.setAttribute(NO_LOOSE_STRING_VALUES.width, NO_LOOSE_STRING_VALUES.value20);
    clone.setAttribute(NO_LOOSE_STRING_VALUES.height, NO_LOOSE_STRING_VALUES.value20);
    clone.setAttribute(NO_LOOSE_STRING_VALUES.ariaHidden, "true");
    preview.appendChild(clone);
  } else {
    const fallback = document.createElement("span");
    fallback.className = NO_LOOSE_STRING_VALUES.dragPreviewOrbFallback;
    fallback.textContent = firstGlyph(options.label, options.fallbackText ?? "P");
    preview.appendChild(fallback);
  }

  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, 24, 24);
  window.setTimeout(() => preview.remove(), 0);
}
