import type { JSX } from "react";
import type { ForkSessionResponse, SessionMeta } from "../api/client.js";
import { ForkSessionPopoverView } from "./forkSessionPopover/ForkSessionPopoverView.js";
import { useForkSessionController } from "./forkSessionPopover/useForkSessionController.js";
import { usePopoverExit } from "../popovers/usePopoverExit.js";

interface Props {
  anchorRect: DOMRect | null;
  target: SessionMeta;
  onClose(): void;
  onForked?(response: ForkSessionResponse): void;
}

export function ForkSessionPopover(props: Props): JSX.Element {
  /* Wrapped here, not in the view: actions.ts closes on a successful fork
     and would otherwise unmount the panel instantly. */
  const { closing, requestClose } = usePopoverExit(props.onClose);
  const controller = useForkSessionController({ ...props, onClose: requestClose });

  return (
    <ForkSessionPopoverView
      {...props}
      onClose={requestClose}
      controller={controller}
      closing={closing}
    />
  );
}
