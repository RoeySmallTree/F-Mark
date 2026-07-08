import { type JSX } from "react";
import { useStore } from "../../state/store.js";
import { ComposePopovers } from "../ComposePopovers.js";
import type { ComposeRootController } from "./types.js";

interface Props {
  controller: ComposeRootController;
}

export function ComposeRootPopovers({ controller }: Props): JSX.Element {
  const { token, sessionId, settings, textDraft, popovers } = controller.core;
  const openSkillEditor = useStore((state) => state.openSkillEditor);

  return (
    <ComposePopovers
      activePopover={popovers.activePopover}
      token={token}
      sessionId={sessionId}
      selectedMentionIds={textDraft.selectedMentionIds}
      mentionAnchorRect={popovers.mentionAnchorRect}
      createTodoAnchorRect={popovers.createTodoAnchorRect}
      forkAnchorRect={popovers.forkAnchorRect}
      skillsAnchorRect={popovers.skillsAnchorRect}
      skillsTrigger={popovers.skillsTrigger}
      skillsRefreshKey={popovers.skillsRefreshKey}
      forkTarget={controller.services.forkTarget}
      settings={settings}
      createTodoEndsTurn={controller.actions.createTodoEndsTurn}
      onClosePopover={popovers.closePopover}
      onAddMention={textDraft.addMention}
      onCloseMentions={popovers.closeMentions}
      onCloseCreateTodo={popovers.closeCreateTodo}
      onCloseFork={popovers.closeFork}
      onCloseSkills={popovers.closeSkillsPopover}
      onEditSkill={openSkillEditor}
      onInsertSkill={(text, trigger) => {
        textDraft.insertText(text, trigger ?? undefined);
        popovers.closeSkillsPopover();
      }}
      onCreateTodoCreated={controller.actions.onCreateTodoCreated}
    />
  );
}
