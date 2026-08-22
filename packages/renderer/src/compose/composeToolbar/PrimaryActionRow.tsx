import type { JSX } from "react";
import { SendButton } from "../SendButton.js";
import type { ComposeToolbarProps } from "./types.js";

type PrimaryActionRowProps = Pick<
  ComposeToolbarProps,
  | "activeAgentCount"
  | "activeMode"
  | "attachmentBusy"
  | "busy"
  | "canSubmit"
  | "hasContent"
  | "hasSendableAttachments"
  | "isAgentTurn"
  | "name"
  | "onEndTurn"
  | "onInterrupt"
  | "onSubmit"
  | "pendingApproval"
>;

export function PrimaryActionRow({
  activeAgentCount,
  activeMode,
  attachmentBusy,
  busy,
  canSubmit,
  hasContent,
  hasSendableAttachments,
  isAgentTurn,
  name,
  onEndTurn,
  onInterrupt,
  onSubmit,
  pendingApproval,
}: PrimaryActionRowProps): JSX.Element {
  return (
    <div className="compose-actions-row compose-actions-primary">
      <SendButton
        mode={activeMode}
        name={name}
        canSubmit={canSubmit}
        busy={busy || attachmentBusy}
        hasContent={hasContent || hasSendableAttachments}
        isAgentTurn={isAgentTurn}
        activeAgentCount={activeAgentCount}
        pendingApproval={pendingApproval}
        onSubmit={onSubmit}
        onEndTurn={onEndTurn}
        onInterrupt={onInterrupt}
      />
    </div>
  );
}

