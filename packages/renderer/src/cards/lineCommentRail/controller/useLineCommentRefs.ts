import { useRef } from "react";

export function useLineCommentRefs() {
  return {
    wrapRef: useRef<HTMLDivElement | null>(null),
    contentRef: useRef<HTMLDivElement | null>(null),
    popoverRef: useRef<HTMLDivElement | null>(null),
    textareaRef: useRef<HTMLTextAreaElement | null>(null),
  };
}
