import { type JSX } from "react";
import { ComposeDragOverlay } from "../ComposeDragOverlay.js";
import type { ComposeRootController } from "./types.js";
import { ComposeDraftHeader } from "./ComposeDraftHeader.js";
import { ComposeMessageBox } from "./ComposeMessageBox.js";
import { ComposeRootPopovers } from "./ComposeRootPopovers.js";

interface Props {
  controller: ComposeRootController;
}

export function ComposeRootView({ controller }: Props): JSX.Element {
  const { attachments } = controller.services;

  return (
    <div
      className={`compose-inner${attachments.isDraggingFiles ? " is-dragging-files" : ""}`}
      data-drag-mode={attachments.draggingMode ?? undefined}
      onDragEnter={attachments.handleDragEnter}
      onDragLeave={attachments.handleDragLeave}
      onDragOver={attachments.handleDragOver}
      onDrop={attachments.handleDrop}
    >
      <ComposeDraftHeader controller={controller} />
      <ComposeMessageBox controller={controller} />
      <ComposeRootPopovers controller={controller} />
      <ComposeDragOverlay draggingMode={attachments.draggingMode} />
    </div>
  );
}
