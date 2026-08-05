import type { JSX } from "react";
import type { ForkSessionResponse, SessionMeta } from "../api/client.js";
import { ForkSessionPopoverView } from "./forkSessionPopover/ForkSessionPopoverView.js";
import { useForkSessionController } from "./forkSessionPopover/useForkSessionController.js";

interface Props {
  anchorRect: DOMRect | null;
  target: SessionMeta;
  onClose(): void;
  closing?: boolean;
  onForked?(response: ForkSessionResponse): void;
}

export function ForkSessionPopover(props: Props): JSX.Element {
  const controller = useForkSessionController(props);

  return (
    <ForkSessionPopoverView
      {...props}
      controller={controller}
      closing={props.closing ?? false}
    />
  );
}
