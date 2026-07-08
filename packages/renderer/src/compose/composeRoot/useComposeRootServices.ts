import { useComposeAgentControls } from "../useComposeAgentControls.js";
import { useComposeAttachments } from "../useComposeAttachments.js";
import { useComposeForkTarget } from "../useComposeForkTarget.js";
import { useComposeSubmission } from "../useComposeSubmission.js";
import type { ComposeRootCore, ComposeRootServices } from "./types.js";

export function useComposeRootServices(
  core: ComposeRootCore,
): ComposeRootServices {
  const { token, sessionId, userId, currentScope, activeMode } = core;
  const { settings, textDraft, requestScrollToBottom } = core;
  const attachments = useComposeAttachments({
    token,
    sessionId,
    userId,
    currentScope,
    textareaRef: textDraft.textareaRef,
    appendDroppedPath: textDraft.appendPath,
  });
  const submission = useComposeSubmission({
    token,
    sessionId,
    userId,
    currentScope,
    activeMode,
    content: textDraft.content,
    name: textDraft.name,
    selectedMentions: textDraft.selectedMentions,
    attachments: attachments.attachments,
    messageEndsTurn: settings.messageEndsTurn,
    clearAfterSubmit: textDraft.clearAfterSubmit,
    discardAttachments: attachments.discardAttachments,
    requestScrollToBottom,
  });
  const agentControls = useComposeAgentControls({
    token,
    sessionId,
    userId,
    currentScope,
  });
  const forkTarget = useComposeForkTarget(sessionId);

  return {
    attachments,
    submission,
    agentControls,
    forkTarget,
  };
}
