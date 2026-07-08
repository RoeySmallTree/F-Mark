import { type JSX } from "react";
import type { ProseMention } from "@f-mark/shared";
import type { SessionMeta } from "../api/client.js";
import { AgentMentionPicker } from "../components/AgentMentionPicker.js";
import { ForkSessionPopover } from "../components/ForkSessionPopover.js";
import { resolveActiveAgent } from "../modals/skills/active-agent.js";
import { PresetsPopover } from "../popovers/PresetsPopover.js";
import { useStore } from "../state/store.js";
import { ComposeSettingsPopover } from "./ComposeSettingsPopover.js";
import { CreateTodoPopover } from "./CreateTodoPopover.js";
import { SkillsPopover } from "./SkillsPopover.js";
import type { SkillTrigger } from "./skillsTrigger.js";
import type { ComposeSettingsState } from "./useComposeSettings.js";

const NO_LOOSE_STRING_VALUES = {
  presets: "presets",
  composeSettings: "compose-settings",
} as const;

interface Props {
  activePopover: ReturnType<typeof useStore.getState>["activePopover"];
  token: string | null;
  sessionId: string | null;
  selectedMentionIds: Set<string>;
  mentionAnchorRect: DOMRect | null;
  createTodoAnchorRect: DOMRect | null;
  forkAnchorRect: DOMRect | null;
  skillsAnchorRect: DOMRect | null;
  skillsTrigger: SkillTrigger | null;
  skillsRefreshKey: number;
  forkTarget: SessionMeta | null;
  settings: ComposeSettingsState;
  createTodoEndsTurn: boolean;
  onClosePopover(): void;
  onAddMention(mention: ProseMention): void;
  onCloseMentions(): void;
  onCloseCreateTodo(): void;
  onCloseFork(): void;
  onCloseSkills(): void;
  onEditSkill: ReturnType<typeof useStore.getState>["openSkillEditor"];
  onInsertSkill(text: string, trigger: SkillTrigger | null): void;
  onCreateTodoCreated(): Promise<void>;
}

export function ComposePopovers({
  activePopover,
  token,
  sessionId,
  selectedMentionIds,
  mentionAnchorRect,
  createTodoAnchorRect,
  forkAnchorRect,
  skillsAnchorRect,
  skillsTrigger,
  skillsRefreshKey,
  forkTarget,
  settings,
  createTodoEndsTurn,
  onClosePopover,
  onAddMention,
  onCloseMentions,
  onCloseCreateTodo,
  onCloseFork,
  onCloseSkills,
  onEditSkill,
  onInsertSkill,
  onCreateTodoCreated,
}: Props): JSX.Element {
  const participants = useStore((s) => s.participants);
  const activeAgent = resolveActiveAgent(participants, sessionId);

  return (
    <>
      {activePopover.key === NO_LOOSE_STRING_VALUES.presets ? (
        <PresetsPopover
          anchorRect={activePopover.anchorRect}
          onClose={onClosePopover}
        />
      ) : null}
      {mentionAnchorRect !== null ? (
        <AgentMentionPicker
          anchorRect={mentionAnchorRect}
          sessionId={sessionId}
          token={token}
          participants={participants}
          selectedIds={selectedMentionIds}
          onSelect={(mention) => {
            onAddMention(mention);
            onCloseMentions();
          }}
          onClose={onCloseMentions}
        />
      ) : null}
      {activePopover.key === NO_LOOSE_STRING_VALUES.composeSettings ? (
        <ComposeSettingsPopover
          anchorRect={activePopover.anchorRect}
          onClose={onClosePopover}
          messageEndsTurn={settings.messageEndsTurn}
          onMessageEndsTurnChange={settings.handleMessageEndsTurnChange}
          commentEndsTurn={settings.commentEndsTurn}
          onCommentEndsTurnChange={settings.handleCommentEndsTurnChange}
          choiceEndsTurn={settings.choiceEndsTurn}
          onChoiceEndsTurnChange={settings.handleChoiceEndsTurnChange}
          enterToSend={settings.enterToSend}
          onEnterToSendChange={settings.handleEnterToSendChange}
        />
      ) : null}
      {createTodoAnchorRect !== null ? (
        <CreateTodoPopover
          anchorRect={createTodoAnchorRect}
          onClose={onCloseCreateTodo}
          endTurnAfter={createTodoEndsTurn}
          onCreated={onCreateTodoCreated}
        />
      ) : null}
      {forkAnchorRect !== null && forkTarget !== null ? (
        <ForkSessionPopover
          anchorRect={forkAnchorRect}
          target={forkTarget}
          onClose={onCloseFork}
        />
      ) : null}
      {skillsAnchorRect !== null ? (
        <SkillsPopover
          activeAgent={activeAgent}
          anchorRect={skillsAnchorRect}
          query={skillsTrigger?.query ?? ""}
          refreshKey={skillsRefreshKey}
          token={token}
          trigger={skillsTrigger}
          onClose={onCloseSkills}
          onEdit={(skill) => {
            onCloseSkills();
            onEditSkill(skill);
          }}
          onInsert={onInsertSkill}
        />
      ) : null}
    </>
  );
}
