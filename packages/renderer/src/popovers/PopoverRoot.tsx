const NO_LOOSE_STRING_VALUES = {
  presets: "presets",
} as const;

/* PopoverRoot — single mount point for every popover that uses
   store.activePopover. Mirrors ModalRoot's pattern. Each popover key in
   PopoverKey routes to its component here. The corresponding owner panel
   (e.g. RightLog for log-filter) keeps responsibility for opening the
   popover (so it can pass its filter draft) and applying the result. To
   keep RightLog backwards-compatible after the refactor, this root only
   renders popovers whose state is fully derivable from the store —
   currently just `presets`. The `log-filter` popover stays owned by
   RightLog because it needs the local filter state.

   This split lets P8's presets popover live anywhere the user opens it
   (compose bar, $mod+P hotkey) without forcing the consumer to mount a
   popover root. */

import type { JSX } from "react";
import { useStore } from "../state/store.js";
import { PresetsPopover } from "./PresetsPopover.js";
import { useDeferredUnmount, useHeldAnchorRect } from "./useDeferredUnmount.js";

export function PopoverRoot(): JSX.Element | null {
  const activePopover = useStore((s) => s.activePopover);
  const closePopover = useStore((s) => s.closePopover);

  const presetsOpen = activePopover.key === NO_LOOSE_STRING_VALUES.presets;
  const presets = useDeferredUnmount(presetsOpen);
  const rect = useHeldAnchorRect(presetsOpen ? activePopover.anchorRect : null);

  if (presets.mounted) {
    return (
      <PresetsPopover
        anchorRect={rect}
        onClose={closePopover}
        closing={presets.closing}
      />
    );
  }
  /* `log-filter` is intentionally NOT handled here — RightLog owns the
     filter draft + apply callback and renders its own popover. `skills`
     is reserved for P9. */
  return null;
}
