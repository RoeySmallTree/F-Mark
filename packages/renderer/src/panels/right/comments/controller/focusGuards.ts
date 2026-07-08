const NO_LOOSE_STRING_VALUES = {
  input: "INPUT",
  textarea: "TEXTAREA",
} as const;

export function isInsideCommentUi(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(".right-panel") !== null ||
    target.closest(".line-comment-anchor") !== null ||
    target.closest(".line-comment-highlight") !== null ||
    target.closest(".line-comment-popover") !== null
  );
}

export function shouldKeepFocusForEscape(
  e: globalThis.KeyboardEvent,
): boolean {
  if (e.key !== "Escape") return true;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === NO_LOOSE_STRING_VALUES.input || tag === NO_LOOSE_STRING_VALUES.textarea || target.isContentEditable;
}
