/* PrimaryAction — the single morphing action button on the right side of
   the compose stage. Replaces the prior Send | End-turn cluster.

   One slot, four labels. The slot never grows or shrinks: all four labels
   live in the same grid cell, sized to the longest, and crossfade between
   each other on state change. No layout shifts.

   State derivation (priority order):
     - Agent's turn (any agent online/stale + currentTurn === "ag")
         → "Stop run"  · click = onInterrupt
     - mode === "comment"
         → "Post comment"  · click = onSubmit  · disabled if !canSubmit
     - mode === "message" && hasContent
         → "Send"  · click = onSubmit  · disabled if !canSubmit
     - mode === "named"
         → "End turn"  · click = onSubmit  · disabled if !canSubmit
     - otherwise (mode === "message" empty)
         → "End turn"  · click = onEndTurn  · always enabled when not busy

   The "Stop run" state recolors the button to the agent palette so the
   user immediately recognizes it's no longer the same action — a quiet
   amber tint, not a loud red alarm. F-Mark stays calm even when
   interrupting. */

import { useMemo, type JSX, type ReactNode } from "react";
import { Check, CornerDownLeft, Eye, ShieldAlert, Square, X } from "lucide-react";

type Kind = "pending" | "stop" | "send" | "post-comment" | "end-turn";

export interface PendingApprovalAction {
  requestId: string;
  participantId: string;
  count: number;
  options: Array<{
    id: string;
    label: string;
    decision: "approve" | "deny";
  }>;
  onShow(): void;
  onApprove(): void;
  onDeny(): void;
  onOption(option: { id: string; decision: "approve" | "deny" }): void;
}

interface Props {
  mode: "message" | "named" | "comment";
  canSubmit: boolean;
  busy: boolean;
  hasContent: boolean;
  isAgentTurn: boolean;
  activeAgentCount?: number;
  pendingApproval?: PendingApprovalAction | null;
  onSubmit(): void;
  onEndTurn(): void;
  onInterrupt(): void;
}

function deriveKind(
  mode: Props["mode"],
  hasContent: boolean,
  isAgentTurn: boolean,
  hasPendingApproval: boolean,
): Kind {
  if (hasPendingApproval) return "pending";
  if (isAgentTurn) return "stop";
  if (mode === "comment") return "post-comment";
  if (mode === "message" && hasContent) return "send";
  if (mode === "named") return "end-turn";
  return "end-turn";
}

export function SendButton({
  mode,
  canSubmit,
  busy,
  hasContent,
  isAgentTurn,
  activeAgentCount = 0,
  pendingApproval = null,
  onSubmit,
  onEndTurn,
  onInterrupt,
}: Props): JSX.Element {
  const kind = deriveKind(mode, hasContent, isAgentTurn, pendingApproval !== null);
  const stopLabel = activeAgentCount > 1 ? `Stop ${activeAgentCount} agents` : "Stop run";
  const pendingLabel = useMemo(() => {
    if (pendingApproval === null || pendingApproval.count <= 1) {
      return "Pending approval";
    }
    return `${pendingApproval.count} approvals`;
  }, [pendingApproval]);

  /* Disabled per kind. Stop is always clickable while agent is running.
     End-turn is clickable unless we're mid-request. The submit kinds
     (send / post-comment / named end-turn) gate on canSubmit. */
  const disabled =
    kind === "pending"
      ? false
      : kind === "stop"
      ? false
      : kind === "end-turn" && mode === "message"
        ? busy
        : busy || !canSubmit;

  const ariaLabel =
    kind === "stop"
      ? `${stopLabel} — interrupt active agents`
      : kind === "pending"
        ? "Pending approval actions"
      : kind === "send"
        ? "Send message"
        : kind === "post-comment"
          ? "Post comment"
          : mode === "named"
            ? "End turn with named contribution"
            : "End turn";

  function handleClick(): void {
    if (kind === "pending") return;
    if (kind === "stop") return onInterrupt();
    if (kind === "send" || kind === "post-comment") return onSubmit();
    if (mode === "named") return onSubmit();
    return onEndTurn();
  }

  if (kind === "pending" && pendingApproval !== null) {
    const approvalOptions = pendingApproval.options;
    return (
      <div className="primary-action-wrap primary-action-wrap--pending">
        <div
          className="pending-approval-strip"
          role="group"
          aria-label="Pending approval actions"
          data-state="pending"
        >
          <span className="pending-approval-status">
            <ShieldAlert size={13} aria-hidden />
            <span>{pendingLabel}</span>
          </span>
          <button
            type="button"
            className="pending-approval-button pending-approval-button--show"
            onClick={pendingApproval.onShow}
          >
            <Eye size={13} aria-hidden />
            <span>Show request</span>
          </button>
          <div className="pending-approval-options" aria-label="Approval choices">
            {approvalOptions.length > 0 ? (
              approvalOptions.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`pending-approval-button pending-approval-choice is-${option.decision}`}
                  onClick={() => pendingApproval.onOption(option)}
                  aria-label={`${option.decision === "approve" ? "Approve" : "Deny"}: ${option.label}`}
                >
                  {option.decision === "approve" ? (
                    <Check size={13} aria-hidden />
                  ) : (
                    <X size={13} aria-hidden />
                  )}
                  <span>{option.label}</span>
                </button>
              ))
            ) : (
              <>
                <button
                  type="button"
                  className="pending-approval-button pending-approval-choice is-approve"
                  onClick={pendingApproval.onApprove}
                >
                  <Check size={13} aria-hidden />
                  <span>Approve</span>
                </button>
                <button
                  type="button"
                  className="pending-approval-button pending-approval-choice is-deny"
                  onClick={pendingApproval.onDeny}
                >
                  <X size={13} aria-hidden />
                  <span>Deny</span>
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            className="pending-approval-button pending-approval-button--stop"
            onClick={onInterrupt}
          >
            <Square size={11} aria-hidden fill="currentColor" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="primary-action-wrap">
      <button
        type="button"
        className={`primary-action is-${kind}`}
        onClick={handleClick}
        disabled={disabled}
        aria-label={ariaLabel}
        data-state={kind}
      >
        <Label active={kind === "pending"}>
          <ShieldAlert size={13} aria-hidden />
          <span>{pendingLabel}</span>
        </Label>
        <Label active={kind === "stop"}>
          <Square size={12} aria-hidden fill="currentColor" />
          <span>{stopLabel}</span>
        </Label>
        <Label active={kind === "send"}>
          <span>Send</span>
          <CornerDownLeft size={13} aria-hidden className="action-arrow" />
        </Label>
        <Label active={kind === "post-comment"}>
          <span>Post comment</span>
        </Label>
        <Label active={kind === "end-turn"}>
          <span>End turn</span>
          <CornerDownLeft size={13} aria-hidden />
        </Label>
      </button>
    </div>
  );
}

function Label({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={`primary-action__label${active ? " is-active" : ""}`}
      aria-hidden={!active}
    >
      {children}
    </span>
  );
}
