import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import type { RootScope, SessionMeta } from "../../api/client.js";
import type { ComposeMode } from "../composeHelpers.js";
import type { ComposeAgentControlsState } from "../useComposeAgentControls.js";
import type { ComposeAttachmentsState } from "../useComposeAttachments.js";
import type { ComposePopoverState } from "../useComposePopovers.js";
import type { ComposeSettingsState } from "../useComposeSettings.js";
import type { ComposeSubmissionState } from "../useComposeSubmission.js";
import type { ComposeTextDraftState } from "../useComposeTextDraft.js";

export type ComposeStoreMode = "message" | "named" | "comment";

export interface ComposeRootCore {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  activeMode: ComposeMode;
  currentScope: RootScope | null;
  setMode(mode: ComposeStoreMode): void;
  requestScrollToBottom(): void;
  settings: ComposeSettingsState;
  textDraft: ComposeTextDraftState;
  popovers: ComposePopoverState;
}

export interface ComposeRootServices {
  attachments: ComposeAttachmentsState;
  submission: ComposeSubmissionState;
  agentControls: ComposeAgentControlsState;
  forkTarget: SessionMeta | null;
}

export interface ComposeRootActions {
  createTodoEndsTurn: boolean;
  placeholder: string;
  onTextareaChange(e: ChangeEvent<HTMLTextAreaElement>): void;
  onTextareaClick(e: MouseEvent<HTMLTextAreaElement>): void;
  onTextareaKey(e: KeyboardEvent<HTMLTextAreaElement>): void;
  onOpenSkills(): void;
  onSubmit(): void;
  onEndTurn(): void;
  onCreateTodoCreated(): Promise<void>;
}

export interface ComposeRootController {
  core: ComposeRootCore;
  services: ComposeRootServices;
  actions: ComposeRootActions;
}
