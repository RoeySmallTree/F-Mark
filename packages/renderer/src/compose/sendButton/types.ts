import type { AccessRequestSuggestion } from "@f-mark/shared";

export type SendButtonKind =
  | "pending"
  | "stop"
  | "send"
  | "post-comment"
  | "end-turn";

export const SEND_BUTTON_KINDS = {
  pending: "pending",
  stop: "stop",
  send: "send",
  postComment: "post-comment",
  endTurn: "end-turn",
} as const satisfies Record<string, SendButtonKind>;

export interface PendingApprovalAction {
  requestId: string;
  participantId: string;
  count: number;
  suggestions: AccessRequestSuggestion[];
  onShow(): void;
  onRespond(decision: "approve" | "deny", optionId?: string): void;
}

export interface SendButtonProps {
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

export const SEND_BUTTON_MODES = {
  message: "message",
  named: "named",
  comment: "comment",
} as const satisfies Record<string, SendButtonProps["mode"]>;
