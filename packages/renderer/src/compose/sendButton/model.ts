import { NAMED_MODE_NAME_REQUIRED_MESSAGE } from "../composeHelpers.js";
import {
  SEND_BUTTON_KINDS,
  SEND_BUTTON_MODES,
  type PendingApprovalAction,
  type SendButtonKind,
  type SendButtonProps,
} from "./types.js";

export interface SendButtonModel {
  ariaLabel: string;
  disabled: boolean;
  disabledReason: string | null;
  kind: SendButtonKind;
  pendingLabel: string;
  stopLabel: string;
}

function deriveKind(options: {
  hasContent: boolean;
  hasPendingApproval: boolean;
  isAgentTurn: boolean;
  mode: SendButtonProps["mode"];
}): SendButtonKind {
  if (options.hasPendingApproval) return SEND_BUTTON_KINDS.pending;
  if (options.isAgentTurn) return SEND_BUTTON_KINDS.stop;
  if (options.mode === SEND_BUTTON_MODES.comment) {
    return SEND_BUTTON_KINDS.postComment;
  }
  if (options.mode === SEND_BUTTON_MODES.message && options.hasContent) {
    return SEND_BUTTON_KINDS.send;
  }
  return SEND_BUTTON_KINDS.endTurn;
}

function pendingLabel(
  pendingApproval: PendingApprovalAction | null,
): string {
  return pendingApproval !== null && pendingApproval.count > 1
    ? `${pendingApproval.count} approvals`
    : "Pending approval";
}

function stopLabel(activeAgentCount: number): string {
  return activeAgentCount > 1 ? `Stop ${activeAgentCount} agents` : "Stop run";
}

function disabledForKind(options: {
  busy: boolean;
  canSubmit: boolean;
  kind: SendButtonKind;
  mode: SendButtonProps["mode"];
}): boolean {
  if (
    options.kind === SEND_BUTTON_KINDS.pending ||
    options.kind === SEND_BUTTON_KINDS.stop
  ) {
    return false;
  }
  if (
    options.kind === SEND_BUTTON_KINDS.endTurn &&
    options.mode === SEND_BUTTON_MODES.message
  ) {
    return options.busy;
  }
  return options.busy || !options.canSubmit;
}

/* Only the named-mode-missing-name case gets a reason: it's the one silent
   dead-button state (M10). Other disabled states (busy, no session) already
   read as clearly "not ready yet" from the button's own label/animation. */
function disabledReasonForKind(options: {
  disabled: boolean;
  mode: SendButtonProps["mode"];
  name: string;
}): string | null {
  if (!options.disabled) return null;
  if (options.mode !== SEND_BUTTON_MODES.named) return null;
  if (options.name.trim().length > 0) return null;
  return NAMED_MODE_NAME_REQUIRED_MESSAGE;
}

function ariaLabelForKind(options: {
  kind: SendButtonKind;
  mode: SendButtonProps["mode"];
  stopLabel: string;
}): string {
  switch (options.kind) {
    case SEND_BUTTON_KINDS.stop:
      return `${options.stopLabel} - interrupt active agents`;
    case SEND_BUTTON_KINDS.pending:
      return "Pending approval actions";
    case SEND_BUTTON_KINDS.send:
      return "Send message";
    case SEND_BUTTON_KINDS.postComment:
      return "Post comment";
    case SEND_BUTTON_KINDS.endTurn:
      return options.mode === SEND_BUTTON_MODES.named
        ? "End turn with named contribution"
        : "End turn";
  }
}

export function sendButtonModel(props: SendButtonProps): SendButtonModel {
  const kind = deriveKind({
    hasContent: props.hasContent,
    hasPendingApproval: props.pendingApproval !== null,
    isAgentTurn: props.isAgentTurn,
    mode: props.mode,
  });
  const stop = stopLabel(props.activeAgentCount ?? 0);
  const disabled = disabledForKind({
    busy: props.busy,
    canSubmit: props.canSubmit,
    kind,
    mode: props.mode,
  });

  return {
    ariaLabel: ariaLabelForKind({ kind, mode: props.mode, stopLabel: stop }),
    disabled,
    disabledReason: disabledReasonForKind({
      disabled,
      mode: props.mode,
      name: props.name,
    }),
    kind,
    pendingLabel: pendingLabel(props.pendingApproval ?? null),
    stopLabel: stop,
  };
}

export function runPrimaryAction(
  kind: SendButtonKind,
  props: Pick<SendButtonProps, "mode" | "onEndTurn" | "onInterrupt" | "onSubmit">,
): void {
  if (kind === SEND_BUTTON_KINDS.pending) return;
  if (kind === SEND_BUTTON_KINDS.stop) return props.onInterrupt();
  if (
    kind === SEND_BUTTON_KINDS.send ||
    kind === SEND_BUTTON_KINDS.postComment ||
    props.mode === SEND_BUTTON_MODES.named
  ) {
    return props.onSubmit();
  }
  return props.onEndTurn();
}
