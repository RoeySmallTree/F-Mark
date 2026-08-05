/* PresetsPopover — public entrypoint for the compose-bar presets menu.
   The controller/model/view split below keeps remote loading, local preset
   rules, and rendering reusable while preserving this component API. */

import { type JSX } from "react";
import { PresetsPopoverView } from "./presetsPopover/PresetsPopoverView.js";
import { usePresetsPopoverController } from "./presetsPopover/usePresetsPopoverController.js";
import { usePopoverExit } from "./usePopoverExit.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
}

export function PresetsPopover({ anchorRect, onClose }: Props): JSX.Element {
  /* Wrapped here, not in the view: the controller closes on select
     (usePresetsPopoverController.ts) and would otherwise unmount instantly. */
  const { closing, requestClose } = usePopoverExit(onClose);
  const controller = usePresetsPopoverController(requestClose);
  return (
    <PresetsPopoverView
      anchorRect={anchorRect}
      onClose={requestClose}
      controller={controller}
      closing={closing}
    />
  );
}
