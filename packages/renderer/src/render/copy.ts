const NO_LOOSE_STRING_VALUES = {
  readonly: "readonly",
  fixed: "fixed",
  none: "none",
  copy: "copy",
} as const;

/**
 * Copy text to the clipboard.
 *
 * Tries the modern `navigator.clipboard.writeText` API first. On any failure
 * (older browsers, insecure context, permission denial), falls back to a
 * hidden `<textarea>` + `document.execCommand('copy')` shim.
 *
 * Returns `true` on success, `false` if both paths failed.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy path */
    }
  }

  const doc = globalThis.document;
  if (!doc) return false;

  try {
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute(NO_LOOSE_STRING_VALUES.readonly, "");
    ta.style.position = NO_LOOSE_STRING_VALUES.fixed;
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = NO_LOOSE_STRING_VALUES.none;
    doc.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = doc.execCommand(NO_LOOSE_STRING_VALUES.copy);
    doc.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
