import type { MouseEvent, MutableRefObject } from "react";
import type { PendingApprovalAction } from "../SendButton.js";
import type { ComposeMode } from "../composeHelpers.js";

export interface ComposeToolbarProps {
  activeMode: ComposeMode;
  sessionId: string | null;
  canSubmit: boolean;
  busy: boolean;
  attachmentBusy: boolean;
  hasContent: boolean;
  hasSendableAttachments: boolean;
  isAgentTurn: boolean;
  activeAgentCount: number;
  pendingApproval: PendingApprovalAction | null;
  mentionBtnRef: MutableRefObject<HTMLButtonElement | null>;
  presetsBtnRef: MutableRefObject<HTMLButtonElement | null>;
  createTodoBtnRef: MutableRefObject<HTMLButtonElement | null>;
  forkBtnRef: MutableRefObject<HTMLButtonElement | null>;
  settingsBtnRef: MutableRefObject<HTMLButtonElement | null>;
  onSubmit(): void;
  onEndTurn(): void;
  onInterrupt(): void;
  onOpenMentions(): void;
  onOpenPresets(): void;
  onOpenSkills(): void;
  onOpenCreateTodo(): void;
  onAttachClick(): void;
  onOpenFork(): void;
  onOpenSettings(e: MouseEvent): void;
}

