import type { JSX } from "react";
import { CreateTodoPopoverView } from "./createTodoPopover/CreateTodoPopoverView.js";
import type { CreateTodoPopoverProps } from "./createTodoPopover/types.js";
import { useCreateTodoPopoverController } from "./createTodoPopover/useCreateTodoPopoverController.js";
import { usePopoverExit } from "../popovers/usePopoverExit.js";

export function CreateTodoPopover({
  anchorRect,
  onClose,
  endTurnAfter,
  onCreated,
}: CreateTodoPopoverProps): JSX.Element {
  /* Wrapped here, not in the view: submitTodo.ts closes on a successful
     create and would otherwise unmount the panel instantly. */
  const { closing, requestClose } = usePopoverExit(onClose);
  const controller = useCreateTodoPopoverController({
    onClose: requestClose,
    onCreated,
  });

  return (
    <CreateTodoPopoverView
      anchorRect={anchorRect}
      onClose={requestClose}
      endTurnAfter={endTurnAfter}
      controller={controller}
      closing={closing}
    />
  );
}
