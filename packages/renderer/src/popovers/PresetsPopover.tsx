/* PresetsPopover — public entrypoint for the compose-bar presets menu.
   The controller/model/view split below keeps remote loading, local preset
   rules, and rendering reusable while preserving this component API. */

import { type JSX } from "react";
import { PresetsPopoverView } from "./presetsPopover/PresetsPopoverView.js";
import { usePresetsPopoverController } from "./presetsPopover/usePresetsPopoverController.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
}

export function PresetsPopover({ anchorRect, onClose }: Props): JSX.Element {
  const controller = usePresetsPopoverController(onClose);
  return (
    <PresetsPopoverView
      anchorRect={anchorRect}
      onClose={onClose}
      controller={controller}
    />
  );
}
