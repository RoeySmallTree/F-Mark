import type { JSX } from "react";
import { CreateTodoPopoverView } from "./createTodoPopover/CreateTodoPopoverView.js";
import type { CreateTodoPopoverProps } from "./createTodoPopover/types.js";
import { useCreateTodoPopoverController } from "./createTodoPopover/useCreateTodoPopoverController.js";

export function CreateTodoPopover({
  anchorRect,
  onClose,
  endTurnAfter,
  onCreated,
}: CreateTodoPopoverProps): JSX.Element {
  const controller = useCreateTodoPopoverController({ onClose, onCreated });

  return (
    <CreateTodoPopoverView
      anchorRect={anchorRect}
      onClose={onClose}
      endTurnAfter={endTurnAfter}
      controller={controller}
    />
  );
}
