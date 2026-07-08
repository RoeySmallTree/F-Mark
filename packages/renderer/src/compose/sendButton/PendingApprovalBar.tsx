import type { JSX } from "react";
import { ChevronRight, ShieldAlert, Square } from "lucide-react";
import { ApprovalActions } from "../../cards/ApprovalActions.js";
import type { PendingApprovalAction } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  strip: "strip",
} as const;

interface PendingApprovalBarProps {
  pendingApproval: PendingApprovalAction;
  pendingLabel: string;
  stopLabel: string;
  onInterrupt(): void;
}

export function PendingApprovalBar({
  pendingApproval,
  pendingLabel,
  stopLabel,
  onInterrupt,
}: PendingApprovalBarProps): JSX.Element {
  return (
    <div className="primary-action-wrap primary-action-wrap--pending">
      <div
        className="approval-bar"
        role="group"
        aria-label="Pending permission request"
        data-state="pending"
      >
        <button
          type="button"
          className="approval-bar-status"
          onClick={pendingApproval.onShow}
          aria-label={`${pendingLabel} - show the request`}
        >
          <ShieldAlert size={14} aria-hidden className="approval-bar-shield" />
          <span className="approval-bar-status-label">{pendingLabel}</span>
          <ChevronRight size={13} aria-hidden className="approval-bar-caret" />
        </button>
        <ApprovalActions
          suggestions={pendingApproval.suggestions}
          variant={NO_LOOSE_STRING_VALUES.strip}
          onRespond={(decision, option) =>
            pendingApproval.onRespond(decision, option?.id)
          }
        />
        <button
          type="button"
          className="approval-bar-stop"
          onClick={onInterrupt}
          aria-label={stopLabel}
          title={stopLabel}
        >
          <Square size={10} aria-hidden fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

