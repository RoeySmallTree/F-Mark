import type { JSX } from "react";
import { PendingApprovalBar } from "./sendButton/PendingApprovalBar.js";
import { PrimaryActionButton } from "./sendButton/PrimaryActionButton.js";
import { runPrimaryAction, sendButtonModel } from "./sendButton/model.js";
import type {
  PendingApprovalAction,
  SendButtonProps,
} from "./sendButton/types.js";

const NO_LOOSE_STRING_VALUES = {
  pending: "pending",
} as const;

export type { PendingApprovalAction };

export function SendButton(props: SendButtonProps): JSX.Element {
  const pendingApproval = props.pendingApproval ?? null;
  const model = sendButtonModel(props);

  if (model.kind === NO_LOOSE_STRING_VALUES.pending && pendingApproval !== null) {
    return (
      <PendingApprovalBar
        pendingApproval={pendingApproval}
        pendingLabel={model.pendingLabel}
        stopLabel={model.stopLabel}
        onInterrupt={props.onInterrupt}
      />
    );
  }

  return (
    <PrimaryActionButton
      ariaLabel={model.ariaLabel}
      disabled={model.disabled}
      disabledReason={model.disabledReason}
      kind={model.kind}
      pendingLabel={model.pendingLabel}
      stopLabel={model.stopLabel}
      onClick={() => runPrimaryAction(model.kind, props)}
    />
  );
}
