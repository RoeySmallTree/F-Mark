import { type JSX } from "react";
import { ComposeToolbar } from "../ComposeToolbar.js";
import type { ComposeRootController } from "./types.js";

interface Props {
  controller: ComposeRootController;
}

export function ComposeToolbarBridge({ controller }: Props): JSX.Element {
  const { activeMode, sessionId, popovers } = controller.core;
  const { attachments, submission, agentControls } = controller.services;

  return (
    <ComposeToolbar
      activeMode={activeMode}
      sessionId={sessionId}
      canSubmit={submission.canSubmit}
      busy={submission.busy}
      attachmentBusy={attachments.attachmentBusy}
      hasContent={submission.hasContent}
      hasSendableAttachments={submission.hasSendableAttachments}
      isAgentTurn={agentControls.isAgentTurn}
      activeAgentCount={agentControls.activeAgentCount}
      pendingApproval={agentControls.pendingApprovalAction}
      mentionBtnRef={popovers.mentionBtnRef}
      presetsBtnRef={popovers.presetsBtnRef}
      createTodoBtnRef={popovers.createTodoBtnRef}
      forkBtnRef={popovers.forkBtnRef}
      settingsBtnRef={popovers.settingsBtnRef}
      onSubmit={controller.actions.onSubmit}
      onEndTurn={controller.actions.onEndTurn}
      onInterrupt={agentControls.interruptSessionAgents}
      onOpenMentions={popovers.openMentions}
      onOpenPresets={popovers.openPresets}
      onOpenSkills={controller.actions.onOpenSkills}
      onOpenCreateTodo={popovers.openCreateTodo}
      onAttachClick={attachments.handleAttachClick}
      onOpenFork={popovers.openFork}
      onOpenSettings={popovers.openSettings}
    />
  );
}
