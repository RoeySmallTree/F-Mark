import { type JSX } from "react";
import { FileText, Paperclip } from "lucide-react";
import type { ComposeDragMode } from "./composeHelpers.js";

const NO_LOOSE_STRING_VALUES = {
  fmarkPath: "fmark-path",
} as const;

interface Props {
  draggingMode: ComposeDragMode | null;
}

export function ComposeDragOverlay({ draggingMode }: Props): JSX.Element | null {
  if (draggingMode === null) return null;
  return (
    <div className="compose-drag-overlay" aria-hidden>
      {draggingMode === NO_LOOSE_STRING_VALUES.fmarkPath ? (
        <FileText size={20} aria-hidden />
      ) : (
        <Paperclip size={20} aria-hidden />
      )}
      <span>
        {draggingMode === NO_LOOSE_STRING_VALUES.fmarkPath ? "Drop to paste path" : "Drop to attach"}
      </span>
    </div>
  );
}
