import type { ReactNode } from "react";
import { FileViewerView } from "./fileViewer/FileViewerView.js";
import { useFileViewerController } from "./fileViewer/useFileViewerController.js";

export interface FileViewerProps {
  /* Slot for chrome controls a specific shell wants to inject, e.g. the modal
     pop-out's close button. Rendered before the diff/pop-out controls. */
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  /* Whether to show the pop-out (maximize) button. False inside ModalShell,
     which is already the popped-out surface. Defaults to true. */
  canPopOut?: boolean;
}

export function FileViewer({
  leadingControls,
  trailingControls,
  canPopOut = true,
}: FileViewerProps): JSX.Element {
  const model = useFileViewerController();

  return (
    <FileViewerView
      model={model}
      leadingControls={leadingControls}
      trailingControls={trailingControls}
      canPopOut={canPopOut}
    />
  );
}
