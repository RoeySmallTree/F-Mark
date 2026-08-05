import type { JSX } from "react";
import { GitFork } from "lucide-react";
import { Popover } from "../../popovers/Popover.js";
import { ForkSessionFields } from "./ForkSessionFields.js";
import type {
  ForkSessionController,
  ForkSessionPopoverProps,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  close: "Close",
  cancel: "Cancel",
  forking: "Forking…",
  fork: "Fork",
} as const;

interface ForkSessionPopoverViewProps
  extends Pick<ForkSessionPopoverProps, "anchorRect" | "target" | "onClose"> {
  controller: ForkSessionController;
  closing?: boolean;
}

export function ForkSessionPopoverView({
  anchorRect,
  target,
  onClose,
  controller,
  closing,
}: ForkSessionPopoverViewProps): JSX.Element {
  return (
    <Popover
      anchorRect={anchorRect}
      placement="bottom-end"
      onClose={onClose}
      closing={closing}
      className="fork-session-pop"
      ariaLabel="Fork session"
    >
      <form className="fork-session-form" onSubmit={controller.onSubmit}>
        <ForkSessionHeader />
        <ForkSessionFields target={target} controller={controller} />
        <ForkSessionActions controller={controller} onClose={onClose} />
      </form>
    </Popover>
  );
}

function ForkSessionHeader(): JSX.Element {
  return (
    <div className="pop-head">
      <GitFork size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
      Fork Session
    </div>
  );
}

function ForkSessionActions({
  controller,
  onClose,
}: {
  controller: ForkSessionController;
  onClose(): void;
}): JSX.Element {
  const hasResult = controller.result !== null;

  return (
    <div className="pop-foot fork-session-actions">
      <button
        type="button"
        className="btn-ghost"
        onClick={onClose}
        disabled={controller.busy}
      >
        {hasResult ? NO_LOOSE_STRING_VALUES.close : NO_LOOSE_STRING_VALUES.cancel}
      </button>
      {hasResult ? null : (
        <button
          type="submit"
          className="btn-solid"
          disabled={!controller.canSubmit}
        >
          {controller.busy ? NO_LOOSE_STRING_VALUES.forking : NO_LOOSE_STRING_VALUES.fork}
        </button>
      )}
    </div>
  );
}
