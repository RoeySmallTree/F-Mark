/* usePopoverExit — keeps a popover mounted long enough to animate out.

   Every popover eased in over --dur-base and then vanished between two
   frames. Asymmetric motion is the classic "assembled, not made" tell.

   The close callback is wrapped at the MOUNT SITE rather than inside
   Popover, because a popover also closes from its own content: selecting a
   preset calls onClose directly (usePresetsPopoverController.ts:142) and
   never passes through Popover's backdrop or Escape handlers. The mount site
   is the only place that owns every close path, so it is the only place the
   wrap is complete.

   EXIT_MS must stay in step with --dur-fast in tokens.css. CSS owns the
   motion; this owns only how long the element stays mounted. If the two
   disagree the panel is torn out mid-animation. */

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../shell/agentWorkingStrip/timing.js";

const EXIT_MS = 160;

export function usePopoverExit(onClose: () => void): {
  closing: boolean;
  requestClose: () => void;
} {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  /* Reduced motion closes immediately: holding the panel on screen for
     160ms with no animation is a delay, not a transition. */
  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    if (timer.current !== null) return;
    setClosing(true);
    timer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  return { closing, requestClose };
}
